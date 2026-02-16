# Policy reference (policy.v1)

SkillVault policies are YAML files that define **deterministic gates and constraints**.

- File format: YAML
- Contract: **policy.v1** (TypeScript source of truth: `packages/cli/src/policy/policy.ts`)
- The policy is applied by `receipt`, `verify`, `gate`, and (optionally) `scan`.

## Minimal example (`policy.yaml`)

```yaml
policy_version: v1

gates:
  # Reject bundles with risk_score.total above this.
  max_risk_score: 59

  # Optional: restrict allowed final verdicts.
  # If omitted, all verdicts are allowed and gating is controlled by max_risk_score.
  allow_verdicts: [PASS, WARN]

capabilities:
  network:
    mode: require_approval
    note: "Any network access requires manual review."
  exec:
    mode: block
    note: "Do not allow command execution in skills."
  writes:
    mode: allow

constraints:
  # v0.1 bundles must have exactly one manifest: SKILL.md or skill.md
  exactly_one_manifest: true

  # Size limits are in bytes.
  bundle_size_limit_bytes: 200000
  file_size_limit_bytes: 100000

  # Token limits are applied to the manifest text (v0.1 uses deterministic token heuristics).
  max_manifest_tokens_warn: 800
  max_manifest_tokens_fail: 1200

profiles:
  strict_v0:
    gates:
      max_risk_score: 29
      allow_verdicts: [PASS]
    capabilities:
      network: { mode: block }
      exec: { mode: block }
      writes: { mode: require_approval }
    constraints:
      bundle_size_limit_bytes: 100000
      file_size_limit_bytes: 50000
      max_manifest_tokens_warn: 600
      max_manifest_tokens_fail: 800
```

---

## Top-level fields

### `policy_version` (optional)
If present, must be `v1`.

### `gates`
Controls overall gating decisions.

- `max_risk_score?: number`
  - Maximum allowed `risk_score.total` (0–100).
- `allow_verdicts?: (PASS|WARN|FAIL)[]`
  - If set, the final verdict must be one of these.

### `capabilities`
Capability rules for inferred capabilities.

Capability names (v0.1):
- `network`
- `exec`
- `writes`

Each capability rule is:

```yaml
capabilities:
  network:
    mode: allow|block|require_approval
    note: "optional explanation"
```

Semantics:
- `allow`: capability is permitted
- `block`: capability causes a policy finding and gating failure
- `require_approval`: capability is permitted only with an approval (approval system is a v0.1 placeholder; in practice this will fail deterministically in `verify` unless approvals are provided)

### `constraints`
Deterministic bundle constraints.

- `exactly_one_manifest?: boolean`
- `bundle_size_limit_bytes?: number`
- `file_size_limit_bytes?: number`
- `max_manifest_tokens_warn?: number`
- `max_manifest_tokens_fail?: number`

### `profiles`
Named policy overlays selectable via CLI flags.

- Used by: `skillvault export ... --profile <name>`
- Each profile can define its own `gates`, `capabilities`, and `constraints`.

---

## How policies are applied

- `receipt`: scans the bundle and embeds the **policy decision** into the receipt.
- `verify`: recomputes hashes, validates receipt integrity, and **hard-fails** on policy/constraint violations.
- `gate`: applies policy to a bundle (scan + gate) or to a receipt (receipt-only gate).

See also:
- CLI reference: `docs/cli.md`
- JSON contracts: `docs/schemas.md`
