/**
 * SkillVault v0.1 JSON contracts.
 *
 * These types are the canonical, stable shapes for CLI JSON outputs.
 * v0.1 is intentionally signature-less and offline-verifiable via deterministic hashing.
 */

export const CONTRACT_VERSION = '0.1' as const;

export type ContractVersion = typeof CONTRACT_VERSION;

export type OutputFormat = 'json' | 'table';

export type Verdict = 'PASS' | 'WARN' | 'FAIL';

export type FindingSeverity = 'info' | 'warn' | 'error';

/**
 * Stable, machine-readable reason codes.
 *
 * Notes:
 * - Use these in JSON outputs and tests.
 * - Additive only (do not rename/delete in v0.1).
 */
export const ReasonCodes = [
  // Hash / integrity
  'BUNDLE_HASH_MISMATCH',
  'FILE_HASH_MISMATCH',
  'FILE_MISSING',
  'FILE_EXTRA',
  'RECEIPT_BUNDLE_HASH_MISMATCH',
  'RECEIPT_PARSE_ERROR',

  // Policy / gating
  'POLICY_MAX_RISK_EXCEEDED',
  'POLICY_VERDICT_NOT_ALLOWED',
  'POLICY_CAPABILITY_BLOCKED',
  'POLICY_APPROVAL_REQUIRED',
  'POLICY_VIOLATION',
  'REQUIRED_APPROVAL_MISSING',
  'POLICY_PARSE_ERROR',
  'POLICY_SCHEMA_INVALID',

  // Constraints
  'CONSTRAINT_MANIFEST_COUNT',
  'CONSTRAINT_BUNDLE_SIZE_LIMIT',
  'CONSTRAINT_FILE_SIZE_LIMIT',
  'CONSTRAINT_TOKEN_LIMIT_WARN',
  'CONSTRAINT_TOKEN_LIMIT_FAIL',

  // Strict bundle hygiene
  'CONSTRAINT_UNSAFE_PATH',
  'CONSTRAINT_SYMLINK_FORBIDDEN'
] as const;

export type ReasonCode = (typeof ReasonCodes)[number];

export interface Finding {
  code: ReasonCode;
  severity: FindingSeverity;
  message: string;
  /** Optional path if the finding applies to a single file. */
  path?: string;
  /**
   * Arbitrary structured details for debugging/auditing.
   * Keep stable keys; values must be JSON-serializable.
   */
  details?: Record<string, unknown>;
}

export interface FileEntry {
  /** POSIX-like, forward-slash path relative to the bundle root. */
  path: string;
  /** Raw byte size of the file. */
  size: number;
  /** SHA-256 over raw bytes, hex-encoded. */
  sha256: string;
}

export interface ManifestRef {
  /** Path to SKILL.md / skill.md in the bundle root. */
  path: string;
  size: number;
  sha256: string;
}

export type Capability =
  | 'network'
  | 'exec'
  | 'writes'
  | 'reads'
  | 'secrets'
  | 'dynamic_code';

export interface RiskScore {
  /**
   * Risk score components are stored separately for auditability.
   * Total must be deterministic and in [0, 100].
   */
  base_risk: number;
  change_risk: number;
  policy_delta: number;
  total: number;
}

export interface VerdictThresholds {
  /** PASS: 0..pass_max */
  pass_max: 29;
  /** WARN: (pass_max+1)..warn_max */
  warn_max: 59;
  /** FAIL: (warn_max+1)..100 */
  fail_max: 100;
}

export const DEFAULT_THRESHOLDS: VerdictThresholds = {
  pass_max: 29,
  warn_max: 59,
  fail_max: 100
} as const;

export function verdictFromRiskScore(score: number): Verdict {
  // Normalize / clamp for safety.
  const s = Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 100;

  if (s <= DEFAULT_THRESHOLDS.pass_max) return 'PASS';
  if (s <= DEFAULT_THRESHOLDS.warn_max) return 'WARN';
  return 'FAIL';
}

export interface PolicyDecision {
  contract_version: ContractVersion;
  verdict: Verdict;
  thresholds: VerdictThresholds;
  /**
   * Optional policy gate configuration used to decide this verdict.
   * (Included for transparency and stable test fixtures.)
   */
  gates?: {
    max_risk_score?: number;
    allow_verdicts?: Verdict[];
  };
  risk_score: RiskScore;
  /** Ordered list of findings that explain the decision. */
  findings: Finding[];
}

export interface ScanSummary {
  file_count: number;
  total_bytes: number;
  /**
   * True if the scanner ran in deterministic mode (timestamps frozen, stable ordering enforced).
   */
  deterministic: boolean;
}

export interface ScanReport {
  contract_version: ContractVersion;
  /** ISO timestamp (frozen in deterministic mode). */
  created_at: string;
  bundle_sha256: string;
  files: FileEntry[];
  /** Exactly one manifest is required in v0.1. */
  manifest: ManifestRef;
  /** Inferred capabilities, deduped + sorted. */
  capabilities: Capability[];
  /** Risk score computed from deterministic rules. */
  risk_score: RiskScore;
  summary: ScanSummary;
  /** Scanner findings (pre-policy). */
  findings: Finding[];
}

export interface Receipt {
  contract_version: ContractVersion;
  created_at: string;
  scanner: {
    name: 'skillvault';
    version: string;
  };
  /**
   * Receipt binds to a specific bundle hash + file list.
   * Offline verification recomputes these values and compares.
   */
  bundle_sha256: string;
  files: FileEntry[];
  manifest: ManifestRef;
  scan: {
    capabilities: Capability[];
    risk_score: RiskScore;
    summary: ScanSummary;
    findings: Finding[];
  };
  policy: PolicyDecision;
}

export interface VerifyReport {
  contract_version: ContractVersion;
  created_at: string;
  /**
   * The receipt provided for verification.
   * Implementations may include the full receipt, or a receipt summary.
   */
  receipt: {
    bundle_sha256: string;
  };
  bundle_sha256: string;
  /** True only if hashes match and policy constraints pass. */
  verified: boolean;
  /** Verification findings include hard failures (hash mismatch, constraint violations). */
  findings: Finding[];
  policy: PolicyDecision;
}

export interface GateReport {
  contract_version: ContractVersion;
  created_at: string;
  /**
   * Gate applies a policy to either a bundle scan or an existing receipt.
   */
  verdict: Verdict;
  risk_score: RiskScore;
  findings: Finding[];
  policy: PolicyDecision;
}

export interface FileDiff {
  path: string;
  change: 'added' | 'removed' | 'modified' | 'unchanged';
  a?: Pick<FileEntry, 'sha256' | 'size'>;
  b?: Pick<FileEntry, 'sha256' | 'size'>;
}

export interface DiffReport {
  contract_version: ContractVersion;
  created_at: string;
  /**
   * Each side may be either a bundle-derived scan/receipt.
   * Use bundle_sha256 values when available.
   */
  a: { bundle_sha256?: string };
  b: { bundle_sha256?: string };
  file_diffs: FileDiff[];
  /**
   * Security-relevant capability deltas (deduped + sorted).
   * v0.1 values are rule-based and deterministic.
   */
  capability_deltas: {
    added: Capability[];
    removed: Capability[];
  };
  /**
   * Finding deltas by rule_id (preferred) or a stable fallback key.
   * This is used for change-risk scoring.
   */
  finding_deltas: {
    added: string[];
    removed: string[];
  };
  summary: {
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
  };
}
