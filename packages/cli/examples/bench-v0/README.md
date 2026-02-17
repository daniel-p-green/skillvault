# Benchmark v0 Example

Run from repo root:

```bash
node packages/cli/dist/cli.js bench run \
  --config packages/cli/examples/bench-v0/bench.yaml \
  --format table \
  --out /tmp/skillvault-bench-run.json \
  --deterministic
```

The table is printed to stdout and the full machine-readable JSON is written to `--out`.
