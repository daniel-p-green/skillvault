# skillvault

Local-first trust receipts + deterministic policy gating for **SKILL.md bundles**.

v0.1 decisions:
- **SKILL.md bundles only** (exactly one `SKILL.md`/`skill.md` manifest)
- Receipts are **Ed25519-signed** and offline-verifiable by deterministic hashing
- Scanning/scoring is **deterministic + rule-based** (no LLM scoring path)

## Requirements
- Node.js >= 18

## Install

```bash
npm install
```

## Build

```bash
npm run build
```

## Quickstart

Run the CLI via the built JS:

```bash
node packages/cli/dist/cli.js --help
```

Scan a bundle (directory or zip):

```bash
node packages/cli/dist/cli.js scan <bundle_dir|bundle.zip> --format table
```

Generate a receipt:

```bash
node packages/cli/dist/cli.js receipt <bundle_dir|bundle.zip> --signing-key ed25519-private.pem --out receipt.json
```

Verify a bundle matches a receipt (offline):

```bash
node packages/cli/dist/cli.js verify <bundle_dir|bundle.zip> --receipt receipt.json --pubkey ed25519-public.pem --offline --format table
```

Apply a policy gate:

```bash
node packages/cli/dist/cli.js gate <bundle_dir|bundle.zip> --policy policy.yaml --format table
# or gate an existing receipt:
node packages/cli/dist/cli.js gate --receipt receipt.json --policy policy.yaml --format table
```

Diff two bundles/receipts:

```bash
node packages/cli/dist/cli.js diff --a <bundle|receipt> --b <bundle|receipt> --format table
```

Export a directory bundle to a strict zip:

```bash
node packages/cli/dist/cli.js export <bundle_dir> --out bundle.zip --policy policy.yaml --profile strict_v0
```

Deterministic mode (for goldens / CI):

```bash
node packages/cli/dist/cli.js scan <bundle> --format json --deterministic
```

## Command reference

- CLI: [`docs/cli.md`](./docs/cli.md)
- Policy schema: [`docs/policy.md`](./docs/policy.md)
- Risk scoring rubric: [`docs/scoring.md`](./docs/scoring.md)
- JSON output contracts: [`docs/schemas.md`](./docs/schemas.md)
- Signing + keyring usage: [`docs/signing.md`](./docs/signing.md)
- Deterministic mode + goldens: [`docs/deterministic.md`](./docs/deterministic.md)
- PRD: [`docs/PRD.md`](./docs/PRD.md)

## Scripts

```bash
npm test
npm run typecheck
npm run build
```

## License
MIT (see [`LICENSE`](./LICENSE)).
