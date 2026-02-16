import { describe, expect, it } from 'vitest';

import { DEFAULT_POLICY_V1, PolicyLoadError, loadPolicyV1, parsePolicyV1 } from '../src/lib/policy-loader.js';

describe('policy.v1 parsing', () => {
  it('parses policy.v1 and applies defaults', () => {
    const policy = parsePolicyV1(`
policy_version: v1

gates:
  max_risk_score: 29

capabilities:
  network:
    mode: block

constraints:
  bundle_size_limit_bytes: 123
`);

    expect(policy.policy_version).toBe('v1');
    expect(policy.gates?.max_risk_score).toBe(29);
    expect(policy.gates?.allow_verdicts).toEqual(['PASS', 'WARN', 'FAIL']);

    expect(policy.capabilities?.network?.mode).toBe('block');
    expect(policy.capabilities?.exec?.mode).toBe('allow');
    expect(policy.capabilities?.writes?.mode).toBe('allow');

    expect(policy.constraints?.exactly_one_manifest).toBe(true);
    expect(policy.constraints?.bundle_size_limit_bytes).toBe(123);
  });

  it('uses stable default policy when fields are omitted', () => {
    const policy = parsePolicyV1('policy_version: v1');
    expect(policy).toEqual(DEFAULT_POLICY_V1);
  });

  it('returns default policy when loadPolicyV1 is called without --policy', async () => {
    const policy = await loadPolicyV1();
    expect(policy).toEqual(DEFAULT_POLICY_V1);
  });

  it('throws POLICY_PARSE_ERROR for invalid YAML', () => {
    expect(() => parsePolicyV1('gates: [')).toThrow(PolicyLoadError);

    try {
      parsePolicyV1('gates: [');
      throw new Error('expected to throw');
    } catch (err) {
      const e = err as PolicyLoadError;
      expect(e.reason).toBe('POLICY_PARSE_ERROR');
      expect(e.details?.kind).toBe('yaml');
    }
  });

  it('throws POLICY_PARSE_ERROR for schema validation errors with stable details', () => {
    expect(() =>
      parsePolicyV1(`
policy_version: v1
gates:
  max_risk_score: 101
`)
    ).toThrow(PolicyLoadError);

    try {
      parsePolicyV1(`
policy_version: v1
gates:
  max_risk_score: 101
`);
      throw new Error('expected to throw');
    } catch (err) {
      const e = err as PolicyLoadError;
      expect(e.reason).toBe('POLICY_PARSE_ERROR');
      expect(e.details).toMatchObject({ field: 'gates.max_risk_score', kind: 'schema' });
    }
  });
});
