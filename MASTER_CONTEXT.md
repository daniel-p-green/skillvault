# skillvault
Scan it. Trust it. Ship it.
The open source skill manager for the multi-agent era.
Security scanning · Format translation · Version control · One dashboard for every tool.

## Open Source Project Brief

The AI Collective · February 2026
Weekend Sprint Scope · MIT License

## Why This Exists

People are building with AI agents every day. They customize agent behavior through skill files and instruction sets. They share these skills across teams, pull them from community directories, and deploy them into tools that control real codebases, real data, and real workflows.
And right now, none of that has a trust layer.
There is no way to scan a community skill for hidden injection attacks before you let it run. There is no way to maintain the same skill across Claude Code and Cursor and agents.md-compatible tools without manual copying and format guessing. There is no single place to see what skills you have, where they came from, or which version is running in which tool.
This is the same supply chain problem that hit the JavaScript ecosystem a decade ago. Developers pulled packages from npm with blind trust, and the ecosystem paid for it with security incidents that affected millions. The AI skills ecosystem is repeating that pattern, except the attack surface is worse because malicious instructions hide in natural language that looks completely normal to a human reader.
skillvault exists to close that gap. It gives everyone, not just engineers with CLI fluency, a visual interface to scan skills for threats, translate them between formats, track versions, and manage deployments across every major AI tool. It is open source, model-agnostic, and built for the people who use AI tools daily but should not need a security background to use them safely.
What Is skillvault?
skillvault is an open source desktop application (with an optional CLI for power users) that provides a single, visual interface for managing AI skills across tools and formats.
It does four things:
Scans skills for security threats using a two-layer analysis: deterministic pattern detection for known attacks plus LLM-powered semantic reasoning for novel threats. Every skill gets a risk score, specific findings, and a clear trust recommendation before it can run.
Translates between formats so you can write a skill once and deploy it to Claude Code, Cursor, agents.md-compatible tools, and future platforms. The translation preserves the skill's intent, not just its text.
Tracks versions and provenance with a git-backed vault that records every change, its trigger, and its security scan results. You can diff, rollback, and audit at any point.
Provides a visual dashboard that shows your full skill inventory, deployment status across tools, scan results, and version history. No terminal required. Accessible to team leads, product managers, and anyone who works with AI tools.

## Who Is This For?


## Audience


## Their Problem

skillvault's Answer
Multi-tool developers
Maintaining overlapping skill sets across Claude Code, Cursor, and other tools. Manual copying, format guessing, version drift.
Write once, deploy everywhere. Visual format translation. Single inventory.
Non-technical AI users
Importing community skills with no way to know if they are safe. Cannot read raw skill files to spot threats.
Visual security scan with plain-English findings. Risk scores that anyone can interpret.
Team leads and architects
No visibility into what skills the team uses, where they came from, or whether they have been vetted.
Unified dashboard. Version history. Audit trail. Minimum trust thresholds.
AI Collective members
Sharing skills informally with no security verification. No standard way to distribute skills across the community.
Scanned skills with embedded trust metadata. Shared community vault (future).
Jobs to Be Done
JTBD-1: Trust a Skill Before It Runs
When: I find a skill online or a teammate shares one with me.
I want to: Know whether it is safe before I let it control my AI agent's behavior.
So that: I can expand my skill library from community sources without risking my codebase, my data, or my agent doing something I did not authorize.
Success looks like: I drag a skill file into skillvault. Within seconds, I see a risk score, a list of specific findings with highlighted excerpts, and a clear recommendation. I understand the results without needing a security background.
JTBD-2: Use the Same Skill Across Every Tool I Work In
When: I have a skill that works well in one tool and I want it available in another.
I want to: Deploy it to the other tool without manually figuring out format differences.
So that: I get consistent AI behavior across my entire workflow without maintaining duplicate files.
Success looks like: I select a skill in the dashboard, pick a deployment target, and click deploy. skillvault handles the format translation and places the file where the target tool expects it.
JTBD-3: See Everything in One Place
When: I want to understand what skills I (or my team) have, where they came from, and where they are deployed.
I want to: Open a single view that answers all of those questions.
So that: I can make informed decisions about skill hygiene, identify drift, and maintain control as my skill library grows.
Success looks like: The skillvault dashboard shows every skill with its source, format, current version, deployment targets, and last scan result. I can filter, sort, search, and drill into any skill's history.
JTBD-4: Share Skills With Confidence
When: I create or curate a skill that I want to share with my team or community.
I want to: Share it with scan results attached so recipients do not have to take my word that it is safe.
So that: Skill sharing becomes a trust-building activity rather than a risk.
Success looks like: Exported skills include embedded scan metadata. Recipients can verify the scan in their own skillvault or re-run a fresh analysis.

## Use Cases

UC-1: Scan an Imported Skill
Trigger: User imports a skill from a URL, file, or community directory.
Flow: The user drags a file into the app or pastes a URL. skillvault auto-detects the format and runs the two-layer security scan. Layer 1 (pattern scanner) checks for known obfuscation techniques: zero-width characters, unicode homoglyphs, Base64 payloads, whitespace steganography, and suspicious URL patterns. Layer 2 (LLM semantic analysis) sends the normalized content to a configurable LLM for adversarial reasoning about intent, data flow, scope violations, and hidden behavioral modifications.
Output: A visual security report with a risk score (0-100), severity-coded findings with highlighted excerpts, plain-English explanations, and a PASS / WARN / FAIL recommendation. The user reviews the report and decides whether to add the skill to their vault.

## Threat Coverage


## Threat


## Example


## Detection


## Prompt Injection

"Ignore all previous instructions" buried in formatting or comments
LLM detects instruction overrides that conflict with the skill's declared purpose

## Data Exfiltration

Skill encodes API keys into commit messages or HTTP request parameters
LLM traces implied data flow and flags paths from internal data to external targets

## Obfuscation

Zero-width unicode characters spell out hidden instructions invisible to humans
Pattern scanner strips and decodes; LLM analyzes the decoded content

## Scope Creep

A "code formatter" that also modifies git config or installs packages
LLM compares declared purpose against every instruction and flags overreach

## Supply Chain

A trusted skill receives an update that quietly adds malicious instructions
Every version triggers a full re-scan with diff-focused analysis on changes
UC-2: Translate and Deploy Across Tools
Trigger: User selects a skill and chooses a deployment target in a different format.
Flow: The user selects the target format (Claude Code SKILL.md, agents.md, .cursorrules) from a dropdown. skillvault sends the canonical skill to the configurable LLM for semantic translation, which preserves the skill's behavioral intent while adapting to the target platform's conventions. The translated version appears in a preview pane for review. On approval, skillvault places the file in the correct directory for the target tool.
Why LLM translation: Format conversion is not string replacement. A Claude Code skill that uses XML-structured output guidance needs different phrasing when expressed as agents.md behavioral instructions. The LLM understands what the skill is trying to accomplish and re-expresses that intent in the target platform's idiom.

## Supported Formats


## Format

Tool(s)

## Import


## Export

SKILL.md

## Claude Code

Full parse + scan
Full generation
agents.md
OpenAI agents, compatible tools
Full parse + scan
Full generation
.cursorrules

## Cursor

Full parse + scan
Best-effort
Raw markdown
Generic / custom tools
As-is + scan

## Passthrough

Extensibility: Format adapters are plug-in based. Adding support for a new format means writing a parser and an emitter. Community contributors can add formats without touching core code.
UC-3: View and Manage Skill Inventory
Trigger: User opens skillvault or navigates to the inventory view.
Flow: The dashboard shows every skill in the vault as a card or row with: name, source format, source URL, current version, deployment targets (which tools are running it), last scan result (color-coded risk level), and date last modified. Users can filter by format, risk level, or deployment target. Clicking a skill opens its detail view with full version history, scan reports, and a diff viewer.
UC-4: Audit All Skills
Trigger: User clicks "Audit Vault" or schedules a periodic audit.
Flow: skillvault re-scans every skill in the vault and checks for drift (skills that changed on disk outside of skillvault). Results appear in a summary view: skills with new findings, skills with external modifications, and skills that have not been scanned in a configurable time window. This is the governance view for team leads who need to maintain hygiene across a growing skill library.
UC-5: Browse and Import From Community Sources
Trigger: User searches for skills from within skillvault.
Flow: The discovery panel lets users search and browse indexed community directories (skills.sh, official agents.md examples, curated collections). Results show source, author, and a pre-scan risk indicator. Clicking "Import" runs the full security scan before the skill enters the vault. The goal: users should never need to visit an external site to find, evaluate, or import a skill.
Interface: GUI-First, CLI-Available
The primary interface is a desktop application built as an Electron or Tauri app (or a local web app served on localhost). The GUI is the default experience because most people who work with AI skills are not terminal-native. Team leads, product managers, and non-technical AI users need to scan, review, and manage skills visually.
GUI Views

## View


## Description


## Vault Dashboard

Home screen. Card or table view of all skills. Filter by format, risk level, deployment target. Quick actions: scan, deploy, diff, delete.

## Scan Report

Detailed security analysis. Risk score gauge. Findings list with severity badges and highlighted excerpts from the skill. Plain-English explanations. Approve or reject buttons.

## Skill Detail

Full view of a single skill. Canonical content, format-specific previews for each target, version timeline, all scan results, deployment history.

## Translation Preview

Side-by-side view showing the original skill and the translated version in the target format. Confidence indicator for translation fidelity.

## Diff Viewer

Compare any two versions of a skill. Inline diff with additions, deletions, and security scan changes highlighted.

## Audit Summary

Results of a full vault audit. Skills grouped by status: clean, new findings, external modifications, stale scans.

## Discovery

Search and browse community skill sources. Pre-scan risk indicators. One-click import with full security analysis.
CLI for Power Users
The CLI mirrors every GUI action for developers who prefer the terminal or want to integrate skillvault into scripts and CI pipelines.

## Command


## What It Does

skillvault init
Creates a new vault. Detects installed AI tools and maps their skill locations.
skillvault scan <path|url>
Two-layer security analysis. Outputs risk score, findings, and recommendation.
skillvault add <path|url>
Import, auto-detect format, scan, and add to vault if it passes.
skillvault list
Show all skills with format, version, targets, and scan results.
skillvault deploy <skill> --target <fmt>
Translate and deploy to the target tool's skill directory.
skillvault diff <skill> [v1] [v2]
Show diff between versions including security scan changes.
skillvault rollback <skill> <version>
Revert to a previous version and re-deploy to all active targets.
skillvault audit
Re-scan every skill. Flag external modifications.

## Technical Architecture


## Core Modules

Format Adapters (plugin-based): Each supported format has a parser (file to canonical schema) and an emitter (canonical schema to file). Adapters register at startup. Adding a new format means dropping in an adapter module. The weekend sprint ships SKILL.md, agents.md, and .cursorrules adapters.
Security Scanner: Two-layer pipeline. Layer 1 runs deterministic pattern checks (regex, unicode analysis, encoding detection). Layer 2 sends normalized content to a configurable LLM with a structured adversarial analysis prompt. The LLM provider is set via config (defaults to Claude, swappable to OpenAI, local models, or any chat completion API).
Vault Registry: JSON-based local database backed by git. Each skill is a directory with the canonical schema, format exports, version history, and scan results. Git handles versioning, diffing, and rollback natively.
Deployment Manager: Maps skills to file system locations for each tool. Knows where Claude Code, Cursor, and agents.md tools expect instruction files. Handles symlinks or copies depending on platform.
GUI Layer: Local web app served on localhost (Next.js or similar) or packaged as a Tauri/Electron desktop app. Communicates with the core modules through a local API. The GUI is a presentation layer; all logic lives in the core modules so the CLI and GUI stay in sync.

## Canonical Schema

Every skill in the vault is stored as a structured object:
id, name, version, description (identity and purpose)
source_url, source_format, author (provenance)
directives[] (parsed instruction blocks)
capabilities[] (what the skill claims to do)
constraints[] (declared limitations and safety boundaries)
scan_results{} (security analysis output with timestamp)
deployments[] (which apps use this skill, at what version, in what format)

## Model-Agnostic Design

The LLM-powered layers (security scan and format translation) accept any provider that exposes a chat completion API. Switching providers requires one config change. This vendor-neutrality is a core design principle. A tool that exists because of vendor fragmentation should not create more of it.

## Weekend Sprint Plan

Two days. Ship a working v0.1.0 to GitHub.

## Saturday: Core + Security + Data Layer


## Block


## Deliverable


## Done When


## Morning

Project scaffold, canonical schema, SKILL.md parser, agents.md parser, vault storage layer
Can parse both formats into canonical schema and store in vault.

## Afternoon

Security scanner (both layers), CLI commands: init, scan, add, list
Can scan a skill, produce a risk report, add to vault, list contents.

## Evening

Test suite: 10+ malicious samples, 10+ clean samples. Tune scanner prompts.
80%+ detection on malicious. Under 10% false positives on clean.
Sunday: Translation + GUI + Ship

## Block


## Deliverable


## Done When


## Morning

Format emitters, deploy command, LLM-powered translation, remaining CLI commands (diff, rollback, audit, export)
Full CLI works end-to-end. Can translate and deploy between formats.

## Afternoon

GUI: vault dashboard, scan report view, skill detail view, translation preview
Can perform core workflows (scan, add, deploy, view inventory) through the GUI.

## Evening

README, GitHub repo, npm publish (CLI), demo recording, app packaging
Working release on GitHub. README covers install, quickstart, screenshots.
Scope discipline: If the GUI falls behind, ship with the core dashboard and scan report views only. The skill detail and translation preview can ship in a fast follow-up. The CLI covers all functionality regardless.

## What Ships Later


## Version


## Features


## Why It Matters

v0.2
Community discovery: search skills.sh and agents.md repos from within skillvault. Pre-scan risk indicators on results. AI Collective shared vault.
Users never need to visit an external site to find skills. Community sharing gets a trust layer.
v0.3
Self-improving skills: execution signal capture, LLM-powered regression detection, automated improvement proposals with human approval.
Skills get better through use, not just manual rewrites. This is the long-term thesis.
v0.4
Team governance: shared vaults with access control, minimum trust thresholds, audit reports, CI/CD integration.
Enterprise and team adoption. Compliance and governance workflows.
v0.5
Additional format adapters based on community contributions. Support for emerging agent frameworks as they appear.
Staying current as the ecosystem evolves. Community-driven format coverage.

## Assumptions

#

## Assumption


## Confidence


## If Wrong

1
An LLM can reliably detect adversarial prompt patterns in skill files, including novel attacks beyond known signatures.
High for known attacks. Medium for novel zero-days.
Scanner falls back to pattern-only. Still useful. Open issue for community to improve detection prompts.
2
Semantic-preserving translation between skill formats works without significant intent loss.
Medium. Clean for simple skills. Nuance may drop for complex, format-specific patterns.
Translation includes a confidence score. Warns users when fidelity is uncertain.
3
A GUI significantly broadens the audience beyond CLI-native developers.
High. Most people who work with AI tools are not terminal-first users.
CLI still covers all functionality. GUI becomes a nice-to-have rather than the primary interface.
4
agents.md and .cursorrules formats are stable enough to build parsers against.
Medium-High. Both are public and relatively simple.
Adapter plugin system isolates format instability from core code.
5
AI Collective members will use and contribute to this project.
High. The community collaborates actively. This addresses a problem members discuss regularly.
Solo-maintained project. Still useful as a personal tool with open source upside.

## Success Metrics

Weekend Sprint (v0.1.0)
Functional: GUI and CLI both support scan, add, list, deploy, diff, rollback, and audit workflows end-to-end.
Security accuracy: 80%+ detection on malicious test suite. Under 10% false positives on legitimate skills.
Format coverage: Full round-trip for SKILL.md and agents.md. Best-effort .cursorrules.
Published: Live on GitHub with README, screenshots, and install instructions.

## First 30 Days

Adoption: 5+ AI Collective members actively using skillvault. 10+ GitHub stars.
Contributions: 3+ contributors beyond the maintainer. At least 1 community-contributed format adapter or malicious skill test case.
Demo: Presented at an AI Collective meetup.

## 90 Days

v0.2 shipped: Community discovery live. Shared AI Collective vault operational.
External recognition: Featured in at least one developer newsletter, blog, or community showcase.
Security test suite: 50+ malicious samples contributed by community. Detection rate at 90%+.