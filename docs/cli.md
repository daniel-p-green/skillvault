# CLI reference (v0.2)

SkillVault ships two command families:
- **Trust layer (v0.1-compatible)**: deterministic scan/receipt/verify/gate/diff/export
- **Manager layer (v0.2)**: local vault inventory, deployment, audit, discovery, API serving

## Global options

- `--format json|table` (default: `json`)
- `--out <file>`
- `--deterministic`
- `--policy <policy.yaml>` (used by trust/gate flows and optionally attached to manager import metadata)

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

Security behavior:
- Receipt policy is forced to `FAIL` if scan includes any `error` severity finding.

### `skillvault verify <bundle_dir|bundle.zip>`

```bash
skillvault verify <bundle> --receipt receipt.json (--pubkey <file> | --keyring <dir>) [--policy policy.yaml] [--offline] [--format json|table] [--deterministic]
```

Hard-fail conditions:
- Signature invalid
- Signature key not found
- Any file/bundle hash mismatch
- Constraint/policy hard failures

### `skillvault gate (--receipt receipt.json | <bundle_dir|bundle.zip>)`

```bash
skillvault gate (--receipt receipt.json | <bundle>) --policy policy.yaml [--pubkey <file> | --keyring <dir>] [--bundle <bundle>] [--format json|table] [--deterministic]
```

`gate --receipt` requirements:
- exactly one of `--pubkey` or `--keyring` is required
- receipt signature must verify before policy gating
- optional `--bundle` performs full integrity verification before gate decision

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
```

### Serve local API

```bash
skillvault manager serve [--port 4646] [--root <path>]
```

---

## Examples

```bash
# Import and deploy to Codex + Windsurf + OpenClaw + Cursor + Claude Code
skillvault manager import ./my-skill
skillvault manager deploy my-skill --adapter '*' --scope project --mode symlink

# Gate a receipt with required trust verification
skillvault gate --receipt ./receipt.json --policy ./policy.yaml --pubkey ./ed25519-public.pem

# Gate a receipt and also verify full bundle integrity
skillvault gate --receipt ./receipt.json --bundle ./my-skill --policy ./policy.yaml --pubkey ./ed25519-public.pem
```
