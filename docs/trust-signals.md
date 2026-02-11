# Trust signals (Audience score + use-driven metadata)

This doc defines “audience score” and additional trust signals that are **use-driven** (harder to game than likes/stars).

## Audience score (secondary)

Audience score measures whether a directive artifact *worked in practice*.

Rules:
- Always scoped to **content_hash** (or explicit version id) so reviews cannot be transferred across updates.
- Split by target tool/runtime (Codex/Claude/Cursor/OpenClaw/etc.).
- Never overrides a FAIL critic/security verdict.

Suggested fields:
- `worked`: yes | no | partial
- `time_saved_minutes` (optional)
- `tool`: string
- `notes`: free text (what worked, what broke)
- `risk_flags`: unexpected network, unexpected write, override attempts
- `reviewer_proof`: optional receipt id or local run record

## Use-driven trust signals

These are metadata signals we can compute or collect:

### Age & stability
- `first_seen_at`
- `time_since_first_commit` (if source provides)
- update frequency

### Adoption
- unique users (local-first in v0.1; public later)
- number of installs across tools (where measurable)

### Inventory & hygiene
- how many artifacts a developer/team has installed
- how many are PASS/WARN/FAIL
- “drift” count (installed != last verified receipt)

### Maintenance & responsiveness (later)
- time-to-fix after a reported issue
- changelog quality

## Anti-gaming measures (when public)
- Reviews must be tied to version/hash.
- Weight reviews by proof of use (receipt present, or local run record).
- Rate limit and spam controls.
