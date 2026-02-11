import { describe, expect, it } from 'vitest';

import { parsePolicyV1, PolicyLoadError } from '../src/lib/policy-loader.js';

describe('policy.v1 parsing', () => {
  it('parses gates, capabilities, and constraints (partial) without requiring policy_version', () => {
    const policy = parsePolicyV1(`
# policy_version intentionally omitted for backwards compatibility

gates:
  max_risk_score: 29
  allow_verdicts: [PASS]

capabilities:
  network:
    mode: block
    note: no networking

constraints:
  exactly_one_manifest: true
  bundle_size_limit_bytes: 123
  max_manifest_tokens_warn: 1000
`);

    expect(policy.gates?.max_risk_score).toBe(29);
    expect(policy.gates?.allow_verdicts).toEqual(['PASS']);

    expect(policy.capabilities?.network?.mode).toBe('block');
    expect(policy.capabilities?.network?.note).toBe('no networking');

    expect(policy.constraints?.exactly_one_manifest).toBe(true);
    expect(policy.constraints?.bundle_size_limit_bytes).toBe(123);
    expect(policy.constraints?.max_manifest_tokens_warn).toBe(1000);
  });

  it('throws a typed error with reason code on invalid YAML', () => {
    expect(() => parsePolicyV1('gates: [')).toThrow(PolicyLoadError);
    try {
      parsePolicyV1('gates: [');
      throw new Error('expected to throw');
    } catch (err) {
      const e = err as PolicyLoadError;
      expect(e.reason).toBe('POLICY_PARSE_ERROR');
    }
  });

  it('throws schema error if policy_version is unsupported', () => {
    expect(() => parsePolicyV1('policy_version: v2')).toThrow(PolicyLoadError);
    try {
      parsePolicyV1('policy_version: v2');
      throw new Error('expected to throw');
    } catch (err) {
      const e = err as PolicyLoadError;
      expect(e.reason).toBe('POLICY_SCHEMA_INVALID');
    }
  });
});
