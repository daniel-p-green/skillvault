import type { Capability, FileEntry, ManifestRef, RiskScore, ScanReport } from '../contracts.js';
import { CONTRACT_VERSION } from '../contracts.js';
import { readBundle } from './bundle.js';
import { computeBundleSha256, hashBundleFiles, sha256Hex } from '../bundle/hashing.js';
import { nowIso } from './time.js';
import { detectManifestFromEntries } from '../manifest/manifest.js';
import { inferCapabilities } from '../scan/capabilities.js';

export interface ScanOptions {
  deterministic: boolean;
}

export async function scanBundle(pathOrZip: string, opts: ScanOptions): Promise<ScanReport> {
  const bundle = await readBundle(pathOrZip);

  const files: FileEntry[] = hashBundleFiles(bundle.files);

  const bundle_sha256 = computeBundleSha256(files);

  const { manifest: manifestFile, findings } = detectManifestFromEntries(files);
  const manifest: ManifestRef = manifestFile
    ? { path: manifestFile.path, size: manifestFile.size, sha256: manifestFile.sha256 }
    : { path: 'SKILL.md', size: 0, sha256: sha256Hex(new Uint8Array()) };

  const capabilities: Capability[] = inferCapabilities(bundle.files);

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
