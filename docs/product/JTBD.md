# JTBD

## Core Job

When I run skills across multiple AI apps, I want one local control plane to verify trust, manage deployment state, monitor quality regressions, and control API access so that I can move fast without sacrificing security.

## Personas

### Solo developer

- Job: install and iterate skills quickly with deterministic trust checks.
- Pain today: manual installs, inconsistent trust verification, and no easy rollback confidence.
- Success metrics:
  - import + deploy in under 2 minutes
  - signature-verified receipt gating every time
  - clear audit report on drift/staleness

### Multi-app power user

- Job: keep skills aligned across Codex, Windsurf, OpenClaw, Cursor, and Claude Code.
- Pain today: per-tool folder differences and no central operation view.
- Success metrics:
  - one command fan-out deploy to enabled adapters
  - dashboard shows deployment and drift posture
  - telemetry outbox can be flushed for external observability

### Ops / security owner

- Job: enforce safety and detect regressions before broad rollout.
- Pain today: no deterministic local eval loop and weak API access boundaries.
- Success metrics:
  - eval runs produce baseline/candidate deltas
  - regression gate can fail CI or scripted workflows
  - API auth mode can be enabled with role-scoped tokens

## Job Success Outcomes

- **Confidence**: operators can answer what is installed, trusted, and drifting.
- **Control**: deployments are auditable, reversible, and policy-gated.
- **Quality**: telemetry + eval loops expose regression and operational risk.
- **Security**: trust model and optional RBAC enforcement are deterministic and testable.
