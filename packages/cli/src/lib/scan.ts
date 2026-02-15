import type { Capability, FileEntry, Finding, ManifestRef, RiskScore, ScanReport } from '../contracts.js';
import { CONTRACT_VERSION } from '../contracts.js';
import { readBundle } from './bundle.js';
import { computeBundleSha256, hashBundleFiles, sha256Hex } from '../bundle/hashing.js';
import { nowIso } from './time.js';

function isManifestPath(p: string): boolean {
  return p === 'SKILL.md' || p === 'skill.md';
}

export interface ScanOptions {
  deterministic: boolean;
}

export async function scanBundle(pathOrZip: string, opts: ScanOptions): Promise<ScanReport> {
  const bundle = await readBundle(pathOrZip);

  const files: FileEntry[] = hashBundleFiles(bundle.files);

  const bundle_sha256 = computeBundleSha256(files);

  const manifestCandidates = files.filter((f) => isManifestPath(f.path));
  const findings: Finding[] = [];

  if (manifestCandidates.length !== 1) {
    findings.push({
      code: 'CONSTRAINT_MANIFEST_COUNT',
      severity: 'error',
      message: `Expected exactly one manifest (SKILL.md or skill.md) in bundle root; found ${manifestCandidates.length}`
    });
  }

  const manifestFile = manifestCandidates[0];
  const manifest: ManifestRef = manifestFile
    ? { path: manifestFile.path, size: manifestFile.size, sha256: manifestFile.sha256 }
    : { path: 'SKILL.md', size: 0, sha256: sha256Hex(new Uint8Array()) };

  // v0.1 receipt story: scanner findings/scoring can be minimal. Future stories add inference.
  const capabilities: Capability[] = [];

  const risk_score: RiskScore = {
    base_risk: 0,
    change_risk: 0,
    policy_delta: 0,
    total: 0
  };

  const total_bytes = files.reduce((acc, f) => acc + f.size, 0);

  return {
    contract_version: CONTRACT_VERSION,
    created_at: nowIso(opts.deterministic),
    bundle_sha256,
    files,
    manifest,
    capabilities,
    risk_score,
    summary: {
      file_count: files.length,
      total_bytes,
      deterministic: opts.deterministic
    },
    findings
  };
}
