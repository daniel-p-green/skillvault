import type { Receipt } from '../contracts.js';
import { CONTRACT_VERSION } from '../contracts.js';
import { scanBundle } from './scan.js';
import { loadPolicy, decidePolicy } from './policy.js';
import { nowIso } from './time.js';
import { canonicalJsonBytes } from '../util/canonicalJson.js';
import { createHash, createPrivateKey, sign as cryptoSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ReceiptOptions {
  policyPath?: string;
  signingKeyPath?: string;
  keyId?: string;
  deterministic: boolean;
}

export async function generateReceipt(bundlePathOrZip: string, opts: ReceiptOptions): Promise<Receipt> {
  const scan = await scanBundle(bundlePathOrZip, { deterministic: opts.deterministic });

  // Load policy config (optional) and compute deterministic decision.
  const policyConfig = await loadPolicy(opts.policyPath);
  const policy = decidePolicy({ risk_score: scan.risk_score, gates: policyConfig?.gates });
  const hasScanErrors = scan.findings.some((finding) => finding.severity === 'error');
  const effectivePolicy = hasScanErrors
    ? {
        ...policy,
        verdict: 'FAIL' as const,
        findings: [
          ...policy.findings,
          {
            code: 'POLICY_SCAN_ERROR_FINDING' as const,
            severity: 'error' as const,
            message: 'Receipt policy is forced to FAIL because scan findings contain error severity entries.'
          }
        ]
      }
    : policy;

  // CLI/package version.
  const pkgVersion = await readCliVersion();

  const unsignedReceipt: Receipt = {
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
    policy: effectivePolicy
  };

  if (!opts.signingKeyPath) {
    return unsignedReceipt;
  }

  const { payloadSha256Hex, signatureBase64 } = await signReceiptPayload(unsignedReceipt, opts.signingKeyPath);

  return {
    ...unsignedReceipt,
    signature: {
      alg: 'ed25519',
      ...(opts.keyId ? { key_id: opts.keyId } : {}),
      payload_sha256: payloadSha256Hex,
      sig: signatureBase64
    }
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

async function signReceiptPayload(unsignedReceipt: Receipt, signingKeyPath: string): Promise<{ payloadSha256Hex: string; signatureBase64: string }> {
  const payloadBytes = canonicalJsonBytes(unsignedReceipt);
  const payloadSha256Hex = createHash('sha256').update(payloadBytes).digest('hex');

  const privateKeyPem = await readFile(signingKeyPath, 'utf8');
  const privateKey = createPrivateKey(privateKeyPem);
  const signatureBase64 = cryptoSign(null, payloadBytes, privateKey).toString('base64');

  return { payloadSha256Hex, signatureBase64 };
}
