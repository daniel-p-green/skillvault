import type { Capability, Finding, RiskScore } from '../contracts.js';

const CAPABILITY_WEIGHTS: Record<Capability, number> = {
  network: 20,
  exec: 25,
  writes: 15,
  reads: 5,
  secrets: 20,
  dynamic_code: 25
};

const FINDING_SEVERITY_WEIGHTS: Record<Finding['severity'], number> = {
  info: 0,
  warn: 4,
  error: 12
};

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return max;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function uniqueSortedCapabilities(capabilities: Capability[]): Capability[] {
  return [...new Set(capabilities)].sort();
}

export function computeBaseRisk(capabilities: Capability[], findings: Finding[]): number {
  const capRisk = uniqueSortedCapabilities(capabilities).reduce((acc, cap) => acc + (CAPABILITY_WEIGHTS[cap] ?? 0), 0);
  const findingRisk = findings.reduce((acc, finding) => acc + (FINDING_SEVERITY_WEIGHTS[finding.severity] ?? 0), 0);
  return clampInt(capRisk + findingRisk, 0, 100);
}

export interface ComputeRiskScoreInput {
  capabilities: Capability[];
  findings: Finding[];
  changeRisk?: number;
  policyDelta?: number;
}

export function computeRiskScore(input: ComputeRiskScoreInput): RiskScore {
  const base_risk = computeBaseRisk(input.capabilities, input.findings);
  const change_risk = clampInt(input.changeRisk ?? 0, 0, 100);
  const policy_delta = clampInt(input.policyDelta ?? 0, -100, 100);
  const total = clampInt(base_risk + change_risk + policy_delta, 0, 100);

  return {
    base_risk,
    change_risk,
    policy_delta,
    total
  };
}
