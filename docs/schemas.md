# SkillVault v0.1 JSON contracts

This document defines the **stable JSON shapes** emitted by the SkillVault v0.1 CLI.

Scope (v0.1):
- **SKILL.md bundles only** (exactly one `SKILL.md`/`skill.md` manifest)
- **Offline-verifiable receipts** (no signatures in v0.1; hashing only)
- **Deterministic, rule-based scanning** (no LLM scoring path)

All contracts include `contract_version: "0.1"`.

---

## Common fields

### `Verdict`
`"PASS" | "WARN" | "FAIL"`

### Verdict thresholds (required)
Derived from total risk score (0–100):
- **PASS**: 0–29
- **WARN**: 30–59
- **FAIL**: 60–100

Represented in JSON as:

```json
{
  "thresholds": {
    "pass_max": 29,
    "warn_max": 59,
    "fail_max": 100
  }
}
```

### `FileEntry`
A bundle is represented as a list of files with raw-byte hashes.

```json
{
  "path": "src/index.ts",
  "size": 1234,
  "sha256": "<hex sha256 of raw bytes>"
}
```

### `Finding`
Machine-readable finding with a stable reason code.

```json
{
  "code": "POLICY_MAX_RISK_EXCEEDED",
  "severity": "error",
  "message": "risk_score.total (72) exceeds policy gates.max_risk_score (59)",
  "path": "SKILL.md",
  "details": { "max_risk_score": 59, "total": 72 }
}
```

### `ReasonCode` (stable strings)
Additive-only in v0.1.

Hash / integrity:
- `BUNDLE_HASH_MISMATCH`
- `FILE_HASH_MISMATCH`
- `RECEIPT_BUNDLE_HASH_MISMATCH`
- `RECEIPT_PARSE_ERROR`

Policy / gating:
- `POLICY_MAX_RISK_EXCEEDED`
- `POLICY_VERDICT_NOT_ALLOWED`
- `POLICY_CAPABILITY_BLOCKED`
- `POLICY_APPROVAL_REQUIRED`

Constraints:
- `CONSTRAINT_MANIFEST_COUNT`
- `CONSTRAINT_BUNDLE_SIZE_LIMIT`
- `CONSTRAINT_FILE_SIZE_LIMIT`
- `CONSTRAINT_TOKEN_LIMIT_WARN`
- `CONSTRAINT_TOKEN_LIMIT_FAIL`

---

## `RiskScore`

Risk scoring is stored as components for auditability.

```json
{
  "base_risk": 20,
  "change_risk": 5,
  "policy_delta": 0,
  "total": 25
}
```

- `total` must be deterministic and in `[0, 100]`.
- v0.1 uses rule-based capability inference and rule-based risk heuristics.

---

## Reports

### `ScanReport`
Produced by: `skillvault scan ... --format json`

Required fields:
- `created_at` (ISO timestamp; frozen in deterministic mode)
- `bundle_sha256`
- `files[]` (sorted deterministically by path)
- `manifest` (exactly one in v0.1)
- `capabilities[]` (deduped + sorted)
- `risk_score`
- `summary`
- `findings[]` (scanner findings, pre-policy)

### `Receipt`
Produced by: `skillvault receipt ... --format json`

Receipt binds a policy decision to a specific bundle hash + file list.

Required fields:
- `scanner` (name + version)
- `bundle_sha256`, `files[]`, `manifest`
- `scan` (capabilities, risk_score, findings, summary)
- `policy` (`PolicyDecision`)

### `VerifyReport`
Produced by: `skillvault verify ... --format json`

Verification MUST hard-fail (`verified: false`) on:
- any content hash mismatch between bundle and receipt
- any constraint violations
- missing required approvals (approval system may be empty/placeholder in v0.1, but the decision is deterministic)

Required fields:
- `receipt.bundle_sha256`
- `bundle_sha256`
- `verified`
- `findings[]`
- `policy`

### `GateReport`
Produced by: `skillvault gate ... --format json`

Applies a policy to either a fresh scan or an existing receipt.

Required fields:
- `verdict`
- `risk_score`
- `findings[]`
- `policy`

### `DiffReport`
Produced by: `skillvault diff ... --format json`

Required fields:
- `a.bundle_sha256?`, `b.bundle_sha256?`
- `file_diffs[]` (each entry includes `path`, change type, and optional `a`/`b` hash+size)
- `summary` counts for added/removed/modified/unchanged

---

## Canonical TypeScript source

The canonical TypeScript type definitions live in:
- `packages/cli/src/contracts.ts`
