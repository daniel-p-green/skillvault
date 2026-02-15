# SkillVault v0.1 JSON contracts

Stable JSON contracts emitted by the SkillVault CLI.

Scope (v0.1):
- SKILL.md bundles only (exactly one `SKILL.md`/`skill.md` manifest)
- receipts are Ed25519 signed and verifiable offline
- scanning/scoring is deterministic and rule-based (no LLM scoring path)

Contract IDs are exported from `packages/cli/src/contracts.ts`:

- `skillvault.scan.v1`
- `skillvault.receipt.v1`
- `skillvault.verify.v1`
- `skillvault.gate.v1`
- `skillvault.diff.v1`
- `skillvault.export.v1`

All reports include `contract_version: "0.1"`.

## Common primitives

### Verdict
`"PASS" | "WARN" | "FAIL"`

Thresholds by `risk_score.total`:
- PASS: 0-29
- WARN: 30-59
- FAIL: 60-100

### FileEntry

```json
{
  "path": "src/index.ts",
  "size": 1234,
  "sha256": "<hex sha256 over raw bytes>"
}
```

### RiskScore

```json
{
  "base_risk": 20,
  "change_risk": 5,
  "policy_delta": 0,
  "total": 25
}
```

`total` is deterministic and clamped to `[0, 100]`.

### Finding

```json
{
  "code": "POLICY_MAX_RISK_EXCEEDED",
  "severity": "error",
  "message": "risk_score.total (72) exceeds policy gates.max_risk_score (59)",
  "path": "SKILL.md",
  "details": { "max_risk_score": 59, "total": 72 }
}
```

## Receipt signature envelope

`Receipt.signature` is required in v0.1:

```json
{
  "alg": "ed25519",
  "key_id": "optional",
  "payload_sha256": "<hex sha256 of canonical unsigned receipt payload>",
  "sig": "<base64 ed25519 signature>"
}
```

The signature covers canonical JSON bytes of the receipt with `signature` removed.

## Command contracts

### ScanReport (`skillvault scan`)
Required core fields:
- `created_at`
- `bundle_sha256`
- `files[]` (deterministic order)
- `manifest`
- `inferred_capabilities[]`
- `risk_score`
- `summary`
- `findings[]`

### Receipt (`skillvault receipt`)
Required core fields:
- `scanner` (name/version)
- `bundle_sha256`, `files[]`, `manifest`
- `scan` (capabilities, risk score, findings, summary)
- `policy` decision + reasons
- `signature`

### VerifyReport (`skillvault verify`)
Required core fields:
- `receipt.bundle_sha256`
- `bundle_sha256`
- `verified`
- `findings[]`
- `policy`

Verify must hard-fail (`verified: false`, non-zero exit) on invalid signature, missing key/keyring resolution failure, or any hash mismatch/tamper.

### GateReport (`skillvault gate`)
Required core fields:
- `verdict`
- `risk_score`
- `findings[]`
- `policy`

### DiffReport (`skillvault diff`)
Required core fields:
- `a.bundle_sha256?`, `b.bundle_sha256?`
- `file_diffs[]`
- `capability_deltas` (`added[]`, `removed[]`)
- `finding_deltas` (`added[]`, `removed[]`)
- `summary`

### ExportReport (`skillvault export`)
Required core fields:
- `validated`
- `bundle_sha256`
- `out_path`
- `files[]`
- `findings[]`

## Source of truth

Canonical types and reason codes live in:
- `packages/cli/src/contracts.ts`
