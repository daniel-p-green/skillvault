# SkillVault schemas (v0.3)

This document covers:
1. v0.1 trust JSON contracts (still active in v0.3)
2. benchmark v0 JSON/config contracts
3. manager v0.3 entities and API payloads
4. manager SQLite schema migrations through v0.3

## Trust contracts (v0.1, still active)

Contract IDs exported in `packages/cli/src/contracts.ts`:
- `skillvault.scan.v1`
- `skillvault.receipt.v1`
- `skillvault.verify.v1`
- `skillvault.gate.v1`
- `skillvault.diff.v1`
- `skillvault.export.v1`
- `skillvault.bench.run.v1`
- `skillvault.bench.report.v1`

All trust outputs include:

```json
{ "contract_version": "0.1" }
```

## Benchmark contracts (v0)

Config schema id:
- `skillvault.bench.config.v1`

Run/report output contracts:
- `skillvault.bench.run.v1`
- `skillvault.bench.report.v1`

Run output includes:
- per-task results (`condition_id`, `task_id`, `passed`, `duration_ms`, `error_category`)
- condition aggregates (`pass_rate`, sample counts, Wilson 95% interval)
- required deltas (`curated_vs_no_skill`, `self_generated_vs_no_skill`)
- `error_breakdown` grouped by condition and error category

Manager-core benchmark service types:
- `BenchConfigEntry`
- `BenchRunListEntry`
- `BenchRunServiceResult`
- `BenchRunOutput`
- `BenchReportOutput`

Manager-core benchmark storage layout:
- `.skillvault/export/bench/runs/<runId>.json`
- `.skillvault/export/bench/index.json`

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

### Deploy trust-gate error shape

When deploy is blocked by trust policy, manager-core emits:

```json
{
  "code": "DEPLOY_BLOCKED_BY_TRUST",
  "skillId": "string",
  "verdict": "FAIL",
  "riskTotal": 92,
  "overrideAllowed": true,
  "remediation": "Resolve scan findings or explicitly use override permissions for emergency rollout."
}
```

## Manager API payload contracts

### Bench endpoints

`GET /bench/configs` response:

```json
{
  "configs": [
    {
      "id": "bench/example.yaml",
      "name": "example.yaml",
      "path": "/absolute/path/to/bench/example.yaml",
      "source": "workspace"
    }
  ]
}
```

`POST /bench/runs` request:

```json
{
  "configPath": "bench/example.yaml",
  "deterministic": true,
  "save": true,
  "label": "nightly"
}
```

`POST /bench/runs` response:

```json
{
  "runId": "uuid",
  "runPath": "/absolute/path/to/.skillvault/export/bench/runs/uuid.json",
  "run": {},
  "report": {}
}
```

`GET /bench/runs` response:

```json
{
  "runs": [
    {
      "runId": "uuid",
      "createdAt": "1970-01-01T00:00:00.000Z",
      "deterministic": true
    }
  ]
}
```

`GET /bench/runs/:id` returns `BenchRunOutput`.

`GET /bench/runs/:id/report` returns `BenchReportOutput`.

### Deploy block and override behavior

`POST /skills/:id/deploy` accepts:

```json
{
  "adapter": "codex",
  "scope": "project",
  "mode": "symlink",
  "allowRiskOverride": false
}
```

Blocked deploy response:
- status code: `409`
- payload:

```json
{
  "code": "DEPLOY_BLOCKED_BY_TRUST",
  "message": "Deployment blocked for skill-id: latest trust verdict is FAIL (92).",
  "skillId": "skill-id",
  "verdict": "FAIL",
  "riskTotal": 92,
  "overrideAllowed": true,
  "remediation": "Resolve scan findings or explicitly use override permissions for emergency rollout."
}
```

Override denied (auth-required, non-admin):
- status code: `403`
- payload:

```json
{
  "code": "DEPLOY_OVERRIDE_FORBIDDEN",
  "error": "Risk override requires admin role"
}
```

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
