# Test Cases

## Traceability Matrix

- S-1 -> TC-1, TC-2
- S-2 -> TC-3, TC-4
- S-3 -> TC-5, TC-6
- S-4 -> TC-7
- S-5 -> TC-8
- S-6 -> TC-9, TC-10

## Automated Test Cases

### TC-1 Manager init/import/inventory end-to-end

- Story: S-1
- Type: integration
- Steps:
  1. `skillvault manager init`
  2. `skillvault manager import <fixture>`
  3. `skillvault manager inventory`
- Expected: imported skill appears with current version metadata.

### TC-2 SQLite migration and CRUD

- Story: S-1
- Type: unit
- Steps: initialize manager, verify DB created, verify adapters seeded.
- Expected: migration applies and adapter rows exist.

### TC-3 Multi-adapter deployment matrix

- Story: S-2
- Type: integration
- Steps: deploy with `--adapter '*'`.
- Expected: includes deployment outcomes for `codex`, `windsurf`, `openclaw`, `cursor`, `claude-code`.

### TC-4 Deploy idempotency (symlink)

- Story: S-2
- Type: unit
- Steps: deploy same skill twice via symlink mode.
- Expected: first is `deployed`, second is `skipped`.

### TC-5 Gate receipt requires key input

- Story: S-3
- Type: CLI behavior
- Steps: run `gate --receipt` without `--pubkey` or `--keyring`.
- Expected: usage error exit code and no policy pass output.

### TC-6 Gate fails on invalid receipt signature

- Story: S-3
- Type: CLI behavior
- Steps: tamper signature and run `gate --receipt --pubkey ...`.
- Expected: verdict `FAIL` with `SIGNATURE_INVALID`.

### TC-7 Receipt forced FAIL on scan errors

- Story: S-4
- Type: unit
- Steps: generate receipt for invalid bundle (manifest constraint error).
- Expected: policy verdict `FAIL` and `POLICY_SCAN_ERROR_FINDING` present.

### TC-8 Drift detection after out-of-band mutation

- Story: S-5
- Type: integration
- Steps: deploy in copy mode, mutate installed file, run audit.
- Expected: deployment marked `drifted`.

### TC-9 GUI dashboard render with seeded API data

- Story: S-6
- Type: frontend test
- Steps: render app with mocked `/skills`, `/deployments`, `/audit/summary`.
- Expected: key dashboard metrics and skill rows render.

### TC-10 GUI deploy flow happy path

- Story: S-6
- Type: frontend test
- Steps: navigate to Deploy page, select skill/adapter, submit deploy.
- Expected: deploy response renders without errors.

## Manual Test Cases

### MTC-1 API parity spot-check

- Story: S-1, S-2
- Steps:
  1. Start `skillvault manager serve`
  2. Call `/skills`, `/deployments`, `/audit/summary`
- Expected: API output aligns with CLI manager command output for same workspace state.

### MTC-2 Mobile layout smoke

- Story: S-6
- Steps: open manager-web at narrow viewport width.
- Expected: sidebar navigation remains accessible and no critical overflow blocks workflow.
