# Use Cases

## UC-1 Import and inventory a new skill

- Actor: Solo developer
- Trigger: Receives a skill bundle path or zip
- Workflow:
  1. `skillvault manager import <bundle>`
  2. `skillvault manager inventory`
- Adapter targets: Any (inventory-only)
- Expected result: Skill version stored in vault with scan and receipt metadata.

## UC-2 Deploy one skill to one app

- Actor: Multi-app power user
- Trigger: Wants to install a specific skill in Codex
- Workflow:
  1. `skillvault manager deploy <skill_id> --adapter codex --scope project --mode symlink`
- Adapter targets: `codex`
- Expected result: Skill linked into adapter path and tracked in deployments.

## UC-3 Deploy one skill to multiple apps

- Actor: Multi-app power user
- Trigger: Needs parity across app set
- Workflow:
  1. `skillvault manager deploy <skill_id> --adapter '*' --scope project --mode symlink`
- Adapter targets: `codex`, `windsurf`, `openclaw`, `cursor`, `claude-code`, others enabled
- Expected result: Deployment results per adapter with success/skip/fail status.

## UC-4 Verify receipt trust before policy gating

- Actor: Security owner
- Trigger: Receipt-only gate request
- Workflow:
  1. `skillvault gate --receipt receipt.json --pubkey key.pem --policy policy.yaml`
  2. optional integrity check: `--bundle <bundle>`
- Adapter targets: N/A (trust layer)
- Expected result: Gate fails if signature/key trust fails.

## UC-5 Detect drift after out-of-band edits

- Actor: Team lead
- Trigger: Suspects manual file changes after deployment
- Workflow:
  1. Mutate installed copy outside manager
  2. `skillvault manager audit`
- Adapter targets: Any deployed adapter
- Expected result: Drifted deployment appears in audit summary.

## UC-6 Discover and import from skills ecosystem

- Actor: Power user
- Trigger: Needs a skill by domain query
- Workflow:
  1. `skillvault manager discover --query "<text>"`
  2. `skillvault manager import <bundle>`
- Adapter targets: N/A until deployed
- Expected result: Discovery results are reviewable and import path is immediate.
