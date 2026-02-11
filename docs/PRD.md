# SkillVault PRD (v0.1)

**Positioning:** SkillVault is a **trust receipt generator and policy gate** for *directive artifacts* (skills + repo guidance). It is not an installer, registry, or directory.

Directive artifacts include:
- Skill packages anchored by `SKILL.md` (Agent Skills)
- Repo-level guidance such as `AGENTS.md`
- Tool-specific guidance files (future adapters)

## Problem
People increasingly install procedural instructions from strangers (skills, instruction packs, agent guidance). This is the “npm moment” for agent behavior, but:
- The payload is often **natural language** (harder to review than code).
- Update semantics are fragmented across tools.
- There is no consistent local trust layer: scan → evidence → approval → audit.

## Goals (v0.1)
1) **Scan before use**: local deterministic scanning with evidence excerpts.
2) **Diff-aware change detection**: show what changed between versions/hashes.
3) **Receipts**: generate a portable, verifiable receipt that travels with the artifact.
4) **Policy gating**: enforce allow/deny/approve workflows based on evidence and capability deltas.
5) **One export adapter**: prove we can round-trip to at least one target format.

## Non-goals (v0.1)
- Public marketplace / directory hosting
- Discovery crawling and indexing
- Recursive self-improvement loops (requires eval harness + telemetry first)
- Team access control / shared vault server

## Personas
- Builders: want speed and compatibility, but don’t want to get burned.
- Team leads/architects: need inventory + drift visibility.
- Security/governance: need evidence, receipts, and policy enforcement.

## Core UX (CLI-first)

### Commands
- `skillvault scan <path|url>` → JSON report + PASS/WARN/FAIL
- `skillvault receipt <artifact>` → write receipt JSON that includes hashes + findings + approvals
- `skillvault verify <artifact> --receipt <receipt.json>` → recompute hashes, confirm receipt matches
- `skillvault diff <a> <b>` → highlight security-relevant deltas
- `skillvault export <artifact> --to <adapter> --out <path>` → one adapter for v0.1

(Exact command set may be simplified during implementation, but these are the intended primitives.)

## “Rotten Tomatoes” model (trust signals)

Two-layer scoring:

### 1) Critic score / Security score (primary, hard to game)
- Reproducible, open-source scoring rubric.
- Deterministic tests + policy delta + diff-aware change risk.
- Always tied to **content_hash** and **scanner_version**.

See: `docs/scoring.md`.

### 2) Audience score (secondary, softer)
- Version/hash-scoped user outcomes.
- Split by tool (Codex/Claude/Cursor/OpenClaw) because behavior differs.
- Never overrides a FAIL critic score.

See: `docs/trust-signals.md`.

## Trust signals (use-driven)
Beyond static scans, we should track:
- Age: first-seen date; time since first commit
- Update frequency and “riskiness” of updates (delta score)
- Adoption: number of unique users (local-first in v0.1)
- Inventory: how many artifacts a developer/team has installed

## Data model (v0.1)

We will adopt a canonical internal model that covers both skill packages and guidance docs:
- `kind`: `skill` | `guidance`
- `source`: URI, commit, retrieved_at, publisher
- `content_hash`: sha256
- `capabilities.declared` vs `capabilities.inferred`
- `resources[]`: scripts/assets + per-file hashes
- `scans[]`: findings + risk score + methods
- `receipt`: portable evidence record (+ optional approvals)

(See fit assessment for the proposed schema; we will implement the minimal subset required for the MVP.)

## Acceptance criteria (v0.1)
- Can scan a sample malicious artifact and produce a JSON report with evidence excerpts and offsets.
- Can generate a receipt that is verifiable offline via `verify`.
- Can diff two versions/hashes and show security-relevant changes.
- Can export at least one adapter (OpenAI Agent Skills zip or AGENTS.md).
- Includes fixtures + golden tests for scoring/scanning.
