# skillvault

SkillVault v0.2 is a local-first **skill trust + deployment manager** for multi-agent environments.

It keeps the v0.1 trust layer (`scan`, `receipt`, `verify`, `gate`, `diff`, `export`) and adds:
- a manager vault (`.skillvault/`) with SQLite metadata + canonical file storage
- multi-app adapter deployment (Codex, Windsurf, OpenClaw, Cursor, Claude Code, and more)
- local API service for automation and GUI
- React manager UI ("Operations Atelier")

## Why v0.2

Teams run skills across multiple AI apps. SkillVault v0.2 gives one local control plane to:
- ingest and inventory skill bundles
- evaluate risk and trust receipts
- deploy/undeploy across adapters
- audit drift and stale scans

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

### 2) Import and inventory a skill

```bash
node packages/cli/dist/cli.js manager import /path/to/skill-bundle
node packages/cli/dist/cli.js manager inventory --format table
```

### 3) Deploy across adapters

```bash
node packages/cli/dist/cli.js manager deploy <skill_id> --adapter codex --scope project --mode symlink
node packages/cli/dist/cli.js manager deploy <skill_id> --adapter '*' --scope project --mode symlink
```

### 4) Audit drift and stale state

```bash
node packages/cli/dist/cli.js manager audit --stale-days 14 --format table
```

### 5) Start API + GUI

```bash
npm run dev:api
npm run dev:web
# or both:
npm run dev:manager
```

Manager API defaults to `http://127.0.0.1:4646`.

## Adapter Matrix (v0.2 Snapshot)

Built-in snapshot includes:

`amp`, `kimi-cli`, `replit`, `antigravity`, `augment`, `claude-code`, `openclaw`, `cline`, `codebuddy`, `codex`, `command-code`, `continue`, `crush`, `cursor`, `droid`, `gemini-cli`, `github-copilot`, `goose`, `junie`, `iflow-cli`, `kilo`, `kiro-cli`, `kode`, `mcpjam`, `mistral-vibe`, `mux`, `opencode`, `openhands`, `pi`, `qoder`, `qwen-code`, `roo`, `trae`, `trae-cn`, `windsurf`, `zencoder`, `neovate`, `pochi`, `adal`.

OpenClaw fallback detection order:
1. `~/.openclaw/skills`
2. `~/.clawdbot/skills`
3. `~/.moltbot/skills`

## GUI Screenshots (Placeholder)

Screenshots will be added here as the v0.2 interface stabilizes:
- Dashboard
- Skill Detail
- Adapters
- Deploy Flow
- Audit
- Discover

## Trust Model and Security Caveats

v0.2 keeps v0.1 deterministic trust behavior and hardens receipt gating:

- `verify` requires exactly one of `--pubkey` or `--keyring`.
- `gate --receipt` now also requires exactly one of `--pubkey` or `--keyring`.
- `gate --receipt` fails before policy evaluation if signature trust cannot be established.
- optional `gate --receipt --bundle <path>` performs full content/hash verification before policy gating.
- receipt generation forces policy `FAIL` when scan findings contain any `error` severity.

SkillVault is local-first and not a central registry. Trust still depends on your key management and policy definitions.

## Command Families

### Trust layer (v0.1-compatible)
- `skillvault scan`
- `skillvault receipt`
- `skillvault verify`
- `skillvault gate`
- `skillvault diff`
- `skillvault export`

### Manager layer (v0.2)
- `skillvault manager init`
- `skillvault manager adapters list`
- `skillvault manager adapters sync-snapshot`
- `skillvault manager adapters enable`
- `skillvault manager adapters disable`
- `skillvault manager adapters override`
- `skillvault manager adapters validate`
- `skillvault manager import`
- `skillvault manager inventory`
- `skillvault manager deploy`
- `skillvault manager undeploy`
- `skillvault manager audit`
- `skillvault manager discover`
- `skillvault manager serve`

## Docs

- CLI reference: [`docs/cli.md`](./docs/cli.md)
- Policy schema: [`docs/policy.md`](./docs/policy.md)
- Scoring: [`docs/scoring.md`](./docs/scoring.md)
- JSON and manager schemas: [`docs/schemas.md`](./docs/schemas.md)
- Product docs: [`docs/product/JTBD.md`](./docs/product/JTBD.md)
- PRD v0.2: [`docs/PRD.md`](./docs/PRD.md)

## License

MIT (see [`LICENSE`](./LICENSE)).
