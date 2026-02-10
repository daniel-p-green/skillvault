# SkillVault — Contributor Guardrails

This repo is intentionally **local-first** and **deterministic**.

## Security + Privacy
- **No secrets** in code, tests, sample files, or docs.
- **No network calls by default**. Scanner rules must run offline.
- Avoid executing untrusted code. Treat skill files as hostile input.

## Scanner Philosophy (MVP)
- Prefer **deterministic** rules (regex / byte-level analysis).
- Any probabilistic/LLM features must be opt-in and clearly labeled.
- Findings must include: rule id, severity, excerpt (safe), and file offsets.

## Testing Requirements
- Every feature must include tests.
- Tests must be stable and not depend on time, network, or machine-specific state.

## Code Style
- Keep modules small, readable, and boring.
- Add docstrings for any non-obvious heuristics.

## Releases
- CLI is the primary interface. Keep backwards compatibility once we hit 0.1.
