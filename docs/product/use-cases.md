# Use Cases

## UC-1 Import and inventory a skill bundle

- Actor: Solo developer
- Workflow:
  1. `skillvault manager import <bundle>`
  2. `skillvault manager inventory`
- Expected result: canonical version saved with scan + receipt metadata.

## UC-2 Multi-adapter deploy and drift audit

- Actor: Multi-app user
- Workflow:
  1. `skillvault manager deploy <skill_id> --adapter '*' --scope project --mode symlink`
  2. `skillvault manager audit`
- Expected result: adapter-level deployment outcomes plus drift/staleness summary.

## UC-3 Receipt trust gate with enforced key verification

- Actor: Security owner
- Workflow:
  1. `skillvault gate --receipt receipt.json --pubkey key.pem --policy policy.yaml`
  2. Optional: `--bundle <path>` for integrity verification.
- Expected result: gate fails when trust verification fails; policy verdict is deterministic.

## UC-4 Telemetry outbox operations

- Actor: Ops owner
- Workflow:
  1. `skillvault manager telemetry status`
  2. `skillvault manager telemetry flush --target jsonl|weave`
- Expected result: outbox visibility with sent/retry/dead-letter outcomes.

## UC-5 Eval regression loop

- Actor: Ops owner
- Workflow:
  1. `skillvault manager eval datasets seed`
  2. `skillvault manager eval run --dataset default-manager-regression`
  3. `skillvault manager eval compare --run <id>`
- Expected result: run score and baseline delta are explicit.

## UC-6 Enable API access control for shared environments

- Actor: Team lead
- Workflow:
  1. `skillvault manager auth bootstrap`
  2. `skillvault manager auth token create --principal <id> --role viewer|operator|admin`
  3. Run API with `SKILLVAULT_AUTH_MODE=required`
- Expected result: protected routes require bearer token and role permission.
