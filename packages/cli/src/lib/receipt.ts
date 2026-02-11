import type { Receipt } from '../contracts.js';
import { CONTRACT_VERSION } from '../contracts.js';
import { scanBundle } from './scan.js';
import { loadPolicy, decidePolicy } from './policy.js';
import { nowIso } from './time.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ReceiptOptions {
  policyPath?: string;
  deterministic: boolean;
}

export async function generateReceipt(bundlePathOrZip: string, opts: ReceiptOptions): Promise<Receipt> {
  const scan = await scanBundle(bundlePathOrZip, { deterministic: opts.deterministic });

  // Load policy config (optional) and compute deterministic decision.
  const policyConfig = await loadPolicy(opts.policyPath);
  const policy = decidePolicy({ risk_score: scan.risk_score, gates: policyConfig?.gates });

  // CLI/package version.
  const pkgVersion = await readCliVersion();

  return {
    contract_version: CONTRACT_VERSION,
    created_at: nowIso(opts.deterministic),
    scanner: {
      name: 'skillvault',
      version: pkgVersion
    },
    bundle_sha256: scan.bundle_sha256,
    files: scan.files,
    manifest: scan.manifest,
    scan: {
      capabilities: scan.capabilities,
      risk_score: scan.risk_score,
      summary: scan.summary,
      findings: scan.findings
    },
    policy
  };
}

async function readCliVersion(): Promise<string> {
  // Resolve from this file to packages/cli/package.json
  const here = path.dirname(fileURLToPath(import.meta.url));
  const pkgPath = path.resolve(here, '..', '..', 'package.json');
  const raw = await readFile(pkgPath, 'utf8');
  const parsed = JSON.parse(raw) as { version?: string };
  return typeof parsed.version === 'string' ? parsed.version : '0.0.0';
}
