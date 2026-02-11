import type { Finding, PolicyDecision, ReasonCode, RiskScore, Verdict, VerdictThresholds } from '../contracts.js';
import { CONTRACT_VERSION, DEFAULT_THRESHOLDS, verdictFromRiskScore } from '../contracts.js';
import { loadPolicyV1 } from './policy-loader.js';

/**
 * NOTE: v0.1 policy enforcement is implemented incrementally.
 * For now, the receipt pipeline uses only `gates`.
 */
export interface PolicyConfig {
  gates?: {
    max_risk_score?: number;
    allow_verdicts?: Verdict[];
  };
}

export async function loadPolicy(policyPath?: string): Promise<PolicyConfig | undefined> {
  const policy = await loadPolicyV1(policyPath);
  if (!policy) return undefined;
  return {
    gates: policy.gates
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
