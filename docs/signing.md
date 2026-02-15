# Signing, keys, and offline verification (v0.1)

SkillVault v0.1 receipts are **Ed25519 signed** and verifiable fully offline.

## What is signed

`skillvault receipt` builds an unsigned receipt payload, then:

1. Removes the `signature` field (unsigned payload)
2. Canonicalizes JSON (stable key ordering, no extra whitespace)
3. Hashes canonical bytes with SHA-256 -> `signature.payload_sha256`
4. Signs the same canonical bytes with Ed25519 -> base64 `signature.sig`

The receipt includes:

```json
{
  "signature": {
    "alg": "ed25519",
    "key_id": "optional-key-id",
    "payload_sha256": "...",
    "sig": "..."
  }
}
```

## Receipt command

```bash
node packages/cli/dist/cli.js receipt <bundle_dir|bundle.zip> \
  --policy policy.yaml \
  --signing-key ./ed25519-private.pem \
  --key-id team-main \
  --out receipt.json \
  --deterministic
```

- `--signing-key` is required (Ed25519 private key, PEM PKCS#8).
- `--key-id` is optional but recommended when using a keyring.

## Verify command (offline)

You must provide exactly one key source:

- `--pubkey <ed25519-public.pem>` OR
- `--keyring <dir>`

```bash
node packages/cli/dist/cli.js verify <bundle_dir|bundle.zip> \
  --receipt receipt.json \
  --policy policy.yaml \
  --pubkey ./ed25519-public.pem \
  --offline \
  --format json
```

or:

```bash
node packages/cli/dist/cli.js verify <bundle_dir|bundle.zip> \
  --receipt receipt.json \
  --policy policy.yaml \
  --keyring ./keyring \
  --offline
```

### Keyring lookup

When `--keyring` is used, verification resolves the public key by `key_id` and filename conventions in a deterministic way. If no key is found, verification fails with a stable reason code.

## Hard-fail behavior (required)

`skillvault verify` must fail (non-zero exit) for any signature problem:

- payload hash mismatch
- invalid Ed25519 signature
- missing/unknown key
- malformed receipt/signature envelope

Verification also fails on bundle hash / file hash mismatches.

## Test keys

Fixture keys for tests and goldens live under:

- `packages/cli/test/fixtures/keys/ed25519-private.pem`
- `packages/cli/test/fixtures/keys/ed25519-public.pem`

Use your own keys for real workflows.
