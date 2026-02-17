# CLI reference (v0.3)

SkillVault ships three command families:
- **Trust layer (v0.1-compatible)**: deterministic scan/receipt/verify/gate/diff/export
- **Benchmark layer (v0.1)**: reproducible A/B skill evaluations
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

## Benchmark commands

### `skillvault bench run`

```bash
skillvault bench run --config bench.yaml [--format json|table] [--out run.json] [--deterministic]
```

Notes:
- `--format json` (default) emits full run JSON (to stdout or `--out`)
- `--format table` emits a human-readable table to stdout
- with `--format table --out <file>`, SkillVault writes full run JSON to `--out` while still printing the table

### `skillvault bench report`

```bash
skillvault bench report --input bench-run.json [--format json|table] [--out report.txt]
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
skillvault manager deploy <skill_id> --adapter <id|*> [--scope project|global] [--mode copy|symlink] [--allow-risk-override] [--root <path>]
skillvault manager undeploy <skill_id> --adapter <id|*> [--scope project|global] [--root <path>]
```

Deploy trust-gate behavior:
- default: deploy is blocked when the latest trust verdict is `FAIL`
- explicit override: `--allow-risk-override` bypasses the block (admin-gated in API auth-required mode)

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
- `GET /bench/configs`
- `POST /bench/runs`
- `GET /bench/runs`
- `GET /bench/runs/:id`
- `GET /bench/runs/:id/report`
- `GET /me`
- `GET /rbac/roles`
- `POST /auth/tokens`
- `POST /sync`
- `POST /skills/:id/deploy` (supports `allowRiskOverride`)

When `SKILLVAULT_AUTH_MODE=required`, pass `Authorization: Bearer <token>` for protected routes.
