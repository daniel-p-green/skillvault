import { describe, expect, it } from 'vitest';

import type { Finding } from '../src/contracts.js';
import { verdictFromRiskScore } from '../src/contracts.js';
import { computeBaseRisk, computeRiskScore } from '../src/scan/scoring.js';

function finding(severity: Finding['severity']): Finding {
  return {
    code: 'POLICY_VIOLATION',
    severity,
    message: severity
  };
}

describe('deterministic risk scoring', () => {
  it('computes deterministic base risk from capabilities and findings', () => {
    const a = computeBaseRisk(['exec', 'network', 'exec'], [finding('warn'), finding('error')]);
    const b = computeBaseRisk(['network', 'exec'], [finding('error'), finding('warn')]);

    expect(a).toBe(b);
    expect(a).toBe(61);
  });

  it('defaults plain scan change_risk to 0 and clamps total to [0, 100]', () => {
    const plain = computeRiskScore({
      capabilities: ['reads'],
      findings: []
    });

    expect(plain.change_risk).toBe(0);
    expect(plain.total).toBe(5);

    const high = computeRiskScore({
      capabilities: ['exec', 'network', 'writes', 'reads', 'secrets', 'dynamic_code'],
      findings: [finding('error'), finding('error'), finding('error')],
      changeRisk: 999,
      policyDelta: 999
    });

    expect(high.total).toBe(100);

    const low = computeRiskScore({
      capabilities: [],
      findings: [],
      changeRisk: 0,
      policyDelta: -999
    });

    expect(low.total).toBe(0);
  });

  it('maps verdict thresholds exactly: PASS 0-29, WARN 30-59, FAIL 60-100', () => {
    expect(verdictFromRiskScore(0)).toBe('PASS');
    expect(verdictFromRiskScore(29)).toBe('PASS');
    expect(verdictFromRiskScore(30)).toBe('WARN');
    expect(verdictFromRiskScore(59)).toBe('WARN');
    expect(verdictFromRiskScore(60)).toBe('FAIL');
    expect(verdictFromRiskScore(100)).toBe('FAIL');
  });
});
