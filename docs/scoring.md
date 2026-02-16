# Risk scoring (v0.1)

SkillVault v0.1 produces a deterministic **risk score** for SKILL.md bundles.

- Output field: `risk_score` (components + total)
- Range: **0–100** (higher = riskier)
- Verdict thresholds (required):
  - **PASS**: 0–29
  - **WARN**: 30–59
  - **FAIL**: 60–100

See: `docs/schemas.md` for the canonical JSON shape.

## Principles

1) **Reproducible**: same bytes + same scanner version + same policy → same outputs.
2) **Rule-based**: v0.1 scoring is deterministic and does **not** use LLM semantic scanning.
3) **Auditable**: score is stored as components so users can understand what moved the total.

## `risk_score` components

The score is stored as:

```json
{
  "base_risk": 20,
  "change_risk": 5,
  "policy_delta": 0,
  "total": 25
}
```

### `base_risk`
Risk inferred from the current bundle’s content and inferred capabilities.

Typical drivers (non-exhaustive):
- inferred capabilities like `network`, `exec`, `writes`
- presence of suspicious patterns (rule hits)
- constraint warnings (e.g., manifest token warnings) may contribute depending on policy

### `change_risk`
Risk attributable to **what changed** relative to a prior version.

- In v0.1, this component is intended to capture diff-aware “update risk”.
- When no baseline is available, `change_risk` should be 0.

### `policy_delta`
Policy-derived adjustment that penalizes mismatches between:
- what the policy *expects/allows*, and
- what the bundle *actually does* (inferred capabilities + constraint posture)

This keeps policy effects explicit rather than hidden inside `base_risk`.

## Verdict mapping

Verdict is derived **only** from `risk_score.total` using fixed thresholds:

- PASS: `total <= 29`
- WARN: `30 <= total <= 59`
- FAIL: `total >= 60`

Policy gates may still fail an artifact even if the score maps to PASS/WARN (e.g., `allow_verdicts: [PASS]`).

## Relationship to policy gating

- `risk_score` comes from scanning/scoring.
- **Policy gating** decides whether the artifact is allowed in your environment.

Common patterns:
- “Allow PASS+WARN but cap risk”: `allow_verdicts: [PASS, WARN]` + `max_risk_score: 59`
- “Only allow PASS”: `allow_verdicts: [PASS]` + `max_risk_score: 29`

See: `docs/policy.md`.
