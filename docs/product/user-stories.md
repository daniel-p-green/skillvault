# User Stories

## Story S-1

As a solo developer, I want to import a skill bundle into a local vault so that I can track trusted versions over time.

Acceptance criteria:
- Import command stores files under `.skillvault/vault/<skill_id>/<version_hash>/`.
- Inventory lists the imported skill with verdict and risk score.

## Story S-2

As a multi-app user, I want to deploy one skill to multiple adapters so that my environment stays consistent across tools.

Acceptance criteria:
- Deploy command supports `--adapter '*'`.
- Result contains adapter-level deployment statuses.
- Milestone adapters (`codex`, `windsurf`, `openclaw`, `cursor`, `claude-code`) are supported.

## Story S-3

As a security owner, I want `gate --receipt` to require key-based trust validation so that unsigned or tampered receipts cannot pass policy checks.

Acceptance criteria:
- `gate --receipt` fails usage when neither `--pubkey` nor `--keyring` is provided.
- Signature failures return stable reason codes (`SIGNATURE_INVALID` or `SIGNATURE_KEY_NOT_FOUND`).

## Story S-4

As a security owner, I want receipt policy to fail when scan findings include errors so that dangerous bundles cannot look policy-clean.

Acceptance criteria:
- Receipt policy verdict is forced to `FAIL` when any scan finding severity is `error`.
- Policy findings include `POLICY_SCAN_ERROR_FINDING`.

## Story S-5

As a team lead, I want audits to show drift and stale scans so that I can remediate risk before it spreads.

Acceptance criteria:
- Audit reports stale scans using configurable day threshold.
- Audit reports missing paths, symlink divergence, and copy-mode content drift.

## Story S-6

As an operator, I want a GUI for manager workflows so that I can run inventory, deploy, audit, and discovery tasks without memorizing all CLI syntax.

Acceptance criteria:
- GUI has pages for Dashboard, Skill Detail, Adapters, Deploy, Audit, Discover.
- GUI remains usable on desktop and mobile widths.
