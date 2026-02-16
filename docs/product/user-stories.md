# User Stories

## Story S-1

As a solo developer, I want to import a skill bundle into a local vault so that I can track trusted versions over time.

Acceptance criteria:
- Imported files are stored under `.skillvault/vault/<skill_id>/<version_hash>/`.
- Inventory returns current version with verdict/risk metadata.

## Story S-2

As a multi-app user, I want to deploy one skill to multiple adapters so that my environment stays consistent across tools.

Acceptance criteria:
- `--adapter '*'` deploys to enabled adapters.
- Results include adapter-level status and path.

## Story S-3

As a security owner, I want `gate --receipt` to require key-based trust verification so that unsigned/tampered receipts cannot pass.

Acceptance criteria:
- `gate --receipt` requires exactly one of `--pubkey` or `--keyring`.
- signature failures emit stable reason codes.

## Story S-4

As a security owner, I want receipt policy to fail when scan findings include errors so that high-risk bundles cannot appear policy-clean.

Acceptance criteria:
- receipt policy verdict is forced to `FAIL` on any `error` severity finding.
- policy findings include `POLICY_SCAN_ERROR_FINDING`.

## Story S-5

As an operator, I want telemetry outbox visibility and flush controls so that I can ship local or cloud-ready observability.

Acceptance criteria:
- telemetry status includes pending/retry/sent/dead-letter totals.
- flush supports `jsonl` and optional `weave` targets.

## Story S-6

As an ops owner, I want deterministic eval runs and comparisons so that regressions are caught before rollout.

Acceptance criteria:
- dataset seed/run/compare commands are available.
- run output contains score and baseline delta.
- optional regression gate can return non-zero exit.

## Story S-7

As a team lead, I want role-scoped API tokens so that sensitive endpoints are restricted when shared locally.

Acceptance criteria:
- bootstrap creates default roles (`viewer`, `operator`, `admin`).
- tokens are stored hashed and scoped by role.
- `SKILLVAULT_AUTH_MODE=required` enforces protected-route permissions.

## Story S-8

As a GUI user, I want Telemetry/Evals/Access pages so that I can operate v0.3 workflows without memorizing CLI syntax.

Acceptance criteria:
- GUI includes `Telemetry`, `Evals`, and `Access` pages.
- new pages render in desktop/mobile layouts and pass frontend tests.
