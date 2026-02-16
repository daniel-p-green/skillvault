import fs from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';

import type { ExportReport, Finding, ReasonCode } from '../contracts.js';
import { CONTRACT_VERSION } from '../contracts.js';
import { nowIso, DETERMINISTIC_CREATED_AT_ISO } from './time.js';
import { readBundle } from './bundle.js';
import { bundleSha256FromEntries, sha256Hex } from './hash.js';
import { comparePathBytes } from '../bundle/hashing.js';
import type { PolicyProfileV1, PolicyV1 } from '../policy-v1.js';
import { loadPolicyV1 } from './policy-loader.js';
import { detectManifestFromEntries } from '../manifest/manifest.js';
import { tokenCountNormalized } from '../text/normalize.js';

export interface ExportOptions {
  outPath: string;
  policyPath?: string;
  profile: string;
  deterministic: boolean;
}

function addFinding(findings: Finding[], code: ReasonCode, severity: Finding['severity'], message: string, extra?: Partial<Finding>): void {
  findings.push({ code, severity, message, ...extra });
}

function normalizeExportRelPath(p: string): string {
  // Convert to posix, strip leading './'
  let out = p.replace(/\\/g, '/');
  while (out.startsWith('./')) out = out.slice(2);

  // Reject absolute paths and empty
  if (out.length === 0) throw new Error('Empty path');
  if (out.startsWith('/')) throw new Error(`Absolute paths are forbidden: ${p}`);
  if (/^[A-Za-z]:\//.test(out)) throw new Error(`Drive-absolute paths are forbidden: ${p}`);

  // Reject path traversal
  const parts = out.split('/');
  if (parts.some((seg) => seg === '..')) throw new Error(`Path traversal is forbidden: ${p}`);
  if (parts.some((seg) => seg.length === 0)) throw new Error(`Invalid path segment: ${p}`);

  return parts.join('/');
}

async function walkDirStrict(rootDir: string, dir: string, out: string[]): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);

    // NOTE: Dirent.isSymbolicLink() is not always reliable across platforms; use lstat.
    const st = await fs.lstat(full);
    if (st.isSymbolicLink()) {
      throw new Error(`Symlinks are forbidden in strict_v0 export: ${path.relative(rootDir, full)}`);
    }

    if (ent.isDirectory()) {
      await walkDirStrict(rootDir, full, out);
    } else if (ent.isFile()) {
      const rel = path.relative(rootDir, full);
      const relPosix = normalizeExportRelPath(rel);
      out.push(relPosix);
    }
  }
}

function builtInStrictV0Profile(): PolicyProfileV1 {
  return {
    constraints: {
      exactly_one_manifest: true
    }
  };
}

function mergeProfile(base: PolicyProfileV1, overlay?: PolicyProfileV1): PolicyProfileV1 {
  if (!overlay) return base;
  return {
    gates: { ...base.gates, ...overlay.gates },
    capabilities: { ...base.capabilities, ...overlay.capabilities },
    constraints: { ...base.constraints, ...overlay.constraints }
  };
}

function selectPolicyProfile(policy: PolicyV1 | undefined, profileName: string): PolicyProfileV1 {
  const builtIn = profileName === 'strict_v0' ? builtInStrictV0Profile() : {};
  const topLevel: PolicyProfileV1 = policy
    ? {
        gates: policy.gates,
        capabilities: policy.capabilities,
        constraints: policy.constraints
      }
    : {};
  const named = policy?.profiles?.[profileName];

  return mergeProfile(mergeProfile(builtIn, topLevel), named);
}

function enforceConstraintsFromProfile(findings: Finding[], profile: PolicyProfileV1, files: Array<{ path: string; size: number; bytes?: Uint8Array }>): void {
  const constraints = profile.constraints;
  if (!constraints) return;

  if (constraints.exactly_one_manifest) {
    const { findings: manifestFindings } = detectManifestFromEntries(files);
    findings.push(...manifestFindings);
  }

  if (typeof constraints.bundle_size_limit_bytes === 'number') {
    const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
    if (totalBytes > constraints.bundle_size_limit_bytes) {
      addFinding(findings, 'CONSTRAINT_BUNDLE_SIZE_LIMIT', 'error', `Bundle size ${totalBytes} exceeds limit ${constraints.bundle_size_limit_bytes}`, {
        details: { total_bytes: totalBytes, limit_bytes: constraints.bundle_size_limit_bytes }
      });
    }
  }

  if (typeof constraints.file_size_limit_bytes === 'number') {
    for (const f of files) {
      if (f.size > constraints.file_size_limit_bytes) {
        addFinding(findings, 'CONSTRAINT_FILE_SIZE_LIMIT', 'error', `File ${f.path} size ${f.size} exceeds limit ${constraints.file_size_limit_bytes}`, {
          path: f.path,
          details: { size: f.size, limit_bytes: constraints.file_size_limit_bytes }
        });
      }
    }
  }

  if (typeof constraints.max_manifest_tokens_warn === 'number' || typeof constraints.max_manifest_tokens_fail === 'number') {
    const manifestPath = detectManifestFromEntries(files).manifest?.path;
    const manifest = manifestPath ? files.find((f) => f.path === manifestPath) : undefined;
    if (manifest?.bytes) {
      const text = new TextDecoder('utf-8', { fatal: false }).decode(manifest.bytes);
      const tokens = tokenCountNormalized(text);

      if (typeof constraints.max_manifest_tokens_warn === 'number' && tokens > constraints.max_manifest_tokens_warn) {
        addFinding(findings, 'CONSTRAINT_TOKEN_LIMIT_WARN', 'warn', `Manifest token count ${tokens} exceeds warn threshold ${constraints.max_manifest_tokens_warn}`, {
          path: manifest.path,
          details: { tokens }
        });
      }

      if (typeof constraints.max_manifest_tokens_fail === 'number' && tokens > constraints.max_manifest_tokens_fail) {
        addFinding(findings, 'CONSTRAINT_TOKEN_LIMIT_FAIL', 'error', `Manifest token count ${tokens} exceeds fail threshold ${constraints.max_manifest_tokens_fail}`, {
          path: manifest.path,
          details: { tokens }
        });
      }
    }
  }
}

function enforcePathSafety(findings: Finding[], relPath: string): void {
  try {
    normalizeExportRelPath(relPath);
  } catch (err) {
    addFinding(findings, 'CONSTRAINT_UNSAFE_PATH', 'error', `Unsafe path: ${relPath}`, {
      path: relPath,
      details: { error: err instanceof Error ? err.message : String(err) }
    });
  }
}

export async function exportBundleToZip(bundleDir: string, opts: ExportOptions): Promise<ExportReport> {
  const findings: Finding[] = [];

  const policy = await loadPolicyV1(opts.policyPath);
  const profile = selectPolicyProfile(policy ?? undefined, opts.profile);

  // Gather files from directory with strict checks.
  const relPaths: string[] = [];
  try {
    await walkDirStrict(bundleDir, bundleDir, relPaths);
  } catch (err) {
    addFinding(findings, 'CONSTRAINT_SYMLINK_FORBIDDEN', 'error', err instanceof Error ? err.message : String(err));
  }

  relPaths.sort(comparePathBytes);

  const fileObjs: Array<{ path: string; size: number; bytes: Uint8Array; sha256: string }> = [];
  for (const rel of relPaths) {
    enforcePathSafety(findings, rel);

    const full = path.join(bundleDir, ...rel.split('/'));
    const bytes = await fs.readFile(full);
    fileObjs.push({ path: rel, size: bytes.byteLength, bytes, sha256: sha256Hex(bytes) });
  }

  enforceConstraintsFromProfile(findings, profile, fileObjs);

  const hasErrorBeforeWrite = findings.some((f) => f.severity === 'error');
  if (hasErrorBeforeWrite) {
    return {
      contract_version: CONTRACT_VERSION,
      created_at: nowIso(opts.deterministic),
      profile: opts.profile,
      out_path: opts.outPath,
      bundle_sha256: sha256Hex(new Uint8Array()),
      files: fileObjs.map((f) => ({ path: f.path, size: f.size, sha256: f.sha256 })),
      findings,
      validated: false
    };
  }

  // Write zip deterministically by adding entries in sorted path order.
  const zip = new AdmZip();

  const fixedTime = new Date(DETERMINISTIC_CREATED_AT_ISO);

  for (const f of fileObjs) {
    const norm = normalizeExportRelPath(f.path);
    zip.addFile(norm, Buffer.from(f.bytes));
    const entry = zip.getEntry(norm);
    if (entry && opts.deterministic) {
      // adm-zip uses a JS Date for entry header timestamps.
      (entry as any).header.time = fixedTime;
    }
  }

  // Ensure output directory exists.
  await fs.mkdir(path.dirname(opts.outPath), { recursive: true });
  zip.writeZip(opts.outPath);

  // Re-open and validate the created zip using the same constraints.
  const reopened = await readBundle(opts.outPath);
  const reopenedFiles = reopened.files.map((f) => ({
    path: f.path,
    size: f.bytes.byteLength,
    bytes: f.bytes,
    sha256: sha256Hex(f.bytes)
  }));
  reopenedFiles.sort((a, b) => comparePathBytes(a.path, b.path));

  for (const f of reopenedFiles) {
    enforcePathSafety(findings, f.path);
  }

  enforceConstraintsFromProfile(findings, profile, reopenedFiles);

  const bundle_sha256 = bundleSha256FromEntries(reopenedFiles.map((f) => ({ path: f.path, sha256: f.sha256 })));

  const hasError = findings.some((f) => f.severity === 'error');

  return {
    contract_version: CONTRACT_VERSION,
    created_at: nowIso(opts.deterministic),
    profile: opts.profile,
    out_path: opts.outPath,
    bundle_sha256,
    files: reopenedFiles.map((f) => ({ path: f.path, size: f.size, sha256: f.sha256 })),
    findings,
    validated: !hasError
  };
}
