# skillvault

SkillVault v0.3 is a local-first **skill trust + operations manager** for multi-agent environments.

It keeps the v0.1 deterministic trust layer and extends v0.2 manager flows with:
- telemetry outbox and optional Weave export
- deterministic eval datasets/runs/comparisons
- additive RBAC/token preparation for API access control
- expanded manager GUI pages for telemetry, evals, and access

## Why v0.3

Teams run skills across Codex, Windsurf, OpenClaw, Cursor, Claude Code, and more. v0.3 adds continuous quality + access controls without giving up local-first operation:
- import/inventory/deploy/audit still work offline
- telemetry events can stay local (`jsonl`) or flush to Weave
- regression checks are first-class (`eval seed/run/compare`)
- API auth can be enabled when needed (`SKILLVAULT_AUTH_MODE=required`)

## Requirements
- Node.js >= 18

## Install

```bash
npm install
```

## Build, Typecheck, Test

```bash
npm run build
npm run typecheck
npm test
./scripts/test-goldens.sh
```

## Quickstart

### 1) Initialize manager storage

```bash
node packages/cli/dist/cli.js manager init
```

Creates:
- `.skillvault/skillvault.db`
- `.skillvault/vault/`
- `.skillvault/receipts/`
- `.skillvault/export/`

### 2) (Optional) bootstrap API auth token

```bash
node packages/cli/dist/cli.js manager auth bootstrap
```

### 3) Import, deploy, and audit

```bash
node packages/cli/dist/cli.js manager import /path/to/skill-bundle
node packages/cli/dist/cli.js manager deploy <skill_id> --adapter codex --scope project --mode symlink
node packages/cli/dist/cli.js manager audit --stale-days 14 --format table
```

### 4) Telemetry and eval loops

```bash
node packages/cli/dist/cli.js manager telemetry status
node packages/cli/dist/cli.js manager telemetry flush --target jsonl
node packages/cli/dist/cli.js manager eval datasets seed
node packages/cli/dist/cli.js manager eval run --dataset default-manager-regression
```

### 5) Start API + GUI

```bash
npm run dev:api
npm run dev:web
# or both:
npm run dev:manager
```

Manager API defaults to `http://127.0.0.1:4646`.

## Adapter Matrix (skills.sh parity snapshot)

Built-in snapshot includes:

`amp`, `kimi-cli`, `replit`, `antigravity`, `augment`, `claude-code`, `openclaw`, `cline`, `codebuddy`, `codex`, `command-code`, `continue`, `crush`, `cursor`, `droid`, `gemini-cli`, `github-copilot`, `goose`, `junie`, `iflow-cli`, `kilo`, `kiro-cli`, `kode`, `mcpjam`, `mistral-vibe`, `mux`, `opencode`, `openhands`, `pi`, `qoder`, `qwen-code`, `roo`, `trae`, `trae-cn`, `windsurf`, `zencoder`, `neovate`, `pochi`, `adal`.

OpenClaw fallback detection order:
1. `~/.openclaw/skills`
2. `~/.clawdbot/skills`
3. `~/.moltbot/skills`

## GUI Screenshots (Placeholder)

Screenshots section for v0.3 pages:
- Dashboard
- Skill Detail
- Adapters
- Deploy Flow
- Audit
- Discover
- Telemetry
- Evals
- Access

## Trust + Security Model

v0.3 preserves v0.1/v0.2 trust behavior:
- `verify` requires exactly one of `--pubkey` or `--keyring`
- `gate --receipt` requires exactly one of `--pubkey` or `--keyring`
- `gate --receipt` verifies signature trust before policy evaluation
- `gate --receipt --bundle` performs full integrity verification before gating
- receipt policy is forced to `FAIL` when scan findings contain `error`

v0.3 adds additive auth mode:
- default: `SKILLVAULT_AUTH_MODE=off` (backward-compatible)
- optional: `SKILLVAULT_AUTH_MODE=required` (RBAC enforcement on API routes)
- API tokens are stored hashed (`sha256`) and role-scoped

v0.3 telemetry export safety:
- local `jsonl` flush available by default
- Weave export only runs when endpoint config is present and allowed

## Command Families

### Trust layer (v0.1-compatible)
- `skillvault scan`
- `skillvault receipt`
- `skillvault verify`
- `skillvault gate`
- `skillvault diff`
- `skillvault export`

### Manager layer (v0.3)
- `skillvault manager init`
- `skillvault manager adapters ...`
- `skillvault manager import`
- `skillvault manager inventory`
- `skillvault manager deploy`
- `skillvault manager undeploy`
- `skillvault manager audit`
- `skillvault manager discover`
- `skillvault manager telemetry status`
- `skillvault manager telemetry flush`
- `skillvault manager eval datasets seed`
- `skillvault manager eval run`
- `skillvault manager eval compare`
- `skillvault manager auth bootstrap`
- `skillvault manager auth token create`
- `skillvault manager serve`

## API Quickstart

```bash
# with auth off (default)
curl http://127.0.0.1:4646/health

# with auth required, pass bearer token
curl -H "Authorization: Bearer <token>" http://127.0.0.1:4646/skills
```

## Docs

- CLI reference: [`docs/cli.md`](./docs/cli.md)
- Policy schema: [`docs/policy.md`](./docs/policy.md)
- Scoring: [`docs/scoring.md`](./docs/scoring.md)
- JSON + manager schemas: [`docs/schemas.md`](./docs/schemas.md)
- Product docs: [`docs/product/JTBD.md`](./docs/product/JTBD.md)
- PRD v0.3: [`docs/PRD.md`](./docs/PRD.md)

## License

MIT (see [`LICENSE`](./LICENSE)).
