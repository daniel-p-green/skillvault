import { describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';

import { main } from '../src/cli.js';
import { generateReceipt } from '../src/lib/receipt.js';
import { DETERMINISTIC_CREATED_AT_ISO } from '../src/lib/time.js';

const FIXTURES = path.resolve(process.cwd(), 'test', 'fixtures');
const SIGNING_KEY = path.join(FIXTURES, 'keys', 'ed25519-private.pem');
const PUBLIC_KEY = path.join(FIXTURES, 'keys', 'ed25519-public.pem');

async function copyFixtureToTemp(name: string): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const src = path.join(FIXTURES, name);
  const tmpDir = await fs.mkdtemp(path.join(process.cwd(), 'test-tmp-'));
  const dst = path.join(tmpDir, name);
  await fs.cp(src, dst, { recursive: true });
  return { dir: dst, cleanup: () => fs.rm(tmpDir, { recursive: true, force: true }) };
}

async function readJson(p: string): Promise<any> {
  const raw = await fs.readFile(p, 'utf8');
  return JSON.parse(raw) as any;
}

describe('skillvault verify', () => {
  it('verifies an untampered bundle against a signed receipt (deterministic)', async () => {
    const bundleDir = path.join(FIXTURES, 'benign-skill');
    const policyPath = path.join(FIXTURES, 'policy-pass.yaml');

    const receipt = await generateReceipt(bundleDir, {
      policyPath,
      signingKeyPath: SIGNING_KEY,
      deterministic: true
    });

    const tmpDir = await fs.mkdtemp(path.join(process.cwd(), 'test-tmp-'));

    try {
      const receiptPath = path.join(tmpDir, 'receipt.json');
      await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8');

      const outPath = path.join(tmpDir, 'verify.json');

      const code = await main([
        'node',
        'skillvault',
        'verify',
        bundleDir,
        '--receipt',
        receiptPath,
        '--policy',
        policyPath,
        '--pubkey',
        PUBLIC_KEY,
        '--deterministic',
        '--out',
        outPath
      ]);

      expect(code).toBe(0);

      const report = await readJson(outPath);
      expect(report.created_at).toBe(DETERMINISTIC_CREATED_AT_ISO);
      expect(report.verified).toBe(true);
      expect(report.findings).toEqual([]);
      expect(report.policy.verdict).toBe('PASS');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('hard-fails with stable reason codes when bundle is tampered', async () => {
    const bundleDir = path.join(FIXTURES, 'benign-skill');
    const policyPath = path.join(FIXTURES, 'policy-pass.yaml');

    const receipt = await generateReceipt(bundleDir, {
      policyPath,
      signingKeyPath: SIGNING_KEY,
      deterministic: true
    });

    const { dir: tamperedDir, cleanup } = await copyFixtureToTemp('benign-skill');

    const tmpDir = await fs.mkdtemp(path.join(process.cwd(), 'test-tmp-'));

    try {
      await fs.appendFile(path.join(tamperedDir, 'tool.js'), '\n// tampered\n', 'utf8');

      const receiptPath = path.join(tmpDir, 'receipt.json');
      await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8');

      const outPath = path.join(tmpDir, 'verify.json');

      const code = await main([
        'node',
        'skillvault',
        'verify',
        tamperedDir,
        '--receipt',
        receiptPath,
        '--policy',
        policyPath,
        '--pubkey',
        PUBLIC_KEY,
        '--deterministic',
        '--out',
        outPath
      ]);

      expect(code).toBe(1);

      const report = await readJson(outPath);
      expect(report.verified).toBe(false);

      const codes = report.findings.map((f: any) => f.code).sort();
      expect(codes).toContain('FILE_HASH_MISMATCH');
      expect(codes).toContain('BUNDLE_HASH_MISMATCH');
    } finally {
      await Promise.all([
        fs.rm(tmpDir, { recursive: true, force: true }),
        cleanup()
      ]);
    }
  });

  it('hard-fails with SIGNATURE_INVALID when receipt payload is tampered', async () => {
    const bundleDir = path.join(FIXTURES, 'benign-skill');
    const policyPath = path.join(FIXTURES, 'policy-pass.yaml');

    const receipt = await generateReceipt(bundleDir, {
      policyPath,
      signingKeyPath: SIGNING_KEY,
      deterministic: true
    });

    const tmpDir = await fs.mkdtemp(path.join(process.cwd(), 'test-tmp-'));

    try {
      const tamperedReceipt = {
        ...receipt,
        policy: {
          ...receipt.policy,
          risk_score: {
            ...receipt.policy.risk_score,
            total: receipt.policy.risk_score.total + 1
          }
        }
      };

      const receiptPath = path.join(tmpDir, 'receipt.json');
      await fs.writeFile(receiptPath, JSON.stringify(tamperedReceipt, null, 2) + '\n', 'utf8');

      const outPath = path.join(tmpDir, 'verify.json');

      const code = await main([
        'node',
        'skillvault',
        'verify',
        bundleDir,
        '--receipt',
        receiptPath,
        '--policy',
        policyPath,
        '--pubkey',
        PUBLIC_KEY,
        '--deterministic',
        '--out',
        outPath
      ]);

      expect(code).toBe(1);

      const report = await readJson(outPath);
      const codes = report.findings.map((f: any) => f.code);
      expect(codes).toContain('SIGNATURE_INVALID');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('resolves key by key_id from --keyring directory', async () => {
    const bundleDir = path.join(FIXTURES, 'benign-skill');
    const policyPath = path.join(FIXTURES, 'policy-pass.yaml');

    const receipt = await generateReceipt(bundleDir, {
      policyPath,
      signingKeyPath: SIGNING_KEY,
      keyId: 'team-main',
      deterministic: true
    });

    const tmpDir = await fs.mkdtemp(path.join(process.cwd(), 'test-tmp-'));

    try {
      const keyringDir = path.join(tmpDir, 'keyring');
      await fs.mkdir(keyringDir, { recursive: true });
      await fs.copyFile(PUBLIC_KEY, path.join(keyringDir, 'team-main.pem'));

      const receiptPath = path.join(tmpDir, 'receipt.json');
      await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8');

      const outPath = path.join(tmpDir, 'verify.json');

      const code = await main([
        'node',
        'skillvault',
        'verify',
        bundleDir,
        '--receipt',
        receiptPath,
        '--policy',
        policyPath,
        '--keyring',
        keyringDir,
        '--deterministic',
        '--out',
        outPath
      ]);

      expect(code).toBe(0);
      const report = await readJson(outPath);
      expect(report.verified).toBe(true);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('fails when policy requires approval but none are present (v0.1 placeholder)', async () => {
    const bundleDir = path.join(FIXTURES, 'benign-skill');
    const policyPath = path.join(FIXTURES, 'policy-require-approval.yaml');

    const receipt = await generateReceipt(bundleDir, {
      policyPath: undefined,
      signingKeyPath: SIGNING_KEY,
      deterministic: true
    });
    receipt.scan.capabilities = ['network'] as any;

    const tmpDir = await fs.mkdtemp(path.join(process.cwd(), 'test-tmp-'));

    try {
      const receiptPath = path.join(tmpDir, 'receipt.json');
      await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8');

      const outPath = path.join(tmpDir, 'verify.json');

      const code = await main([
        'node',
        'skillvault',
        'verify',
        bundleDir,
        '--receipt',
        receiptPath,
        '--policy',
        policyPath,
        '--pubkey',
        PUBLIC_KEY,
        '--deterministic',
        '--out',
        outPath
      ]);

      expect(code).toBe(1);

      const report = await readJson(outPath);
      const codes = report.findings.map((f: any) => f.code).sort();
      expect(codes).toContain('REQUIRED_APPROVAL_MISSING');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('supports --format table for a readable summary', async () => {
    const bundleDir = path.join(FIXTURES, 'benign-skill');
    const policyPath = path.join(FIXTURES, 'policy-pass.yaml');

    const receipt = await generateReceipt(bundleDir, {
      policyPath,
      signingKeyPath: SIGNING_KEY,
      deterministic: true
    });

    const tmpDir = await fs.mkdtemp(path.join(process.cwd(), 'test-tmp-'));

    try {
      const receiptPath = path.join(tmpDir, 'receipt.json');
      await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8');

      const outPath = path.join(tmpDir, 'verify.txt');

      const code = await main([
        'node',
        'skillvault',
        'verify',
        bundleDir,
        '--receipt',
        receiptPath,
        '--policy',
        policyPath,
        '--pubkey',
        PUBLIC_KEY,
        '--deterministic',
        '--format',
        'table',
        '--out',
        outPath
      ]);

      expect(code).toBe(0);

      const raw = await fs.readFile(outPath, 'utf8');
      expect(raw).toMatch(/verified: YES/);
      expect(raw).toMatch(/verdict: PASS/);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
