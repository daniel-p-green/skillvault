# SkillVault schemas (v0.3)

This document covers:
1. v0.1 trust JSON contracts (still active in v0.3)
2. manager v0.3 domain entities
3. manager SQLite schema migrations through v0.3

## Trust contracts (v0.1, still active)

Contract IDs exported in `packages/cli/src/contracts.ts`:
- `skillvault.scan.v1`
- `skillvault.receipt.v1`
- `skillvault.verify.v1`
- `skillvault.gate.v1`
- `skillvault.diff.v1`
- `skillvault.export.v1`

All trust outputs include:

```json
{ "contract_version": "0.1" }
```

## Receipt signature schema

```json
{
  "signature": {
    "alg": "ed25519",
    "key_id": "optional-key-id",
    "payload_sha256": "hex-sha256",
    "sig": "base64-signature"
  }
}
```

## Receipt policy hardening rule

When `scan.findings` contains any finding with `severity: "error"`:
- `receipt.policy.verdict` is forced to `FAIL`
- `receipt.policy.findings` includes `POLICY_SCAN_ERROR_FINDING`

## Gate receipt hardening rule

For `gate --receipt`:
- exactly one of `--pubkey` or `--keyring` is required
- signature verification must succeed before gate policy evaluation
- invalid/missing trust key resolution yields stable reason codes:
  - `SIGNATURE_KEY_NOT_FOUND`
  - `SIGNATURE_INVALID`

## Manager domain entities (v0.3)

Types live in `packages/manager-core/src/adapters/types.ts`.

### Core manager entities

- `AdapterSpec`
- `SkillRecord`
- `SkillVersionRecord`
- `DeploymentRecord`
- `AuditSummary`
- `DiscoveryResult`

### Telemetry entities

- `TelemetryEvent`
- `OutboxRecord`

### Eval entities

- `EvalDataset`
- `EvalCase`
- `EvalRun`
- `EvalResult`

### RBAC entities

- `Principal`
- `Role`
- `Permission`
- `ApiTokenRecord`

## SQLite schema (`.skillvault/skillvault.db`)

Migrations:
- `001_initial.sql`
- `002_telemetry.sql`
- `003_evals.sql`
- `004_rbac.sql`

### Core tables

- `skills`
- `skill_versions`
- `scan_runs`
- `receipts`
- `adapters`
- `deployments`
- `audit_events`

### Telemetry tables

- `telemetry_events`

`telemetry_events` status lifecycle:
- `pending`
- `retry`
- `sent`
- `dead_letter`
- `skipped`

### Eval tables

- `eval_datasets`
- `eval_cases`
- `eval_runs`
- `eval_results`

### RBAC tables

- `principals`
- `roles`
- `principal_roles`
- `api_tokens`

`api_tokens` stores only `token_hash` (sha256), never raw token values.
