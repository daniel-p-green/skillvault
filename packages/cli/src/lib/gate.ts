import fs from 'node:fs/promises';

import type { Finding, GateReport, PolicyDecision, ReasonCode, RiskScore } from '../contracts.js';
import { CONTRACT_VERSION } from '../contracts.js';
import { nowIso } from './time.js';
import { decidePolicy } from './policy.js';
import { loadPolicyV1 } from './policy-loader.js';
import type { PolicyProfileV1 } from '../policy-v1.js';
import { scanBundle } from './scan.js';
import { detectManifestFromEntries } from '../manifest/manifest.js';

interface MinimalReceipt {
  contract_version?: string;
  bundle_sha256: string;
  files: Array<{ path: string; sha256: string; size: number }>;
  manifest?: { path: string; sha256: string; size: number };
  scan?: {
    capabilities?: string[];
    risk_score?: RiskScore;
  };
  policy?: {
    verdict?: string;
    risk_score?: RiskScore;
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
  return {
    gates: policy?.gates,
    capabilities: policy?.capabilities,
    constraints: policy?.constraints
  };
}

function policyDecisionFromProfile(profile: PolicyProfileV1 | undefined, risk_score: RiskScore): PolicyDecision {
  return decidePolicy({ risk_score, gates: profile?.gates });
}

function enforceConstraintsFromEntries(findings: Finding[], profile: PolicyProfileV1 | undefined, entries: Array<{ path: string; size: number }>): void {
  const constraints = profile?.constraints;
  if (!constraints) return;

  if (constraints.exactly_one_manifest) {
    const { findings: manifestFindings } = detectManifestFromEntries(entries.map((f) => ({ ...f, sha256: '' })));
    findings.push(...manifestFindings);
  }

  if (typeof constraints.bundle_size_limit_bytes === 'number') {
    const totalBytes = entries.reduce((acc, f) => acc + f.size, 0);
    if (totalBytes > constraints.bundle_size_limit_bytes) {
      addFinding(findings, 'CONSTRAINT_BUNDLE_SIZE_LIMIT', 'error', `Bundle size ${totalBytes} exceeds limit ${constraints.bundle_size_limit_bytes}`, {
        details: { total_bytes: totalBytes, limit_bytes: constraints.bundle_size_limit_bytes }
      });
    }
  }

  if (typeof constraints.file_size_limit_bytes === 'number') {
    for (const f of entries) {
      if (f.size > constraints.file_size_limit_bytes) {
        addFinding(findings, 'CONSTRAINT_FILE_SIZE_LIMIT', 'error', `File ${f.path} size ${f.size} exceeds limit ${constraints.file_size_limit_bytes}`, {
          path: f.path,
          details: { size: f.size, limit_bytes: constraints.file_size_limit_bytes }
        });
      }
    }
  }

  // Token limits require reading manifest contents; the receipt does not store them in v0.1.
}

function enforceCapabilities(findings: Finding[], profile: PolicyProfileV1 | undefined, capabilities: string[]): void {
  const capRules = profile?.capabilities;
  if (!capRules) return;

  const caps = [...capabilities].sort();
  for (const cap of caps) {
    const rule = (capRules as any)[cap];
    const mode = rule?.mode;

    if (mode === 'block') {
      addFinding(findings, 'POLICY_CAPABILITY_BLOCKED', 'error', `Policy blocks capability: ${cap}`, {
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

function gateFromInputs(opts: {
  deterministic: boolean;
  profile: PolicyProfileV1 | undefined;
  risk_score: RiskScore;
  scanFindings: Finding[];
  entries: Array<{ path: string; size: number }>;
  capabilities: string[];
}): { report: GateReport; exitCode: number } {
  const findings: Finding[] = [];

  // Include any scanner findings as gate findings (they are effectively constraints warnings/errors).
  for (const f of opts.scanFindings) findings.push(f);

  const policy = policyDecisionFromProfile(opts.profile, opts.risk_score);

  enforceConstraintsFromEntries(findings, opts.profile, opts.entries);
  enforceCapabilities(findings, opts.profile, opts.capabilities);

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
      verdict: hasError ? 'FAIL' : policy.verdict,
      risk_score: opts.risk_score,
      findings,
      policy
    },
    exitCode: hasError ? 1 : 0
  };
}

export async function gateFromReceipt(receiptPath: string, opts: { policyPath: string; deterministic: boolean }): Promise<{ report: GateReport; exitCode: number }> {
  const findings: Finding[] = [];

  const { receipt, errorFinding } = await readReceipt(receiptPath);
  if (!receipt) {
    if (errorFinding) findings.push(errorFinding);

    const risk_score: RiskScore = { base_risk: 0, change_risk: 0, policy_delta: 0, total: 100 };

    const policy = decidePolicy({ risk_score, gates: undefined });

    return {
      report: {
        contract_version: CONTRACT_VERSION,
        created_at: nowIso(opts.deterministic),
        verdict: 'FAIL',
        risk_score,
        findings,
        policy
      },
      exitCode: 1
    };
  }

  const loadedPolicy = await loadPolicyV1(opts.policyPath);
  const profile = loadedPolicy ? selectPolicyProfile(loadedPolicy) : undefined;

  const risk_score = receipt.scan?.risk_score ?? { base_risk: 0, change_risk: 0, policy_delta: 0, total: 0 };
  const scanFindings: Finding[] = Array.isArray((receipt as any).scan?.findings) ? ((receipt as any).scan.findings as Finding[]) : [];

  const entries = receipt.files.map((f) => ({ path: f.path, size: f.size }));
  const capabilities = Array.isArray(receipt.scan?.capabilities) ? receipt.scan.capabilities : [];

  const { report, exitCode } = gateFromInputs({
    deterministic: opts.deterministic,
    profile,
    risk_score,
    scanFindings,
    entries,
    capabilities
  });

  return { report, exitCode };
}

export async function gateFromBundle(bundlePathOrZip: string, opts: { policyPath: string; deterministic: boolean }): Promise<{ report: GateReport; exitCode: number }> {
  const scan = await scanBundle(bundlePathOrZip, { deterministic: opts.deterministic });

  const loadedPolicy = await loadPolicyV1(opts.policyPath);
  const profile = loadedPolicy ? selectPolicyProfile(loadedPolicy) : undefined;

  return gateFromInputs({
    deterministic: opts.deterministic,
    profile,
    risk_score: scan.risk_score,
    scanFindings: scan.findings,
    entries: scan.files.map((f) => ({ path: f.path, size: f.size })),
    capabilities: scan.capabilities as any
  });
}
