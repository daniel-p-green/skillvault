# OpenAI Agent Skills compatibility requirements (for SkillVault)

Primary sources:
- Cookbook article: https://developers.openai.com/cookbook/examples/skills_in_api
- Notebook: https://github.com/openai/openai-cookbook/blob/main/examples/skills_in_api.ipynb

This document captures **concrete requirements and constraints** SkillVault should support when ingesting/scanning/exporting OpenAI-style skills.

## Packaging rules

1) **Manifest required**
- A skill is a folder bundle anchored by a required `SKILL.md` (or `skill.md`).

2) **Exactly one manifest file**
- Exactly one manifest file is allowed per bundle (`SKILL.md`/`skill.md`).

3) **Frontmatter for routing**
- `name` and `description` are taken from `SKILL.md` frontmatter and are used for discovery/routing.
- SkillVault must preserve these fields on import/export.

4) **Zip is the preferred transport**
- Zips are recommended for reliability and reproducibility.
- SkillVault should support exporting a zip bundle.

## Execution environment semantics (important for provenance)

- Skills are mounted into an execution environment (hosted shell or local shell).
- The platform adds skill `name`, `description`, and `path` to hidden context.
- When invoked, the model reads `SKILL.md` and may execute scripts via the shell tool.

Implication: our receipts should record the skill’s **content hash**, **source**, and any **executable resources** (scripts) as first-class.

## Versioning expectations

- Skills have version pointers like **default** and **latest**.
- Production should **pin versions** for reproducibility.

Implication: SkillVault should treat “version pinning” as a policy recommendation and include it in export/deploy guidance.

## Operational best practices (quality lint signals)

SkillVault can optionally lint for:
- Clear `name` + `description`.
- “When to use”, “How to run”, expected outputs, and gotchas.
- **Negative examples** (“Don’t use when…”) to improve routing.

## Security posture notes

- Combining skills with open network access is high risk.
- If network access is needed: use strict allowlists and specify what data may leave.

Implication: SkillVault should (a) flag network-capable scripts, (b) encourage allowlists and explicit data egress policy in manifests/receipts.

## Validation limits (as stated in the cookbook)

These are product limits and may change, but SkillVault should validate and report them:
- Max zip upload size: **50 MB**
- Max file count per skill version: **500**
- Max uncompressed file size: **25 MB**

Also:
- `SKILL.md` matching is case-insensitive.
- Frontmatter validation follows Agent Skills spec (must have `name`).

## How to bake this into the MVP

MVP requirements for the scanner/exporter:
- Validate exactly one manifest.
- Extract/preserve `name` + `description`.
- Compute content hashes for all files and the zip.
- Emit receipt fields that capture: size, file count, biggest file, and any limit violations.
