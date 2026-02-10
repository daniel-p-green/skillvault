# Notes: OpenAI “Skills in API” (cookbook)

Source: https://developers.openai.com/cookbook/examples/skills_in_api

## Why this matters for SkillVault
This doc is a **primary reference** for how OpenAI defines “Agent Skills” as a packaged artifact, including:
- packaging (folder + required `SKILL.md` manifest)
- runtime mounting into environments
- version pointers and pinning
- validation constraints

SkillVault should stay compatible with these expectations.

## Extracted requirements/constraints

### Packaging
- A skill is a folder bundle anchored by exactly one manifest (`SKILL.md` / `skill.md`).
- Name + description come from **frontmatter** and are used for routing/discovery.

### Best practices we should encode (lint + guidance)
- SKILL.md should include: when to use, how to run, expected outputs, gotchas.
- Include **negative examples** (“Don’t use when…”) to improve routing.
- Prefer **zip** for reliability and reproducibility.

### Versioning
- Production should pin skill versions; “latest” is convenient but less reproducible.
- Treat skill version + model version as a pair for reproducibility.

### Tools vs prompts vs skills framing
- System prompt = global behavior/constraints.
- Tools = explicit side effects + typed inputs.
- Skills = packaged procedures (+ scripts/assets), invoked conditionally.

### Security posture (note)
- Network access + skills is high risk; prefer allowlists.

### Limits (as mentioned)
- Max zip upload size, file count, uncompressed file size are enforced (numbers may change; we should keep them as configurable validation rules).

## SkillVault implications
- Our canonical schema should round-trip SKILL.md frontmatter and preserve routing metadata.
- Our scanner should treat “discoverability fields” (when-to-use, outputs, negative examples) as quality signals.
- Our provenance receipt should record skill version/pointer semantics where available.
