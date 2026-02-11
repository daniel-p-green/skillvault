# SkillVault PRD (v0.1)

**Positioning:** SkillVault is a **trust receipt generator and policy gate** for SKILL.md bundles. It is not an installer, registry, or marketplace.

Directive artifacts (v0.1 scope):
- **Skill bundles anchored by `SKILL.md`/`skill.md`** (exactly one manifest)

## Problem
People increasingly install procedural instructions from strangers (skills, instruction packs, agent guidance). This is the “npm moment” for agent behavior, but:
- The payload is often **natural language** (harder to review than code).
- Update semantics are fragmented across tools.
- There is no consistent local trust layer: scan → evidence → receipt → verify → gate.

## Goals (v0.1)
1) **Scan before use**: local deterministic scanning with machine-readable findings.
2) **Diff-aware change detection**: show what changed between versions/hashes.
3) **Receipts**: generate a portable, verifiable receipt that travels with the artifact.
4) **Policy gating**: enforce allow/block/require-approval workflows based on deterministic evidence.
5) **Strict export**: export a directory bundle to a strict zip that passes bundle validation.

## Non-goals (v0.1)
- Installer/discovery/marketplace
- URL inputs / remote fetching
- Cryptographic signing (planned for v0.2)
- LLM-based semantic scanning in the scoring path
- Team access control / shared vault server

## Core UX (CLI-first)

### Must-ship commands (v0.1)

```bash
skillvault scan <bundle_dir|bundle.zip> [--policy policy.yaml] [--format json|table] [--out file] [--deterministic]
skillvault receipt <bundle_dir|bundle.zip> [--policy policy.yaml] [--out receipt.json] [--deterministic]
skillvault verify <bundle_dir|bundle.zip> --receipt receipt.json [--policy policy.yaml] [--offline] [--format json|table] [--deterministic]
skillvault gate (--receipt receipt.json | <bundle>) --policy policy.yaml [--format json|table] [--deterministic]
skillvault diff --a <bundle|receipt> --b <bundle|receipt> [--format json|table] [--deterministic]
skillvault export <bundle_dir> --out bundle.zip [--policy policy.yaml] [--profile strict_v0]
```

Notes:
- Receipts are **offline-verifiable**: verification recomputes per-file sha256 + bundle sha256 and fails deterministically on mismatch.
- Bundles are **SKILL.md-only** in v0.1 (exactly one manifest).

## Scoring model (v0.1)

SkillVault v0.1 uses a single deterministic **risk score**:
- `risk_score.total` in **[0, 100]** (higher = riskier)
- Verdict thresholds:
  - PASS 0–29
  - WARN 30–59
  - FAIL 60–100

Risk score components:
- `base_risk`
- `change_risk`
- `policy_delta`

See: `docs/scoring.md`.

## Acceptance criteria (v0.1)
- Can scan a benign and malicious fixture and produce deterministic JSON outputs.
- Can generate a receipt that is verifiable offline via `verify`.
- Can diff two versions (bundle/receipt inputs) and show security-relevant changes.
- Can export a strict zip within profile constraints and re-validate it.
- Includes fixtures + golden tests that enforce byte-for-byte determinism in `--deterministic` mode.
