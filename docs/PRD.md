# SkillVault PRD (v0.3)

## Product Positioning

SkillVault v0.3 is a local-first manager for trusted skill operations across multiple AI coding apps.
It extends v0.2 with telemetry outbox, deterministic eval loops, and additive RBAC preparation.

## Problem Statement

Teams running shared skills across multiple agent ecosystems still struggle with:
- inconsistent trust verification at install time
- no durable quality regression loop for manager operations
- weak access boundaries for local API surfaces
- missing telemetry path from local operations to cloud observability

## Goals

1. Preserve deterministic trust workflows (`scan`, `receipt`, `verify`, `gate`, `diff`, `export`).
2. Keep multi-adapter manager operations local-first and backward-compatible.
3. Add telemetry outbox and controlled cloud-ready flush (`jsonl` and optional Weave).
4. Add deterministic eval dataset/run/compare workflows for regression detection.
5. Add additive RBAC/token preparation with opt-in API enforcement.
6. Extend GUI with telemetry, evals, and access control pages.

## Non-Goals

- Hosted sync control plane in v0.3.
- Mandatory cloud telemetry for core operations.
- Breaking changes to v0.1/v0.2 command contracts.
- Enterprise SSO or centralized IAM.

## Personas

- **Security-minded solo dev**: needs deterministic trust checks and local safety defaults.
- **Multi-app power user**: needs one place to deploy/audit skills across adapter targets.
- **Ops owner**: needs telemetry/evals to catch drift and regression early.
- **Team lead**: needs optional role-based API guardrails without local workflow friction.

## Core Functional Requirements

### Trust Layer (backward compatible)

- `scan`, `receipt`, `verify`, `gate`, `diff`, `export` remain available.
- `gate --receipt` requires exactly one of `--pubkey` or `--keyring`.
- receipt policy is forced to `FAIL` when scan includes any `error` severity finding.

### Manager Layer

- Existing import/inventory/deploy/undeploy/audit/discover workflows remain intact.
- Adapter snapshot and OpenClaw fallback support remain intact.

### Telemetry Layer

- Manager workflows emit telemetry events into local outbox storage.
- `manager telemetry status` reports queue state.
- `manager telemetry flush --target jsonl|weave` supports:
  - success path
  - retry path
  - dead-letter path after repeated failures
- Weave export requires explicit endpoint configuration.

### Eval Layer

- Seed deterministic dataset (`manager eval datasets seed`).
- Run deterministic checks (`manager eval run`).
- Compare run against baseline (`manager eval compare`).
- Optional non-zero exit on regression.

### RBAC Layer (additive)

- Roles: `viewer`, `operator`, `admin`.
- API tokens are generated locally and stored hashed.
- `SKILLVAULT_AUTH_MODE=off` keeps backward compatibility.
- `SKILLVAULT_AUTH_MODE=required` enforces route permissions.

### API Layer

- Existing routes remain.
- New routes include `/telemetry/status`, `/telemetry/flush`, `/evals/*`, `/me`, `/rbac/roles`, `/auth/tokens`.

### GUI Layer

- Existing pages remain.
- New pages include:
  - Telemetry
  - Evals
  - Access

## Success Metrics

- Core manager workflow still passes (`init -> import -> deploy -> audit`).
- Telemetry can flush locally (`jsonl`) and handle retry/dead-letter paths deterministically.
- Eval workflows can detect and report run deltas.
- API auth enforcement works when enabled and remains fully off by default.
- Workspace build/typecheck/test/golden checks pass.

## Release Acceptance (v0.3)

1. Workspace build/typecheck/test passes for all packages.
2. v0.1/v0.2 trust and manager commands remain compatible.
3. Telemetry outbox status/flush commands and API routes are functional.
4. Eval dataset/run/compare commands and API routes are functional.
5. RBAC bootstrap/token flows are functional; API guardrails enforce in required mode.
6. GUI pages render and pass test coverage for telemetry/evals/access workflows.
7. Product docs are updated with JTBD, use-cases, user stories, acceptance, and test mapping for v0.3.
