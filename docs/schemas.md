# SkillVault schemas (v0.2)

This document covers:
1. v0.1 trust JSON contracts (still active in v0.2)
2. manager domain entities and storage schema

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
- `receipt.policy.findings` includes:

```json
{
  "code": "POLICY_SCAN_ERROR_FINDING",
  "severity": "error",
  "message": "Receipt policy is forced to FAIL because scan findings contain error severity entries."
}
```

## Gate receipt hardening rule

For `gate --receipt`:
- exactly one of `--pubkey` or `--keyring` is required
- signature verification must succeed before gate policy evaluation
- invalid/missing trust key resolution yields stable reason codes:
  - `SIGNATURE_KEY_NOT_FOUND`
  - `SIGNATURE_INVALID`

## Manager domain entities

Types live in `packages/manager-core/src/adapters/types.ts`.

### `AdapterSpec`
- `id`
- `displayName`
- `projectPath`
- `globalPath`
- `detectionPaths[]`
- `manifestFilenames[]`
- `supportsSymlink`
- `supportsGlobal`
- `notes?`

### `SkillRecord`
- `id`
- `name`
- `description`
- `sourceType`
- `sourceLocator`
- `createdAt`
- `updatedAt`

### `SkillVersionRecord`
- `id`
- `skillId`
- `versionHash`
- `manifestPath`
- `bundleSha256`
- `createdAt`
- `isCurrent`

### `DeploymentRecord`
- `id`
- `skillVersionId`
- `adapterId`
- `installScope`
- `installedPath`
- `installMode`
- `status`
- `deployedAt`
- `driftStatus`

### `AuditSummary`
- `totals.skills`
- `totals.deployments`
- `totals.staleSkills`
- `totals.driftedDeployments`
- `staleSkills[]`
- `driftedDeployments[]`

### `DiscoveryResult`
- `installRef`
- `url`
- `installs?`
- `title?`

## SQLite schema (`.skillvault/skillvault.db`)

Migration: `packages/manager-core/src/storage/migrations/001_initial.sql`

Tables:
- `skills`
- `skill_versions`
- `scan_runs`
- `receipts`
- `adapters`
- `deployments`
- `audit_events`

These tables support inventory, deploy/undeploy history, receipt binding, adapter snapshot, and drift/staleness audit.
