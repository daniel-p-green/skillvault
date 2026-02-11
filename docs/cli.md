# CLI reference (v0.1)

SkillVault is a **CLI-first trust layer** for SKILL.md bundles.

Scope (v0.1 decisions):
- Inputs are **local bundles only**: a directory or a `.zip`.
- Bundles must contain **exactly one** manifest: `SKILL.md` or `skill.md`.
- Receipts are **offline-verifiable via deterministic hashing** (no signatures in v0.1).
- Scanning is **deterministic + rule-based** (no LLM scoring path).

## Conventions

### Bundle input
Every command that accepts a bundle takes:
- `<bundle_dir>` (a directory), or
- `<bundle.zip>` (a zip file)

### Output formats
Most commands support:
- `--format json` (default in tests/goldens)
- `--format table` (human readable)

### Deterministic mode
`--deterministic` freezes any time-based fields (e.g., `created_at`) and ensures stable ordering so outputs can be compared byte-for-byte.

### Writing output
Many commands support:
- `--out <path>` to write the JSON/table output to a file.

### Exit codes (v0.1)
- `0`: success (including PASS and WARN)
- `1`: error (including FAIL, verify failures, policy/constraint violations)

---

## `skillvault scan`

Scan a bundle and emit a deterministic scan report.

**Synopsis**

```bash
skillvault scan <bundle_dir|bundle.zip> [--policy policy.yaml] [--format json|table] [--out file] [--deterministic]
```

**Notes**
- `--policy` is optional for `scan`; findings are scanner-derived. If a policy is provided, the scan may include policy-aware context depending on the implementation, but the primary purpose is to emit a `ScanReport`.

**Example (JSON)**

```bash
node packages/cli/dist/cli.js scan packages/cli/test/fixtures/benign-skill --format json --deterministic
```

**Example (table)**

```bash
node packages/cli/dist/cli.js scan packages/cli/test/fixtures/benign-skill --format table
```

---

## `skillvault receipt`

Generate a portable receipt bound to a specific bundle hash + file list.

**Synopsis**

```bash
skillvault receipt <bundle_dir|bundle.zip> [--policy policy.yaml] [--out receipt.json] [--deterministic]
```

**Example**

```bash
node packages/cli/dist/cli.js receipt packages/cli/test/fixtures/benign-skill \
  --policy packages/cli/test/fixtures/policy-pass.yaml \
  --out /tmp/skillvault-receipt.json \
  --deterministic
```

---

## `skillvault verify`

Verify that a bundle matches a receipt, and that policy/constraints/approvals (if required) are satisfied.

**Synopsis**

```bash
skillvault verify <bundle_dir|bundle.zip> --receipt receipt.json [--policy policy.yaml] [--offline] [--format json|table] [--deterministic]
```

**Hard-fail conditions (required in v0.1)**
- Any **content hash mismatch** (missing/extra file, per-file sha256 mismatch, bundle sha256 mismatch)
- Any **constraint violation** under the applied policy
- Any **required approval missing** (approval system is a placeholder in v0.1, but the policy decision must be deterministic)

**Example**

```bash
node packages/cli/dist/cli.js verify packages/cli/test/fixtures/benign-skill \
  --receipt /tmp/skillvault-receipt.json \
  --policy packages/cli/test/fixtures/policy-pass.yaml \
  --offline \
  --format json \
  --deterministic
```

---

## `skillvault gate`

Apply a policy gate to either:
- an existing receipt (`--receipt`), or
- a bundle input (scan + gate)

**Synopsis**

```bash
skillvault gate (--receipt receipt.json | <bundle_dir|bundle.zip>) --policy policy.yaml [--format json|table] [--deterministic]
```

**Example (receipt-only gating)**

```bash
node packages/cli/dist/cli.js gate --receipt /tmp/skillvault-receipt.json \
  --policy packages/cli/test/fixtures/policy-allow-all.yaml \
  --format table
```

---

## `skillvault diff`

Compare two bundle/receipt inputs and emit security-relevant deltas.

**Synopsis**

```bash
skillvault diff --a <bundle|receipt> --b <bundle|receipt> [--format json|table] [--deterministic]
```

**Examples**

```bash
# bundle vs bundle
node packages/cli/dist/cli.js diff --a ./my-skill-v1 --b ./my-skill-v2 --format json --deterministic

# receipt vs bundle
node packages/cli/dist/cli.js diff --a ./receipt-v1.json --b ./my-skill-v2 --format table
```

---

## `skillvault export`

Export a directory bundle to a strict zip that enforces v0.1 hygiene constraints.

**Synopsis**

```bash
skillvault export <bundle_dir> --out bundle.zip [--policy policy.yaml] [--profile strict_v0]
```

**Notes**
- `export` only accepts a directory (not a zip input) in v0.1.
- `--profile` selects a named policy profile from `policy.yaml` (SkillVault profiles, not OpenAI profiles).

**Example**

```bash
node packages/cli/dist/cli.js export packages/cli/test/fixtures/benign-skill \
  --out /tmp/benign-skill.zip \
  --policy ./policy.yaml \
  --profile strict_v0
```
