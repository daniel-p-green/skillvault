# skillvault

Local-first security scanning + normalization for AI agent skills.

## Status
This repo currently contains the **MVP scaffold** (TypeScript workspace + CLI skeleton). Scanner rules and normalization are implemented in subsequent stories.

## Requirements
- Node.js >= 18

## Install
From the repo root:

```bash
npm install
```

## Scripts

```bash
npm test
npm run typecheck
npm run build
```

## CLI (scaffold)
The CLI binary is provided by `packages/cli`.

```bash
node packages/cli/dist/cli.js --help
# or after build, via npm bin linking in your environment
```

The `scan` command is present but not implemented yet in this story.

## Project brief
See [`MASTER_CONTEXT.md`](./MASTER_CONTEXT.md).

## Contributing
- See [`AGENTS.md`](./AGENTS.md) for guardrails.
- See [`PLAN.md`](./PLAN.md) for the MVP roadmap.

## License
MIT (see [`LICENSE`](./LICENSE)).
