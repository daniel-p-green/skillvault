<!-- NOTE: Cleaned for readability (removed tool citation artifacts). See fit-assessment.raw.md for the original. -->

# SkillVault and Trustplane Fit Assessment
Confidence score: 90%. This report draws from primary specs, vendor docs, and mature security frameworks. The ecosystem changes weekly, so the competitive landscape and tool counts carry modest volatility.
Roles: Product strategy lead. Software supply chain security architect. Developer tooling systems designer. AI evaluation and observability engineer.
## Executive synthesis
The market now shows measurable signals of fragmentation and scale across agent instruction artifacts. Multiple ecosystems converge on two broad primitives: portable skill packages that wrap instructions plus optional code, and repository level agent guidance files that shape behavior. 
The ecosystem already supports the story you wrote in your brief: users pull skills from public directories, install them into a growing list of agent tools, and lack a consistent trust layer and inventory view across tools. 
However, the ecosystem also already ships several “universal installer” CLIs and registries that overlap with your initial “package manager” framing. 
That overlap creates the core strategic risk: you can build a weekend project that replicates existing behavior and wins no durable niche. SkillVault can still win, but only if you center the product on what the current tools under deliver: local, explainable security review. Provenance receipts that travel with the artifact. Cross format canonicalization that spans both skill packages and guidance files. Policy gating and audit ready outputs.
The strongest fit for SkillVault and Trustplane therefore sits in a “trust and governance layer” that complements installers and directories instead of competing head on. Your brief already points in that direction through scan first workflows, git backed provenance, and a GUI that targets non terminal native users. 
## Current ecosystem and market need
### The ecosystem already standardizes around two artifact families
Agent Skills standardizes the “skill package” as a directory with a required SKILL.md plus optional scripts, references, and assets. The spec requires name and description in YAML frontmatter and defines an optional allowed-tools field, plus progressive disclosure guidance. 
OpenAI’s Codex documentation describes a compatible skill shape and adds optional metadata under agents/openai.yaml, plus explicit and implicit invocation. 
Claude Code documentation describes skills under .claude/skills, supports nested discovery in monorepos, and supports frontmatter fields such as disable-model-invocation and allowed-tools. 
AGENTS.md standardizes a separate “agent guidance” artifact as plain Markdown at repo root or nested directories, with precedence based on nearest file. Over 60k open source projects now use it, and the Agentic AI Foundation under the Linux Foundation stewards it. 
This split matters for your product. If you scope only around SKILL.md, you compete with installers. If you unify SKILL.md plus AGENTS.md plus editor specific rules, you move into a higher value control plane.
### Scale signals show a fast expanding skill supply chain
Vercel’s skills ecosystem introduced a CLI and the skills.sh leaderboard that spans many agents and tracks usage and installs. 
Vercel reports over 45,000 unique skills on the leaderboard since launch and describes an automated review pipeline that re reviews on folder hash changes and flags obfuscation patterns and non reviewable code. 
Those numbers validate user demand. They also validate an attacker incentive surface. A large, open ecosystem invites both opportunistic and targeted attacks, especially when skills can ship scripts and tool instructions.
### Directory and path fragmentation remains real, despite emerging standards
Vercel’s skills CLI lists a broad set of supported agents and installs skills into different per tool paths, including .claude/skills, .agents/skills, .cursor/skills, and many more. 
OpenAI Codex reads skills from multiple scopes and locations including repo, user, admin, and system, and it scans upward from the current working directory to repo root. 
Claude Code supports enterprise, personal, project, and plugin locations with a defined precedence order and nested discovery. 
These details support your “single inventory” thesis because users cannot reliably answer three operational questions without tooling: what runs, where it runs, and which version runs. 
## Competitive landscape and gaps
### The market already ships universal installers and simple registries
The key competitive reality: the market already ships multiple tools that solve installation, syncing, and sometimes translation. Your product must avoid a “me too installer” trap.
Table: What exists now, and what remains under served
| Category | Representative projects | What they do well | What they do not fully solve | SkillVault differentiation opportunity |
|---|---|---|---|---|
| Skill directories and leaderboards | skills.sh leaderboard | Discovery, popularity signals, broad ecosystem coverage | Local policy enforcement, environment specific risk, organization governance | Local trust decisions, policy gating, receipts that attach to installed versions |
| Universal install CLIs | Vercel skills CLI | Auto detect installed agents, map many install paths, simple add and remove | Deep security analysis for user environment, canonical cross format representation | Add “trust layer” before install and after updates |
| Manifest and lock tooling | skillman | Reproducible installs through skills.json | Security posture, provenance attestations, cross format translation | Attach signed scan receipts to locked dependencies |
| Multi agent skill management | openskills | Install and sync, universal mode for multi agent setups, AGENTS.md update | Risk analysis, tamper evidence, supply chain policy | Provide security pipeline and provenance receipts |
| Cross platform skill packaging | SkillKit | Install, translate, share across many tools | Hard to verify security claims, unclear audit chain, unclear enterprise policy | Position as verification, evidence, and governance layer |
Sources: Vercel skills CLI and skills.sh. 
Sources: skillman. 
Sources: openskills. 
Sources: SkillKit repo metadata. 
### The most important gap: “trust” remains underspecified and inconsistent
Vercel’s leaderboard explicitly frames the system as open and still asks users to trust publishers and read skill contents, even after automated review. 
That posture makes sense for a public leaderboard, but it leaves a product gap for local, user centered trust decisions that incorporate environment context. Your brief targets that gap by offering two layer scanning, plain English reports, a PASS or WARN or FAIL recommendation, and a vault inventory. 
SkillVault should therefore avoid competing on install breadth and instead compete on verifiable trust, provenance, and policy.
## Threat model and attacker scenarios
### Modern agent skill ecosystems inherit two security problem classes
First: prompt injection and indirect prompt injection attack patterns exploit the model’s inability to cleanly separate instructions from data. OWASP places prompt injection at the top of its LLM risk list and also includes supply chain vulnerabilities as a distinct category. 
Second: software supply chain dynamics apply directly. The event-stream incident shows how an attacker can compromise a widely used dependency through maintainer access and targeted payloads. That incident also shows how attacks often activate selectively to avoid detection. 
The agent ecosystem adds a twist: the payload often lives in natural language instructions and therefore bypasses traditional code scanning heuristics.
### Attacker scenarios SkillVault must assume
Table: Attacker model focused on skill artifacts
| Scenario | Attacker capability | Target outcome | Why it works today | SkillVault control points |
|---|---|---|---|---|
| Malicious skill submission | Publish a public repo and promote installs | Exfiltrate secrets or insert backdoor logic | Users copy blindly, directories prioritize popularity | Pre install scan, provenance receipts, policy require approvals |
| Supply chain poisoning update | Push a “minor update” after trust | Add obfuscated payload later | Users do not re review updates, tools auto update | Diff aware rescans, version pinning, alerting, update quarantine |
| Obfuscated script payload | Hide executable logic in scripts or base64 blobs | Remote code execution or data theft | Skills can include scripts; users cannot review minified payloads | Deterministic unpacking, policy blocks, sandbox execution |
| Prompt level policy override | Bury “ignore prior rules” instructions | Agent performs unsafe actions | Models treat text as instructions, not code | Semantic scan for intent conflict and scope creep |
| Cross tool drift exploit | Rely on format differences | Bypass constraints in one target tool | Translators and users lose intent during port | Canonical schema, translation preview, fidelity warnings |
| Indirect injection through references | Hide instructions in referenced docs | Hijack an agent during skill execution | Skills often load references dynamically | Normalize referenced content for scan, restrict allowed origins |
Primary support: OWASP prompt injection guidance and taxonomy. 
Primary support: indirect prompt injection core paper. 
Primary support: recent cataloging of attacks against agentic coding assistants. 
### Implication: static scanning alone cannot close risk
Microsoft and Google both emphasize layered defenses against indirect injection in agentic systems, including isolation, confirmations, and constraints on what an agent can access. 
Anthropic and OpenAI both describe prompt injection as evolving and persistent, which reinforces the need for runtime and workflow guardrails rather than relying solely on content inspection. 
Therefore, SkillVault should treat scanning as necessary but insufficient and design for guardrails, receipts, and policy gates.
## Personas and jobs to be done
Your brief identifies four core audiences: multi tool developers, non technical AI users, team leads, and community members. 
This section tightens those personas into adoption and monetization logic.
### Solo developers and power users
Behavior: install skills quickly, iterate often, prefer CLI tooling, tolerate friction only when it saves time.
Pain: tool path sprawl across Claude Code, Codex compatible tools, and editors, plus uncertainty about who last modified a skill and what changed.
What they pay attention to: speed, compatibility breadth, and automation.
SkillVault wedge: “scan and receipt” that runs locally and integrates into existing install tools.
### App builders and agent workflow teams
Behavior: maintain shared repos, standardize conventions via AGENTS.md, and share skills across teams.
Pain: version drift, no audit story, hard to compare what runs in each agent.
What they pay attention to: consistency, reproducibility, and developer experience.
SkillVault wedge: canonical schema that exports to each target, plus a vault dashboard for inventory and deployments. 
### Security and governance teams
Behavior: enforce policy gates, document provenance, require attestations, and respond to incidents.
Pain: no SBOM like artifact for skills, no signatures, no evidence that teams reviewed updates.
What they pay attention to: auditability, tamper evidence, and policy enforcement.
SkillVault wedge: provenance receipts and optional signatures, plus CI hooks and policy files.
This wedge aligns well with existing supply chain governance frameworks like SBOM guidance from NIST and CISA and integrity frameworks like SLSA. 
## Architecture options and recommended design
Your brief proposes a plugin adapter system, two layer scanning, git backed vault storage, and a GUI first desktop app. 
This section evaluates options and recommends a v0.1 architecture that avoids competing head on with existing installers.
### Canonical schema and adapter strategy
The ecosystem already shows three dominant “structures”:
Agent Skills SKILL.md: structured frontmatter plus freeform body plus optional directories. 
Codex skill extensions: same plus optional agents/openai.yaml. 
AGENTS.md: freeform Markdown with directory precedence and no required fields. 
A canonical schema must therefore represent both “package style skills” and “guidance docs” under a single internal model.
Recommendation: treat everything as a “directive artifact” with optional packaging. Model skills as a directive artifact that also declares resources and capabilities.
### Recommended canonical schema v0.1
Design goals:
Keep it small enough for a weekend build.
Represent provenance and scan evidence as first class fields.
Support deterministic exports to target formats.
```json
{
  "schema_version": "0.1",
  "id": "svlt_01HS8FQ2X5Q9J6KJ2M5T0YQG7W",
  "kind": "skill",
  "name": "code-review",
  "title": "Code review helper",
  "description": "Review PR diffs and produce actionable feedback. Use for PR review and pre-merge checks.",
  "source": {
    "uri": "github:org/repo/path",
    "publisher": "org",
    "retrieved_at": "2026-02-10T21:14:00Z",
    "commit": "abcdef1234567890",
    "content_hash": "sha256:..."
  },
  "format": {
    "ingested_as": "agent-skills",
    "detected_files": ["SKILL.md", "scripts/validate.sh", "references/STYLE.md"]
  },
  "directives": [
    {
      "id": "d1",
      "scope": "agent",
      "priority": "normal",
      "text": "When reviewing code, focus on correctness, security, performance, and maintainability. Cite line ranges when possible."
    }
  ],
  "capabilities": {
    "declared": {
      "tools": ["Read", "Grep"],
      "network": "deny",
      "filesystem_write": "deny",
      "exec": "deny"
    },
    "inferred": {
      "tools": ["Read", "Grep"],
      "network": "unknown",
      "filesystem_write": "unknown",
      "exec": "unknown"
    }
  },
  "resources": [
    {
      "path": "scripts/validate.sh",
      "type": "script",
      "language": "bash",
      "hash": "sha256:..."
    },
    {
      "path": "references/STYLE.md",
      "type": "reference",
      "hash": "sha256:..."
    }
  ],
  "deployments": [
    {
      "target": "claude-code",
      "installed_path": ".claude/skills/code-review/SKILL.md",
      "deployed_version": "sha256:...",
      "status": "active",
      "deployed_at": "2026-02-10T21:20:00Z"
    }
  ],
  "scans": [
    {
      "scan_id": "scan_01HS8FR3QJ...",
      "scanner_version": "0.1",
      "timestamp": "2026-02-10T21:16:00Z",
      "methods": ["normalize", "pattern", "semantic"],
      "verdict": "warn",
      "risk_score": 37,
      "findings": [
        {
          "severity": "medium",
          "type": "obfuscation",
          "evidence": {
            "path": "scripts/validate.sh",
            "excerpt": "curl URL | bash",
            "location": { "line_start": 12, "line_end": 12 }
          },
          "explanation": "Script fetches remote content without pinning or integrity checks.",
          "recommendation": "Pin a commit hash or remove remote execution. Require sandbox execution."
        }
      ]
    }
  ],
  "receipt": {
    "receipt_version": "0.1",
    "statement": "SkillVault scanned this artifact and recorded evidence. Treat this as advisory, not a guarantee.",
    "signed": false,
    "signature": null
  }
}
```
Alignment notes:
Agent Skills spec requires name and description and allows allowed-tools, metadata, and optional directories. Your schema maps those into description, resources, and capabilities. 
Claude Code uses allowed-tools and disable-model-invocation semantics; your schema captures these through capabilities and an adapter that maps to frontmatter. 
AGENTS.md uses freeform Markdown and nested precedence; your schema captures this as kind: guidance with directives that include scope and path based precedence. 
### Static plus semantic scanning pipeline
Your brief proposes a two layer scan: deterministic pattern checks plus LLM semantic review. 
Recommendation: add a third layer that evaluates policy deltas between declared and inferred capabilities.
Pipeline:
Normalization: strip zero width characters, normalize Unicode, decode base64 like segments, expand common obfuscation encodings.
Pattern scan: flag high signal primitives like remote execution, obfuscated binaries, hidden text, suspicious URL patterns. Vercel cites these patterns as practical signals for “non reviewability.” 
Semantic scan: ask a reasoning model to summarize intended effect, enumerate side effects, and identify covert channels. OWASP taxonomy can drive the classification labels. 
Policy check: compare declared capabilities to inferred, then require a user action to approve escalations.
### Runtime guardrails options
Static review cannot prevent an agent from taking an unsafe action. Microsoft and Google both push layered constraints and confirmations. 
Option set for SkillVault:
Soft guardrails: require explicit confirmation before high risk deployments, warn on capability escalations, block unknown scripts by default.
Sandbox execution: run scripts in an isolated container. The open-skills project explicitly positions Docker isolation as a safety layer for running community skills. 
Path based least privilege: only allow skills to access whitelisted directories, align with the “origin set” idea from browser agents. 
Weekend scope recommendation: ship soft guardrails plus a sandbox execution stub that only runs locally when Docker exists. Defer full sandbox orchestration.
### Provenance receipts and signatures
The supply chain world uses SBOMs to record components and relationships. NIST defines SBOM as a formal record of components and supply chain relationships, and CISA updates minimum element guidance for practical adoption. 
SkillVault should create a “skill receipt” artifact that records:
Source URI.
Commit hash and content hash.
Scan methods and results.
Policy decisions.
User approvals.
Signature option: Sigstore Cosign supports signing and verifying blobs and artifacts and stores signatures in registries. 
Weekend scope recommendation: ship unsigned receipts with hashes. Add Cosign signing only after users request it, because signing UX adds complexity.
## MVP scope, phased roadmap, and integration tradeoffs
### The MVP must avoid re implementing existing installer CLIs
Vercel’s skills CLI already maps many install paths and detects installed agents. 
Several community tools already implement install, sync, and manifest flows. 
Therefore, the MVP should treat “install” as an integration target and focus on:
Ingest.
Scan.
Receipt.
Export and deploy for a small set of formats.
This direction matches your brief, which defines scanning, translation, versioning, and a dashboard. 
### MVP scope for a weekend project
Deliverable set:
Canonical schema v0.1 with JSON persistence.
Adapters:
Agent Skills SKILL.md.
AGENTS.md.
Claude Code frontmatter mapping.
Security scan pipeline:
Normalization and pattern checks.
Semantic scan with a configurable model provider.
Receipt generation for every ingest and update.
CLI:
scan, add, list, export, deploy, verify.
Minimal UI:
vault list view and scan report view.
Defer:
Discovery crawling and indexing.
Self improvement loop that uses execution signals.
Team access control and shared vaults.
Your brief already frames this deferral as later versions, which fits weekend scope reality. 
### CLI examples that match the recommended scope
```bash
# Create a local vault
skillvault init --vault ~/.skillvault
# Ingest a skill package from a repo and scan it
skillvault add github:vercel-labs/agent-skills:vercel-deploy --scan
# Ingest a repo guidance file and normalize it
skillvault add ./AGENTS.md --kind guidance --scan
# Show inventory with audit signals
skillvault list --sort risk --show deployments --show provenance
# Export a canonical artifact to targets
skillvault export code-review --to agent-skills --out ./exports/code-review/
skillvault export repo-guidance --to agents-md --out ./exports/AGENTS.md
# Deploy with policy gating
skillvault deploy code-review --target claude-code --policy ./policy.yaml
# Verify integrity and re scan after updates
skillvault verify code-review
skillvault audit --since 14d
```
### Model agnostic vs vendor tied
Model agnostic design aligns with your problem statement because vendor fragmentation drives the need. Your brief explicitly calls for provider swapping through config for scanning and translation. 
Tradeoffs:
Model agnostic approach increases coverage and reduces lock in, but it increases test surface and complicates deterministic behavior.
Vendor tied approach improves short term quality and reduces configuration complexity, but it undermines category ownership and forces rewrites when vendors change formats.
Recommendation: keep a model agnostic interface, ship with one default provider integration, and add a strict “no network” local mode where semantic scanning switches off.
### W&B Weave for the self improving loop
W&B Weave positions itself as an observability and evaluation platform for LLM apps and supports evaluations and tracing. 
This capability aligns with your v0.3 “self improving skills” thesis from earlier documents. 
However, the weekend MVP lacks the required plumbing:
You need structured execution traces.
You need stable evaluation datasets.
You need a feedback mechanism that users trust.
Recommendation: defer Weave integration until you ship:
A stable canonical schema.
A scan receipt workflow.
A small evaluation harness that runs offline.
If you later add self improvement, Weave or LangSmith can power regression detection and score tracking. LangSmith explicitly frames evaluation as dataset driven benchmarking to compare versions and catch regressions. 
## Go and no go criteria
This section defines decision gates that prevent sunk cost drift and keep the project honest.
### Go criteria
Uniqueness gate: SkillVault must ship at least two capabilities that the common installers do not deliver together:
Local, explainable security report with evidence excerpts.
Provenance receipt that records source hashes and scan results and updates on diffs.
Cross family support that spans SKILL.md style skills and AGENTS.md guidance.
Adoption gate: at least five real users must run it on their own skills and keep it installed for two weeks. This gate validates retention rather than curiosity.
Trust gate: the scanner must demonstrate consistent behavior on a public test suite:
High true positive rate on obvious obfuscation and remote execution primitives.
Low false positive rate on common safe patterns, especially in SKILL.md where scripts and tool usage often look suspicious but support legitimate workflows. Vercel explicitly highlights the need to distinguish “skills as injections by design” from non reviewable payloads. 
Integration gate: the tool must export and deploy at least:
Agent Skills SKILL.md.
AGENTS.md.
One tool specific mapping such as Claude Code paths.
Claude Code and Codex both describe multi scope, nested discovery. SkillVault must demonstrate that it can map these locations accurately for one tool, then generalize later. 
### No go criteria
Commoditization trap: if users describe the tool as “another skills installer” after they see the demo, stop and reposition.
Security theater risk: if users treat risk scores as guarantees or skip reading evidence excerpts, you must redesign the UX around “risk with evidence” and enforced policy gates. OWASP and vendor guidance repeatedly emphasize evolving attacks and imperfect mitigation. 
Maintenance cliff: if adapters break weekly due to format churn, reduce adapter scope and raise the abstraction layer. AGENTS.md explicitly allows freeform structure, which lowers breakage risk, while tool specific rule formats can churn faster. 
## Source confidence notes
This table assigns confidence to the most load bearing sources in this report. Higher scores reflect primary ownership of the spec or direct operational evidence.
| Source | Confidence | Why this score holds |
|---|---:|---|
| OpenAI Codex docs on AGENTS.md and Agent Skills | 95% | Official vendor documentation for format and behavior. 
| Claude Code skills docs | 95% | Official documentation for directory structure, frontmatter fields, and precedence rules. 
| Agent Skills specification | 95% | Primary format specification that defines required fields and optional directories. 
| AGENTS.md specification site | 90% | Primary spec hub with governance disclosure and adoption counts; counts can drift over time. 
| Vercel skills ecosystem docs and blog | 90% | First party operational evidence, includes measurable scale and review pipeline details. 
| OWASP LLM Top 10 and prompt injection guidance | 95% | Widely used security taxonomy and guidance from a recognized standards body. 
| Indirect prompt injection foundational paper | 90% | Highly cited primary research that defines indirect injection threat model. 
| NIST AI RMF 1.0 | 95% | Authoritative framework for AI risk management and governance. 
| NIST and CISA SBOM guidance | 95% | Authoritative supply chain transparency guidance, directly relevant to receipts and provenance. 
| skillman and openskills repos | 85% | Primary repo sources for tool behavior; small projects can change quickly. 
[2026-02-10]
