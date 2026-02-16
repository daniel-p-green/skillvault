# Acceptance Criteria

## Product-Level Exit Criteria

1. Trust commands remain backward compatible (`scan`, `receipt`, `verify`, `gate`, `diff`, `export`).
2. `gate --receipt` enforces trust verification with exactly one of `--pubkey` or `--keyring`.
3. Receipt generation forces policy `FAIL` when scan findings include `error` severity.
4. Manager command family includes telemetry, eval, and auth namespaces.
5. SQLite migrations initialize v0.3 telemetry/eval/RBAC tables deterministically.
6. Built-in adapters keep parity snapshot coverage and OpenClaw fallback logic.
7. Local API serves telemetry/eval/auth endpoints and enforces RBAC when enabled.
8. GUI provides Dashboard, Skill Detail, Adapters, Deploy, Audit, Discover, Telemetry, Evals, and Access pages.
9. Product docs cover JTBD, use-cases, stories, acceptance criteria, and test cases for v0.3.
10. Workspace build, typecheck, test, and golden checks pass.

## Story-Level Acceptance

- S-1 accepted when TC-1 and TC-2 pass.
- S-2 accepted when TC-3 and TC-4 pass.
- S-3 accepted when TC-5 and TC-6 pass.
- S-4 accepted when TC-7 passes.
- S-5 accepted when TC-8 and TC-9 pass.
- S-6 accepted when TC-10 and TC-11 pass.
- S-7 accepted when TC-12 and TC-13 pass.
- S-8 accepted when TC-14, TC-15, and MTC-1 pass.
