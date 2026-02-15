# Deterministic mode and goldens (v0.1)

SkillVault supports deterministic output for reproducible CI and golden tests.

## Deterministic mode

Pass `--deterministic` to scan/receipt/verify/diff (and supported flows) to freeze non-content variability:

- fixed timestamps (`created_at`)
- deterministic path ordering
- deterministic JSON shape/order via canonical utilities used for signing and stable comparisons

Example:

```bash
node packages/cli/dist/cli.js scan packages/cli/test/fixtures/benign-skill \
  --format json \
  --deterministic
```

## Golden fixtures and outputs

Committed fixture bundles and golden outputs live under `packages/cli/test`:

- fixtures: `packages/cli/test/fixtures/**`
- goldens: `packages/cli/test/goldens/**`

Golden tests compare CLI JSON output byte-for-byte in deterministic mode.

## Golden check script

Run deterministic golden checks:

```bash
npm run test:goldens:check
```

Regenerate goldens intentionally:

```bash
npm run test:goldens:update
```

(Equivalent helper script: `scripts/test-goldens.sh --update`.)

## CI expectation

CI must fail on:

- JSON golden mismatches
- nondeterministic output drift
- signature tamper regressions (verify must fail with stable reason codes)

This protects reproducibility of `scan -> receipt -> verify -> gate -> diff` outputs.
