# Scoring (Critic/Security score) — open, reproducible

Goal: produce a **critic/security score** that is hard to game because it is computed from:
- artifact bytes (content hash)
- scanner version
- open rubric

## Outputs

- `critic_score` (0–100)
- `verdict`: PASS | WARN | FAIL
- `findings[]`: evidence, severity, offsets

## Principles

1) **Reproducible**: same inputs → same outputs.
2) **Evidence-first**: every point change must map to a concrete finding.
3) **Diff-aware**: updates are scored by *what changed*, not just current state.

## Components

### A) Static deterministic checks
Examples (non-exhaustive):
- Obfuscation
  - zero-width characters
  - Unicode confusables/homoglyphs
- Encoded payloads
  - large base64 blobs above threshold
  - compressed/minified script blobs (heuristic)
- Dangerous primitives
  - `curl | bash`, `wget | sh`
  - `chmod +x` on new scripts
  - `sudo`, privileged install steps
- Instruction override phrases
  - “ignore previous instructions”, “system prompt”, “do not mention”
- Outbound URLs/domains list

### B) Policy delta
Compute capability delta between:
- `capabilities.declared` (from manifest/frontmatter/policy)
- `capabilities.inferred` (from static analysis)

Penalize unexpected escalation (e.g., declared `network: deny` but inferred network usage).

### C) Change-risk scoring (diff-aware)
When comparing two versions/hashes, flag and penalize:
- new outbound domains
- new scripts/resources
- new obfuscation
- sharp size increases
- new capability escalations

## Suggested verdict thresholds
- PASS: 80–100
- WARN: 50–79
- FAIL: 0–49

(Thresholds are tunable; keep them in one place and version them.)

## Open test suite

Store fixtures and golden outputs in-repo:
- `fixtures/` malicious samples
- `fixtures/` benign samples
- `goldens/` expected reports and scores

CI should run the scanner and compare JSON outputs to goldens.
