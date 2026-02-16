# CLI reference (v0.3)

SkillVault ships two command families:
- **Trust layer (v0.1-compatible)**: deterministic scan/receipt/verify/gate/diff/export
- **Manager layer (v0.3)**: local vault operations plus telemetry/evals/RBAC prep

## Global options

- `--format json|table` (default: `json`)
- `--out <file>`
- `--deterministic`
- `--policy <policy.yaml>`

---

## Trust commands

### `skillvault scan <bundle_dir|bundle.zip>`

```bash
skillvault scan <bundle> [--format json|table] [--out file] [--deterministic]
```

### `skillvault receipt <bundle_dir|bundle.zip>`

```bash
skillvault receipt <bundle> --signing-key <ed25519-private.pem> [--key-id id] [--policy policy.yaml] [--out receipt.json] [--deterministic]
```

### `skillvault verify <bundle_dir|bundle.zip>`

```bash
skillvault verify <bundle> --receipt receipt.json (--pubkey <file> | --keyring <dir>) [--policy policy.yaml] [--offline] [--format json|table] [--deterministic]
```

### `skillvault gate (--receipt receipt.json | <bundle_dir|bundle.zip>)`

```bash
skillvault gate (--receipt receipt.json | <bundle>) --policy policy.yaml [--pubkey <file> | --keyring <dir>] [--bundle <bundle>] [--format json|table] [--deterministic]
```

### `skillvault diff --a <bundle|receipt> --b <bundle|receipt>`

```bash
skillvault diff --a <input> --b <input> [--format json|table] [--deterministic]
```

### `skillvault export <bundle_dir>`

```bash
skillvault export <bundle_dir> --out bundle.zip [--policy policy.yaml] [--profile strict_v0]
```

---

## Manager commands

### Initialize manager vault

```bash
skillvault manager init [--root <path>]
```

### Adapter operations

```bash
skillvault manager adapters list [--root <path>] [--format json|table]
skillvault manager adapters sync-snapshot [--root <path>]
skillvault manager adapters enable <id> [--root <path>]
skillvault manager adapters disable <id> [--root <path>]
skillvault manager adapters override --file <adapter-spec.json> [--root <path>]
skillvault manager adapters validate [--root <path>] [--format json|table]
```

### Import and inventory

```bash
skillvault manager import <bundle_dir|bundle.zip> [--source <path|url>] [--policy <policy.yaml>] [--root <path>]
skillvault manager inventory [--risk PASS|WARN|FAIL] [--adapter <id>] [--search <q>] [--root <path>] [--format json|table]
```

### Deploy and undeploy

```bash
skillvault manager deploy <skill_id> --adapter <id|*> [--scope project|global] [--mode copy|symlink] [--root <path>]
skillvault manager undeploy <skill_id> --adapter <id|*> [--scope project|global] [--root <path>]
```

### Audit and discover

```bash
skillvault manager audit [--stale-days <n>] [--format json|table] [--root <path>]
skillvault manager discover --query "<text>" [--root <path>]
skillvault manager discover-sources [--root <path>] [--format json|table]
skillvault manager sync [--with-summary] [--root <path>] [--format json|table]
```

### Telemetry

```bash
skillvault manager telemetry status [--limit <n>] [--root <path>] [--format json|table]
skillvault manager telemetry flush [--target jsonl|weave] [--max-events <n>] [--root <path>]
```

### Evals

```bash
skillvault manager eval datasets seed [--dataset <id>] [--root <path>]
skillvault manager eval datasets list [--root <path>]
skillvault manager eval run --dataset <id> [--baseline <run_id>] [--fail-on-regression] [--root <path>]
skillvault manager eval compare --run <run_id> [--root <path>]
```

### Auth / RBAC

```bash
skillvault manager auth bootstrap [--root <path>]
skillvault manager auth token create --principal <id> --role <admin|operator|viewer> [--label <label>] [--expires-at <iso>] [--root <path>]
```

### Serve local API

```bash
skillvault manager serve [--port 4646] [--root <path>]
```

---

## API routes consumed by manager web

- `GET /health`
- `GET /skills`
- `GET /skills/filesystem`
- `GET /deployments`
- `GET /audit/summary`
- `GET /discover/sources`
- `GET /telemetry/status`
- `POST /telemetry/flush`
- `GET /evals/datasets`
- `POST /evals/runs`
- `GET /evals/runs/:id`
- `GET /me`
- `GET /rbac/roles`
- `POST /auth/tokens`
- `POST /sync`

When `SKILLVAULT_AUTH_MODE=required`, pass `Authorization: Bearer <token>` for protected routes.
