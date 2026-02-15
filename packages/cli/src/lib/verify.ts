import fs from 'node:fs/promises';

import type { Finding, PolicyDecision, ReasonCode, VerifyReport } from '../contracts.js';
import { CONTRACT_VERSION } from '../contracts.js';
import { decidePolicy } from './policy.js';
import { readBundle } from './bundle.js';
import { bundleSha256FromEntries, sha256Hex } from './hash.js';
import { nowIso } from './time.js';
import { loadPolicyV1 } from './policy-loader.js';
import type { PolicyProfileV1 } from '../policy-v1.js';
import { detectManifestFromEntries } from '../manifest/manifest.js';
import { tokenCountNormalized } from '../text/normalize.js';

export interface VerifyOptions {
  receiptPath: string;
  policyPath?: string;
  offline: boolean;
  deterministic: boolean;
}

interface MinimalReceipt {
  contract_version?: string;
  bundle_sha256: string;
  files: Array<{ path: string; sha256: string; size: number }>;
  manifest?: { path: string; sha256: string; size: number };
  scan?: {
    capabilities?: string[];
    risk_score?: { base_risk: number; change_risk: number; policy_delta: number; total: number };
  };
}

function addFinding(findings: Finding[], code: ReasonCode, severity: Finding['severity'], message: string, extra?: Partial<Finding>): void {
  findings.push({ code, severity, message, ...extra });
}

async function readReceipt(receiptPath: string): Promise<{ receipt?: MinimalReceipt; errorFinding?: Finding }> {
  let raw: string;
  try {
    raw = await fs.readFile(receiptPath, 'utf8');
  } catch (err) {
    return {
      errorFinding: {
        code: 'RECEIPT_PARSE_ERROR',
        severity: 'error',
        message: `Failed to read receipt: ${receiptPath}`,
        details: { error: err instanceof Error ? err.message : String(err) }
      }
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (err) {
    return {
      errorFinding: {
        code: 'RECEIPT_PARSE_ERROR',
        severity: 'error',
        message: `Failed to parse receipt JSON: ${receiptPath}`,
        details: { error: err instanceof Error ? err.message : String(err) }
      }
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      errorFinding: {
        code: 'RECEIPT_PARSE_ERROR',
        severity: 'error',
        message: 'Receipt JSON must be an object'
      }
    };
  }

  const r = parsed as any;
  if (typeof r.bundle_sha256 !== 'string' || !Array.isArray(r.files)) {
    return {
      errorFinding: {
        code: 'RECEIPT_PARSE_ERROR',
        severity: 'error',
        message: 'Receipt JSON missing required fields: bundle_sha256, files'
      }
    };
  }

  return { receipt: r as MinimalReceipt };
}

function selectPolicyProfile(policy: any): PolicyProfileV1 {
  // v0.1: no profile selection flag yet. Use base profile.
  // Later, export/gate may specify strict_v0 profiles.
  return {
    gates: policy?.gates,
    capabilities: policy?.capabilities,
    constraints: policy?.constraints
  };
}

function policyDecisionFromProfile(profile: PolicyProfileV1 | undefined, risk_score: any): PolicyDecision {
  return decidePolicy({
    risk_score,
    gates: profile?.gates
  });
}

export async function verifyBundle(pathOrZip: string, opts: VerifyOptions): Promise<{ report: VerifyReport; exitCode: number }> {
  const findings: Finding[] = [];

  const { receipt, errorFinding } = await readReceipt(opts.receiptPath);
  if (!receipt) {
    if (errorFinding) findings.push(errorFinding);

    const risk_score = { base_risk: 0, change_risk: 0, policy_delta: 0, total: 100 };
    const policy = decidePolicy({ risk_score, gates: undefined });

    return {
      report: {
        contract_version: CONTRACT_VERSION,
        created_at: nowIso(opts.deterministic),
        receipt: { bundle_sha256: '' },
        bundle_sha256: '',
        verified: false,
        findings,
        policy
      },
      exitCode: 1
    };
  }

  // Load policy.v1 (optional).
  const loadedPolicy = await loadPolicyV1(opts.policyPath);
  const profile = loadedPolicy ? selectPolicyProfile(loadedPolicy) : undefined;

  const risk_score = receipt.scan?.risk_score ?? { base_risk: 0, change_risk: 0, policy_delta: 0, total: 0 };
  const policy = policyDecisionFromProfile(profile, risk_score);

  // Recompute hashes.
  const bundle = await readBundle(pathOrZip);
  const computedFiles = bundle.files
    .map((f) => ({ path: f.path, size: f.bytes.byteLength, sha256: sha256Hex(f.bytes) }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const bundle_sha256 = bundleSha256FromEntries(computedFiles.map((f) => ({ path: f.path, sha256: f.sha256 })));

  // Integrity checks vs receipt.
  const receiptFiles = [...receipt.files].sort((a, b) => a.path.localeCompare(b.path));
  const receiptByPath = new Map(receiptFiles.map((f) => [f.path, f] as const));
  const computedByPath = new Map(computedFiles.map((f) => [f.path, f] as const));

  for (const rf of receiptFiles) {
    const cf = computedByPath.get(rf.path);
    if (!cf) {
      addFinding(findings, 'FILE_MISSING', 'error', `Missing file: ${rf.path}`, { path: rf.path });
      continue;
    }
    if (cf.sha256 !== rf.sha256) {
      addFinding(findings, 'FILE_HASH_MISMATCH', 'error', `File hash mismatch: ${rf.path}`, {
        path: rf.path,
        details: { receipt_sha256: rf.sha256, bundle_sha256: cf.sha256 }
      });
    }
  }

  for (const cf of computedFiles) {
    if (!receiptByPath.has(cf.path)) {
      addFinding(findings, 'FILE_EXTRA', 'error', `Extra file not present in receipt: ${cf.path}`, { path: cf.path });
    }
  }

  if (bundle_sha256 !== receipt.bundle_sha256) {
    addFinding(findings, 'BUNDLE_HASH_MISMATCH', 'error', 'Bundle hash mismatch', {
      details: { receipt_bundle_sha256: receipt.bundle_sha256, bundle_sha256 }
    });
  }

  // Constraints enforcement (policy.constraints).
  const constraints = profile?.constraints;
  if (constraints?.exactly_one_manifest) {
    const { findings: manifestFindings } = detectManifestFromEntries(computedFiles);
    findings.push(...manifestFindings);
  }

  if (typeof constraints?.bundle_size_limit_bytes === 'number') {
    const totalBytes = computedFiles.reduce((acc, f) => acc + f.size, 0);
    if (totalBytes > constraints.bundle_size_limit_bytes) {
      addFinding(findings, 'CONSTRAINT_BUNDLE_SIZE_LIMIT', 'error', `Bundle size ${totalBytes} exceeds limit ${constraints.bundle_size_limit_bytes}`, {
        details: { total_bytes: totalBytes, limit_bytes: constraints.bundle_size_limit_bytes }
      });
    }
  }

  if (typeof constraints?.file_size_limit_bytes === 'number') {
    for (const f of computedFiles) {
      if (f.size > constraints.file_size_limit_bytes) {
        addFinding(findings, 'CONSTRAINT_FILE_SIZE_LIMIT', 'error', `File ${f.path} size ${f.size} exceeds limit ${constraints.file_size_limit_bytes}`, {
          path: f.path,
          details: { size: f.size, limit_bytes: constraints.file_size_limit_bytes }
        });
      }
    }
  }

  if (typeof constraints?.max_manifest_tokens_warn === 'number' || typeof constraints?.max_manifest_tokens_fail === 'number') {
    const manifestPath = detectManifestFromEntries(computedFiles).manifest?.path;
    const manifest = manifestPath ? bundle.files.find((f) => f.path === manifestPath) : undefined;
    if (manifest) {
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

  // Capability rules (policy.capabilities).
  const caps = Array.isArray(receipt.scan?.capabilities) ? [...receipt.scan.capabilities] : [];
  caps.sort();

  const capRules = profile?.capabilities;
  if (capRules) {
    for (const cap of caps) {
      const rule = (capRules as any)[cap];
      const mode = rule?.mode;

      if (mode === 'block') {
        addFinding(findings, 'POLICY_VIOLATION', 'error', `Policy blocks capability: ${cap}`, {
          details: { capability: cap, mode }
        });
      }

      if (mode === 'require_approval') {
        // v0.1: approvals are not implemented; treat as missing.
        addFinding(findings, 'REQUIRED_APPROVAL_MISSING', 'error', `Policy requires approval for capability: ${cap}`, {
          details: { capability: cap, mode }
        });
      }
    }
  }

  // If the policy decision itself includes any errors, count as policy violation.
  for (const f of policy.findings) {
    if (f.severity === 'error') {
      addFinding(findings, 'POLICY_VIOLATION', 'error', f.message, { details: { wrapped_policy_code: f.code } });
    }
  }

  const hasError = findings.some((f) => f.severity === 'error');

  return {
    report: {
      contract_version: CONTRACT_VERSION,
      created_at: nowIso(opts.deterministic),
      receipt: { bundle_sha256: receipt.bundle_sha256 },
      bundle_sha256,
      verified: !hasError,
      findings,
      policy
    },
    exitCode: hasError ? 1 : 0
  };
}
