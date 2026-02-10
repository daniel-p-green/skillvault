# SkillVault — MVP Plan (Weekend Sprint)

## Goal
Demonstrate end-to-end value:
1) ingest a skill file (path or URL),
2) scan it with deterministic rules,
3) render a report (CLI JSON; optional desktop UI),
4) export a normalized representation.

## Milestones

### M1 — Project scaffold (US-001)
- TypeScript workspace with `packages/cli` (and optional `packages/ui` later)
- Root scripts: `npm test`, `npm run build`, `npm run typecheck`
- MIT license + contributor guardrails

### M2 — Deterministic scanner rules (CLI)
Rules (initial):
- zero-width characters
- unicode homoglyphs (basic)
- base64 blobs above threshold
- suspicious instruction-override phrases (regex)
- outbound URLs + domain list

### M3 — Report schema + risk scoring
- JSON report format: overall score (0-100) + findings[]
- Each finding: `id`, `severity`, `message`, `offsetStart`, `offsetEnd`, `excerpt`

### M4 — Normalization
- Parse “generic skill file” text into a normalized JSON/YAML with:
  - `name`, `description`, `instructions`, `tools`, `sources`

### M5 — Desktop UI (nice-to-have)
- Tauri + React dashboard
- Drag/drop a file → invoke local CLI scan → render report
- PASS/WARN/FAIL badge

## Architecture sketch

### CLI flow
`skillvault scan <path-or-url>`
1) Load bytes (file or fetched URL — URL fetch should be explicit/opt-in)
2) Run rule pipeline over raw text + byte offsets
3) Compute risk score from severities + count + confidence
4) Emit JSON report to stdout

### Rule implementation shape
- `Rule` interface: `id`, `description`, `run(input) => Finding[]`
- Central registry applies rules deterministically in a fixed order.

### Normalization
- Minimal parser that extracts fields when present; otherwise keeps content as `instructions`.
