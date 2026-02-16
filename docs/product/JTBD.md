# JTBD

## Core Job

When I run skills across multiple AI apps, I want one local control plane to verify trust, deploy consistently, and detect drift so that I can move fast without losing security posture.

## Personas

### Solo developer

- Job: Install and update skills quickly with deterministic trust checks.
- Pain today: Manual copy/paste installs and inconsistent verification.
- Success metrics:
  - Can import and deploy a skill in under 2 minutes.
  - Can prove receipt trust before enabling a skill.

### Multi-app power user

- Job: Keep the same skill set in Codex, Windsurf, OpenClaw, Cursor, and Claude Code.
- Pain today: Different folder conventions and no central inventory.
- Success metrics:
  - One command deploys to required adapters.
  - Adapter drift is surfaced in one audit view.

### Team lead / security owner

- Job: Enforce deterministic trust guardrails without blocking delivery.
- Pain today: No repeatable local process for trust receipts and policy gates.
- Success metrics:
  - `gate --receipt` cannot pass without signature verification.
  - Receipt generation forces `FAIL` on scan errors.
  - CI test suite passes for trust and manager flows.

## Job Success Outcomes

- Confidence: operators can answer "what is installed where" at any time.
- Control: deployments are scoped, auditable, and reversible.
- Safety: untrusted or tampered receipts fail deterministically.
