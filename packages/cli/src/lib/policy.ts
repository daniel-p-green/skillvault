import fs from 'node:fs/promises';
import YAML from 'yaml';
import type { Finding, PolicyDecision, ReasonCode, RiskScore, Verdict, VerdictThresholds } from '../contracts.js';
import { CONTRACT_VERSION, DEFAULT_THRESHOLDS, verdictFromRiskScore } from '../contracts.js';

export interface PolicyConfig {
  gates?: {
    max_risk_score?: number;
    allow_verdicts?: Verdict[];
  };
}

export async function loadPolicy(policyPath?: string): Promise<PolicyConfig | undefined> {
  if (!policyPath) return undefined;
  const raw = await fs.readFile(policyPath, 'utf8');
  const parsed = YAML.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object') return undefined;

  const obj = parsed as Record<string, unknown>;
  const gates = obj.gates as Record<string, unknown> | undefined;

  const allow = Array.isArray(gates?.allow_verdicts)
    ? (gates?.allow_verdicts.filter((v) => v === 'PASS' || v === 'WARN' || v === 'FAIL') as Verdict[])
    : undefined;

  const max = typeof gates?.max_risk_score === 'number' ? gates.max_risk_score : undefined;

  return {
    gates: {
      max_risk_score: max,
      allow_verdicts: allow
    }
  };
}

function addFinding(findings: Finding[], code: ReasonCode, severity: Finding['severity'], message: string): void {
  findings.push({ code, severity, message });
}

export function decidePolicy(opts: {
  thresholds?: VerdictThresholds;
  gates?: PolicyConfig['gates'];
  risk_score: RiskScore;
}): PolicyDecision {
  const thresholds = opts.thresholds ?? DEFAULT_THRESHOLDS;
  const gates = opts.gates;
  const findings: Finding[] = [];

  const computedVerdict = verdictFromRiskScore(opts.risk_score.total);

  let verdict: Verdict = computedVerdict;

  if (typeof gates?.max_risk_score === 'number' && opts.risk_score.total > gates.max_risk_score) {
    verdict = 'FAIL';
    addFinding(findings, 'POLICY_MAX_RISK_EXCEEDED', 'error', `Risk score ${opts.risk_score.total} exceeds policy max_risk_score ${gates.max_risk_score}`);
  }

  if (Array.isArray(gates?.allow_verdicts) && gates.allow_verdicts.length > 0) {
    if (!gates.allow_verdicts.includes(verdict)) {
      // Deterministic: if verdict not allowed, force FAIL.
      verdict = 'FAIL';
      addFinding(findings, 'POLICY_VERDICT_NOT_ALLOWED', 'error', `Verdict ${computedVerdict} is not allowed by policy`);
    }
  }

  return {
    contract_version: CONTRACT_VERSION,
    verdict,
    thresholds,
    gates,
    risk_score: opts.risk_score,
    findings
  };
}
