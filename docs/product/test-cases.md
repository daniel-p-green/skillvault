# Test Cases

## Traceability Matrix

- S-1 -> TC-1, TC-2
- S-2 -> TC-3, TC-4
- S-3 -> TC-5, TC-6
- S-4 -> TC-7
- S-5 -> TC-8, TC-9
- S-6 -> TC-10, TC-11
- S-7 -> TC-12, TC-13
- S-8 -> TC-14, TC-15, MTC-1

## Automated Test Cases

### TC-1 Manager init/import/inventory end-to-end

- Story: S-1
- Type: integration
- Expected: imported skill appears with current version metadata.

### TC-2 SQLite migrations through v0.3

- Story: S-1
- Type: unit
- Expected: v0.3 tables exist (`telemetry_events`, eval tables, RBAC tables).

### TC-3 Multi-adapter deployment matrix

- Story: S-2
- Type: integration
- Expected: deployment outcomes include `codex`, `windsurf`, `openclaw`, `cursor`, `claude-code`.

### TC-4 Deploy idempotency and drift detection

- Story: S-2
- Type: unit/integration
- Expected: repeated symlink deploy is skipped; copy-mode mutation is detected as drift.

### TC-5 Gate receipt requires key input

- Story: S-3
- Type: CLI behavior
- Expected: usage error without `--pubkey` or `--keyring`.

### TC-6 Gate fails on invalid receipt signature

- Story: S-3
- Type: CLI behavior
- Expected: verdict `FAIL` with signature reason code.

### TC-7 Receipt forced FAIL on scan errors

- Story: S-4
- Type: unit
- Expected: receipt includes forced-fail policy finding.

### TC-8 Telemetry event capture and outbox files

- Story: S-5
- Type: integration
- Expected: import/deploy/undeploy/audit emit telemetry rows and outbox files.

### TC-9 Telemetry flush success/retry/dead-letter

- Story: S-5
- Type: integration
- Expected: flush supports success and failure states without breaking manager flows.

### TC-10 Eval dataset seed/run

- Story: S-6
- Type: integration
- Expected: seeded dataset can run and emit deterministic score/results.

### TC-11 Eval baseline regression gate

- Story: S-6
- Type: CLI behavior
- Expected: `--fail-on-regression` returns non-zero on regressed score.

### TC-12 RBAC bootstrap/token hashing

- Story: S-7
- Type: unit
- Expected: bootstrap emits token; DB stores only hashed token.

### TC-13 API auth role enforcement

- Story: S-7
- Type: integration
- Expected: viewer denied mutate routes, operator allowed ops routes, admin allowed token routes.

### TC-14 GUI telemetry/evals/access render

- Story: S-8
- Type: frontend
- Expected: new pages render and workflow controls are interactive under mocked API.

### TC-15 GUI auth token header forwarding

- Story: S-8
- Type: frontend
- Expected: bearer token is forwarded on API requests when set in UI storage.

## Manual Test Cases

### MTC-1 Responsive and keyboard navigation smoke

- Story: S-8
- Steps:
  1. Open manager web app on desktop and narrow viewport.
  2. Tab through sidebar navigation and action controls.
- Expected: all primary views remain reachable and readable.
