# Benchmark Mode (v0)

Benchmark mode adds reproducible A/B skill evaluation to the CLI:

- `no_skill`
- `curated_skill`
- `self_generated_skill`

It runs deterministic task verifiers across each condition, then reports pass/fail, timing, error categories, and deltas.

In manager mode, the same benchmark engine is shared by CLI and GUI/API.

## Commands

```bash
skillvault bench run --config bench.yaml --format json|table [--out run.json] [--deterministic]
skillvault bench report --input run.json --format json|table [--out report.txt]
```

Manager API and GUI surfaces:
- `GET /bench/configs`
- `POST /bench/runs`
- `GET /bench/runs`
- `GET /bench/runs/:id`
- `GET /bench/runs/:id/report`

The web UI exposes this under **Evals + Bench** → **Skill Benchmarks**.

### One-command JSON + table pattern

```bash
skillvault bench run \
  --config packages/cli/examples/bench-v0/bench.yaml \
  --format table \
  --out /tmp/bench-run.json \
  --deterministic
```

- table goes to stdout
- full machine-readable JSON goes to `--out`

## Config schema (`skillvault.bench.config.v1`)

```yaml
schema: skillvault.bench.config.v1

metadata:
  suite: string
  model_label: string
  environment_label: string

execution:
  retries: 0
  seed: 42
  deterministic: true

conditions:
  - id: no_skill
    bundle_path: ./path
  - id: curated_skill
    bundle_path: ./path
  - id: self_generated_skill
    adapter:
      id: stub
      options:
        bundle_path: ./path

tasks:
  - id: task_id
    domain: domain_name
    timeout_ms: 1000
    verifier:
      type: function|command
      # function verifiers:
      function: bundle_file_exists|bundle_file_contains
      args:
        path: answer.txt
        contains: receipt
      # command verifier:
      command: node ./scripts/check.js
```

Notes:
- `conditions` must include all three required ids
- `self_generated_skill` must include either `bundle_path` or `adapter.id=stub` with `adapter.options.bundle_path`
- `tasks` must be non-empty

Config discovery roots for manager GUI/API:
- `<repo>/bench/`
- `<repo>/benchmarks/`
- `<repo>/packages/cli/examples/bench-v0/`

Manual config paths are allowed if they resolve to local workspace files.
URL config paths are rejected.

## Output schema (`skillvault.bench.run.v1`)

Run output JSON includes:

- run metadata: `created_at`, config path, git commit (if available), deterministic flag, seed, retries
- per-task condition results: pass/fail, duration, attempts, exit code, error category
- aggregates by condition: pass counts/rates, average duration, Wilson 95% interval
- deltas:
  - `curated_vs_no_skill`
  - `self_generated_vs_no_skill`
- error category breakdown by condition

Error categories:
- `none`
- `assertion_failed`
- `verification_failed`
- `timeout`
- `execution_error`

Benchmark run persistence (manager mode):
- run files: `.skillvault/export/bench/runs/<runId>.json`
- index file: `.skillvault/export/bench/index.json`

## Determinism behavior

When deterministic mode is enabled:

- `created_at` is frozen to `1970-01-01T00:00:00.000Z`
- per-task `duration_ms` is set to `0` for stable byte output
- task/condition ordering stays stable from config order

This keeps output reproducible for goldens and regression checks.

## Example suite

A minimal runnable suite lives at:

- `packages/cli/examples/bench-v0/bench.yaml`

It demonstrates measurable deltas between all three conditions.
