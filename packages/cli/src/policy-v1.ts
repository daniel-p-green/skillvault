/**
 * policy.v1 YAML contract.
 *
 * This is the stable schema for v0.1 policy files.
 * - YAML is the on-disk format
 * - These TypeScript types are the canonical contract for parsing/validation.
 */

import type { Verdict } from './contracts.js';

export const POLICY_VERSION = 'v1' as const;
export type PolicyVersion = typeof POLICY_VERSION;

export type CapabilityName = 'network' | 'exec' | 'writes';

export type CapabilityRuleMode = 'allow' | 'block' | 'require_approval';

export interface PolicyGatesV1 {
  max_risk_score?: number;
  allow_verdicts?: Verdict[];
}

export interface PolicyCapabilityRuleV1 {
  mode: CapabilityRuleMode;
  /** Optional human-facing note explaining why this rule exists. */
  note?: string;
}

export interface PolicyConstraintsV1 {
  /** v0.1 requires exactly one manifest file (SKILL.md or skill.md). */
  exactly_one_manifest?: boolean;

  /** Total allowed bytes across all files in a bundle. */
  bundle_size_limit_bytes?: number;

  /** Max allowed bytes for any single file. */
  file_size_limit_bytes?: number;

  /** Token limit triggers for SKILL.md (rule-based tokenization in later stories). */
  max_manifest_tokens_warn?: number;
  max_manifest_tokens_fail?: number;
}

export interface PolicyProfileV1 {
  gates?: PolicyGatesV1;
  capabilities?: Partial<Record<CapabilityName, PolicyCapabilityRuleV1>>;
  constraints?: PolicyConstraintsV1;
}

export interface PolicyV1 extends PolicyProfileV1 {
  /** Optional, but if present must be "v1". */
  policy_version?: PolicyVersion;

  /** Named profiles (e.g., strict_v0). */
  profiles?: Record<string, PolicyProfileV1>;
}
