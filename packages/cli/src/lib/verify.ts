import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto';

import type { Finding, PolicyDecision, ReasonCode, Receipt, VerifyReport } from '../contracts.js';
import { CONTRACT_VERSION } from '../contracts.js';
import { decidePolicy } from './policy.js';
import { readBundle } from './bundle.js';
import { nowIso } from './time.js';
import { loadPolicyV1 } from './policy-loader.js';
import type { PolicyProfileV1 } from '../policy-v1.js';
import { detectManifestFromEntries } from '../manifest/manifest.js';
import { tokenCountNormalized } from '../text/normalize.js';
import { hashBundleFiles, computeBundleSha256 } from '../bundle/hashing.js';
import { canonicalJsonBytes } from '../util/canonicalJson.js';

export interface VerifyOptions {
  receiptPath: string;
  policyPath?: string;
  pubkeyPath?: string;
  keyringDir?: string;
  offline: boolean;
  deterministic: boolean;
}

export interface VerifyReceiptSignatureOptions {
  pubkeyPath?: string;
  keyringDir?: string;
}

function addFinding(findings: Finding[], code: ReasonCode, severity: Finding['severity'], message: string, extra?: Partial<Finding>): void {
  findings.push({ code, severity, message, ...extra });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isFileEntry(value: unknown): boolean {
  return isRecord(value)
    && typeof value.path === 'string'
    && typeof value.sha256 === 'string'
    && typeof value.size === 'number';
}

function validateReceiptSchema(parsed: unknown): { receipt?: Receipt; errorFinding?: Finding } {
  if (!isRecord(parsed)) {
    return {
      errorFinding: {
        code: 'RECEIPT_SCHEMA_INVALID',
        severity: 'error',
        message: 'Receipt must be a JSON object'
      }
    };
  }

  if (typeof parsed.contract_version !== 'string'
    || typeof parsed.bundle_sha256 !== 'string'
    || !Array.isArray(parsed.files)
    || !parsed.files.every(isFileEntry)
    || !isRecord(parsed.scan)
    || !isRecord(parsed.policy)) {
    return {
      errorFinding: {
        code: 'RECEIPT_SCHEMA_INVALID',
        severity: 'error',
        message: 'Receipt missing required fields or has invalid field types'
      }
    };
  }

  if (!isRecord(parsed.signature)) {
    return {
      errorFinding: {
        code: 'RECEIPT_SCHEMA_INVALID',
        severity: 'error',
        message: 'Receipt signature object is required for verify'
      }
    };
  }

  const signature = parsed.signature;
  if (signature.alg !== 'ed25519' || typeof signature.payload_sha256 !== 'string' || typeof signature.sig !== 'string') {
    return {
      errorFinding: {
        code: 'RECEIPT_SCHEMA_INVALID',
        severity: 'error',
        message: 'Receipt signature must include alg=ed25519, payload_sha256, and sig'
      }
    };
  }

  return { receipt: parsed as unknown as Receipt };
}

async function readReceipt(receiptPath: string): Promise<{ receipt?: Receipt; errorFinding?: Finding }> {
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

  return validateReceiptSchema(parsed);
}

function selectPolicyProfile(policy: any): PolicyProfileV1 {
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

function resolveKeyringCandidates(keyringDir: string, keyId?: string): string[] {
  if (!keyId) return [];
  const safeId = keyId.replace(/[^a-zA-Z0-9._-]/g, '');
  const base = path.resolve(keyringDir);
  return [
    path.join(base, safeId),
    path.join(base, `${safeId}.pem`),
    path.join(base, `${safeId}.pub`),
    path.join(base, `${safeId}.public.pem`),
    path.join(base, `${safeId}.ed25519.pub`)
  ];
}

async function resolvePublicKeyPem(opts: VerifyReceiptSignatureOptions, keyId?: string): Promise<{ pem?: string; source?: string }> {
  if (opts.pubkeyPath) {
    const pem = await fs.readFile(opts.pubkeyPath, 'utf8');
    return { pem, source: opts.pubkeyPath };
  }

  if (!opts.keyringDir) return {};

  const candidates = resolveKeyringCandidates(opts.keyringDir, keyId);
  for (const candidate of candidates) {
    try {
      const pem = await fs.readFile(candidate, 'utf8');
      return { pem, source: candidate };
    } catch {
      // continue
    }
  }

  return {};
}

function verifyReceiptSignature(receipt: Receipt, publicKeyPem: string): { valid: boolean; payloadSha256Hex: string } {
  const { signature } = receipt;
  const unsignedPayload: Receipt = {
    ...receipt,
    signature: undefined
  };
  const payloadBytes = canonicalJsonBytes(unsignedPayload);
  const payloadSha256Hex = createHash('sha256').update(payloadBytes).digest('hex');

  if (payloadSha256Hex !== signature!.payload_sha256) {
    return { valid: false, payloadSha256Hex };
  }

  const sigBytes = Buffer.from(signature!.sig, 'base64');
  const publicKey = createPublicKey(publicKeyPem);
  const valid = cryptoVerify(null, payloadBytes, publicKey, sigBytes);
  return { valid, payloadSha256Hex };
}

export async function verifyReceiptSignatureOnly(
  receiptPath: string,
  opts: VerifyReceiptSignatureOptions
): Promise<{ receipt?: Receipt; findings: Finding[]; verified: boolean }> {
  const findings: Finding[] = [];
  const { receipt, errorFinding } = await readReceipt(receiptPath);
  if (!receipt) {
    if (errorFinding) findings.push(errorFinding);
    return { findings, verified: false };
  }

  const { pem: pubkeyPem, source: keySource } = await resolvePublicKeyPem(opts, receipt.signature?.key_id);
  if (!pubkeyPem) {
    addFinding(findings, 'SIGNATURE_KEY_NOT_FOUND', 'error', 'Unable to resolve verification key for receipt signature', {
      details: {
        key_id: receipt.signature?.key_id,
        keyring: opts.keyringDir
      }
    });
    return { receipt, findings, verified: false };
  }

  try {
    const { valid, payloadSha256Hex } = verifyReceiptSignature(receipt, pubkeyPem);
    if (!valid) {
      addFinding(findings, 'SIGNATURE_INVALID', 'error', 'Receipt signature verification failed', {
        details: {
          key_source: keySource,
          expected_payload_sha256: receipt.signature?.payload_sha256,
          computed_payload_sha256: payloadSha256Hex
        }
      });
      return { receipt, findings, verified: false };
    }
  } catch (err) {
    addFinding(findings, 'SIGNATURE_INVALID', 'error', 'Receipt signature verification failed', {
      details: {
        key_source: keySource,
        error: err instanceof Error ? err.message : String(err)
      }
    });
    return { receipt, findings, verified: false };
  }

  return { receipt, findings, verified: true };
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

  const loadedPolicy = await loadPolicyV1(opts.policyPath);
  const profile = loadedPolicy ? selectPolicyProfile(loadedPolicy) : undefined;

  const risk_score = receipt.scan?.risk_score ?? { base_risk: 0, change_risk: 0, policy_delta: 0, total: 0 };
  const policy = policyDecisionFromProfile(profile, risk_score);

  const bundle = await readBundle(pathOrZip);
  const computedFiles = hashBundleFiles(bundle.files);
  const bundle_sha256 = computeBundleSha256(computedFiles);

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

  const { pem: pubkeyPem, source: keySource } = await resolvePublicKeyPem(opts, receipt.signature?.key_id);
  if (!pubkeyPem) {
    addFinding(findings, 'SIGNATURE_KEY_NOT_FOUND', 'error', 'Unable to resolve verification key for receipt signature', {
      details: {
        key_id: receipt.signature?.key_id,
        keyring: opts.keyringDir
      }
    });
  } else {
    try {
      const { valid, payloadSha256Hex } = verifyReceiptSignature(receipt, pubkeyPem);
      if (!valid) {
        addFinding(findings, 'SIGNATURE_INVALID', 'error', 'Receipt signature verification failed', {
          details: {
            key_source: keySource,
            expected_payload_sha256: receipt.signature?.payload_sha256,
            computed_payload_sha256: payloadSha256Hex
          }
        });
      }
    } catch (err) {
      addFinding(findings, 'SIGNATURE_INVALID', 'error', 'Receipt signature verification failed', {
        details: {
          key_source: keySource,
          error: err instanceof Error ? err.message : String(err)
        }
      });
    }
  }

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
        addFinding(findings, 'REQUIRED_APPROVAL_MISSING', 'error', `Policy requires approval for capability: ${cap}`, {
          details: { capability: cap, mode }
        });
      }
    }
  }

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
