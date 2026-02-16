import { describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto';

import { generateReceipt } from '../src/lib/receipt.js';
import { main } from '../src/cli.js';
import { DETERMINISTIC_CREATED_AT_ISO } from '../src/lib/time.js';
import { canonicalJsonBytes } from '../src/util/canonicalJson.js';

const FIXTURES = path.resolve(process.cwd(), 'test', 'fixtures');
const PRIVATE_KEY = path.join(FIXTURES, 'keys', 'ed25519-private.pem');
const PUBLIC_KEY = path.join(FIXTURES, 'keys', 'ed25519-public.pem');

describe('skillvault receipt', () => {
  it('generates a signed receipt with bundle hash, per-file hashes, scan summary, and policy decision', async () => {
    const bundleDir = path.join(FIXTURES, 'benign-skill');
    const policyPath = path.join(FIXTURES, 'policy-pass.yaml');

    const receipt = await generateReceipt(bundleDir, {
      policyPath,
      signingKeyPath: PRIVATE_KEY,
      keyId: 'fixture-ed25519',
      deterministic: true
    });

    expect(receipt.contract_version).toBe('0.1');
    expect(receipt.created_at).toBe(DETERMINISTIC_CREATED_AT_ISO);
    expect(receipt.scanner.name).toBe('skillvault');
    expect(typeof receipt.scanner.version).toBe('string');

    expect(receipt.bundle_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.files.length).toBeGreaterThanOrEqual(2);
    expect(receipt.files[0].path).toBe('SKILL.md');

    for (const f of receipt.files) {
      expect(f.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(f.size).toBeGreaterThanOrEqual(0);
    }

    expect(receipt.scan.summary.file_count).toBe(receipt.files.length);
    expect(receipt.scan.summary.deterministic).toBe(true);

    expect(receipt.policy.verdict).toBe('PASS');
    expect(receipt.policy.risk_score.total).toBe(0);

    expect(receipt.signature).toBeDefined();
    expect(receipt.signature?.alg).toBe('ed25519');
    expect(receipt.signature?.key_id).toBe('fixture-ed25519');
    expect(receipt.signature?.payload_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.signature?.sig).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it('signature covers canonical JSON payload hash deterministically', async () => {
    const bundleDir = path.join(FIXTURES, 'benign-skill');
    const policyPath = path.join(FIXTURES, 'policy-pass.yaml');

    const receipt = await generateReceipt(bundleDir, {
      policyPath,
      signingKeyPath: PRIVATE_KEY,
      deterministic: true
    });

    const { signature } = receipt;
    expect(signature).toBeDefined();

    const unsignedPayload = {
      ...receipt,
      signature: undefined
    };
    delete (unsignedPayload as any).signature;

    const payloadBytes = canonicalJsonBytes(unsignedPayload);
    const payloadSha256 = createHash('sha256').update(payloadBytes).digest('hex');
    expect(signature?.payload_sha256).toBe(payloadSha256);

    const publicKeyPem = await fs.readFile(PUBLIC_KEY, 'utf8');
    const publicKey = createPublicKey(publicKeyPem);
    const ok = cryptoVerify(null, payloadBytes, publicKey, Buffer.from(signature!.sig, 'base64'));
    expect(ok).toBe(true);
  });

  it('is deterministic under --deterministic', async () => {
    const bundleDir = path.join(FIXTURES, 'benign-skill');
    const policyPath = path.join(FIXTURES, 'policy-pass.yaml');

    const a = await generateReceipt(bundleDir, { policyPath, signingKeyPath: PRIVATE_KEY, deterministic: true });
    const b = await generateReceipt(bundleDir, { policyPath, signingKeyPath: PRIVATE_KEY, deterministic: true });

    expect(a).toEqual(b);
  });

  it('CLI writes signed receipt JSON to --out', async () => {
    const bundleDir = path.join(FIXTURES, 'benign-skill');
    const policyPath = path.join(FIXTURES, 'policy-pass.yaml');

    const tmpDir = await fs.mkdtemp(path.join(process.cwd(), 'test-tmp-'));

    try {
      const outPath = path.join(tmpDir, 'receipt.json');

      const code = await main([
        'node',
        'skillvault',
        'receipt',
        bundleDir,
        '--policy',
        policyPath,
        '--signing-key',
        PRIVATE_KEY,
        '--key-id',
        'fixture-ed25519',
        '--deterministic',
        '--out',
        outPath
      ]);

      expect(code).toBe(0);

      const raw = await fs.readFile(outPath, 'utf8');
      const parsed = JSON.parse(raw) as { bundle_sha256: string; created_at: string; signature?: { alg: string } };

      expect(parsed.created_at).toBe(DETERMINISTIC_CREATED_AT_ISO);
      expect(parsed.bundle_sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(parsed.signature?.alg).toBe('ed25519');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
