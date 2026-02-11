import { describe, expect, it } from 'vitest';

import {
  CONTRACT_VERSION,
  DEFAULT_THRESHOLDS,
  ReasonCodes,
  verdictFromRiskScore
} from '../src/contracts.js';

describe('v0.1 JSON contracts', () => {
  it('exports a stable contract version', () => {
    expect(CONTRACT_VERSION).toBe('0.1');
  });

  it('uses the required verdict thresholds', () => {
    expect(DEFAULT_THRESHOLDS).toEqual({ pass_max: 29, warn_max: 59, fail_max: 100 });
  });

  it('maps risk scores to verdicts deterministically at boundaries', () => {
    expect(verdictFromRiskScore(0)).toBe('PASS');
    expect(verdictFromRiskScore(29)).toBe('PASS');
    expect(verdictFromRiskScore(30)).toBe('WARN');
    expect(verdictFromRiskScore(59)).toBe('WARN');
    expect(verdictFromRiskScore(60)).toBe('FAIL');
    expect(verdictFromRiskScore(100)).toBe('FAIL');
  });

  it('clamps out-of-range or invalid scores to FAIL-safe behavior', () => {
    expect(verdictFromRiskScore(-123)).toBe('PASS');
    expect(verdictFromRiskScore(999)).toBe('FAIL');
    expect(verdictFromRiskScore(Number.NaN)).toBe('FAIL');
    expect(verdictFromRiskScore(Number.POSITIVE_INFINITY)).toBe('FAIL');
  });

  it('exports stable reason code strings (additive-only list)', () => {
    // Snapshot via explicit expectation to keep changes intentional.
    expect(ReasonCodes).toEqual([
      'BUNDLE_HASH_MISMATCH',
      'FILE_HASH_MISMATCH',
      'FILE_MISSING',
      'FILE_EXTRA',
      'RECEIPT_BUNDLE_HASH_MISMATCH',
      'RECEIPT_PARSE_ERROR',
      'POLICY_MAX_RISK_EXCEEDED',
      'POLICY_VERDICT_NOT_ALLOWED',
      'POLICY_CAPABILITY_BLOCKED',
      'POLICY_APPROVAL_REQUIRED',
      'POLICY_VIOLATION',
      'REQUIRED_APPROVAL_MISSING',
      'POLICY_PARSE_ERROR',
      'POLICY_SCHEMA_INVALID',
      'CONSTRAINT_MANIFEST_COUNT',
      'CONSTRAINT_BUNDLE_SIZE_LIMIT',
      'CONSTRAINT_FILE_SIZE_LIMIT',
      'CONSTRAINT_TOKEN_LIMIT_WARN',
      'CONSTRAINT_TOKEN_LIMIT_FAIL',
      'CONSTRAINT_UNSAFE_PATH',
      'CONSTRAINT_SYMLINK_FORBIDDEN'
    ]);
  });
});
