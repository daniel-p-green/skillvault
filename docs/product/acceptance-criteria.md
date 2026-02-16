# Acceptance Criteria

## Product-Level Exit Criteria

1. Trust commands remain backward compatible (`scan`, `receipt`, `verify`, `gate`, `diff`, `export`).
2. `gate --receipt` enforces trust verification with exactly one of `--pubkey` or `--keyring`.
3. Receipt generation forces policy `FAIL` when scan findings include `error` severity.
4. Manager command family is available under `skillvault manager ...`.
5. Manager storage schema and migration initialize deterministically.
6. Built-in adapters include v0.2 parity snapshot and OpenClaw fallback logic.
7. Local API endpoints serve manager workflows for GUI.
8. GUI provides Dashboard, Skill Detail, Adapters, Deploy, Audit, Discover pages.
9. Docs cover JTBD, use cases, stories, and test cases.
10. Workspace build, typecheck, and test pass.

## Story-Level Acceptance

- S-1 accepted when TC-1 and TC-2 pass.
- S-2 accepted when TC-3 and TC-4 pass.
- S-3 accepted when TC-5 and TC-6 pass.
- S-4 accepted when TC-7 passes.
- S-5 accepted when TC-8 passes.
- S-6 accepted when TC-9, TC-10, and MTC-2 pass.
