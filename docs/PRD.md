# SkillVault PRD (v0.2)

## Product Positioning

SkillVault v0.2 is a local-first manager for trusted skill operations across multiple AI coding apps.  
It extends v0.1 trust primitives into an operational platform with inventory, deployments, audit, API, and GUI.

## Problem Statement

Teams increasingly run the same skills in multiple agent ecosystems (Codex, Windsurf, OpenClaw, Cursor, Claude Code, and others), but today they lack:
- a unified local inventory
- cross-app deployment control
- durable trust and audit history
- drift and stale-state visibility

## Goals

1. Provide a canonical local vault for skill versions and receipts.
2. Support multi-app deployment with adapter abstraction and parity snapshot coverage.
3. Preserve deterministic trust workflows (`scan`, `receipt`, `verify`, `gate`, `diff`, `export`).
4. Deliver manager API + GUI for operations workflows.
5. Enforce security hardening in receipt gating and receipt policy generation.

## Non-Goals

- Hosted SaaS control plane (v0.2 remains local-first).
- Remote bundle fetching as a trust default.
- Marketplace curation and ranking.
- Enterprise RBAC and centralized policy distribution.

## Personas

- **Security-minded solo dev**: wants deterministic trust checks before installing skills.
- **Power user with multiple apps**: wants one place to deploy and audit skills across adapters.
- **Team lead**: wants reproducible local workflow and testable guardrails for CI.

## Core Functional Requirements

### Trust Layer (Backwards compatible)

- `scan`, `receipt`, `verify`, `gate`, `diff`, `export` remain available.
- `gate --receipt` requires trust key input:
  - exactly one of `--pubkey` or `--keyring`
- `gate --receipt` must verify signature before policy gating.
- optional `gate --receipt --bundle <path>` verifies full bundle hash/integrity before policy gating.
- receipt policy is forced to `FAIL` when scan findings contain any `error` severity finding.

### Manager Layer

- Manager storage root: `.skillvault/`
- SQLite metadata + file vault:
  - `skillvault.db`
  - `vault/<skill_id>/<version_hash>/...`
  - `receipts/<receipt_id>.json`
- Adapter registry with built-ins and override support.
- Import, inventory, deploy, undeploy, audit, and discovery workflows.
- Drift detection on missing paths, symlink divergence, and copy-mode content mutation.

### API Layer

- Local Fastify API for manager workflows:
  - `/health`, `/adapters`, `/skills`, `/deployments`, `/audit/summary`, `/discover`, etc.

### GUI Layer

- React + TypeScript + Vite manager web app.
- Pages:
  - Dashboard
  - Skill Detail
  - Adapters
  - Deploy Flow
  - Audit
  - Discover

## Success Metrics

- Import -> deploy -> audit workflow completes locally without manual file editing.
- Multi-adapter deploy succeeds for milestone adapters (`codex`, `windsurf`, `openclaw`, `cursor`, `claude-code`).
- Trust-gate bypass via unsigned/invalid receipt is blocked deterministically.
- Documentation covers JTBD, use cases, stories, and executable test cases.

## Release Acceptance (v0.2)

1. Workspace build/typecheck/test passes for `cli`, `manager-core`, `manager-api`, and `manager-web`.
2. Manager commands are callable from CLI under `skillvault manager ...`.
3. Security hardening tests pass for gate trust enforcement and receipt fail-on-scan-error.
4. Product docs in `docs/product/` meet required headings and traceability.
