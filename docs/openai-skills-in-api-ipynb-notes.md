# Notes: openai-cookbook `skills_in_api.ipynb`

Links:
- GitHub: https://github.com/openai/openai-cookbook/blob/main/examples/skills_in_api.ipynb
- Raw: https://raw.githubusercontent.com/openai/openai-cookbook/main/examples/skills_in_api.ipynb

## What’s inside (high level)
The notebook mirrors the cookbook article and includes:
- Definitions: what a skill is, and how it mounts into environments.
- Examples for creating a `csv_insights_skill` folder with `SKILL.md`, code, assets.
- Example API usage: create/upload a skill and reference it from the Responses API shell tool.
- Operational best practices and explicit validation limits.

## SkillVault implications
- Our scanner should treat `SKILL.md` as the manifest anchor and validate the “exactly one manifest” rule.
- We should preserve frontmatter `name` and `description` because the platform uses them for routing.
- Our receipt should record size/file-count validation outcomes as part of compliance.
- We should provide an export mode that can produce a zip bundle consistent with this shape.
