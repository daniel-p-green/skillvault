import { describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';

import { main } from '../src/cli.js';
import { generateReceipt } from '../src/lib/receipt.js';
import { DETERMINISTIC_CREATED_AT_ISO } from '../src/lib/time.js';

const FIXTURES = path.resolve(process.cwd(), 'test', 'fixtures');

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
  it('verifies an untampered bundle against its receipt (deterministic)', async () => {
    const bundleDir = path.join(FIXTURES, 'benign-skill');
    const policyPath = path.join(FIXTURES, 'policy-pass.yaml');

    const receipt = await generateReceipt(bundleDir, { policyPath, deterministic: true });

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

  it('hard-fails with stable reason codes on tampering (hash mismatch)', async () => {
    const bundleDir = path.join(FIXTURES, 'benign-skill');
    const policyPath = path.join(FIXTURES, 'policy-pass.yaml');

    const receipt = await generateReceipt(bundleDir, { policyPath, deterministic: true });

    const { dir: tamperedDir, cleanup } = await copyFixtureToTemp('benign-skill');

    const tmpDir = await fs.mkdtemp(path.join(process.cwd(), 'test-tmp-'));

    try {
      // Tamper with tool.js
      await fs.appendFile(path.join(tamperedDir, 'tool.js'), "\n// tampered\n", 'utf8');

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

  it('fails when policy requires approval but none are present (v0.1 placeholder)', async () => {
    const bundleDir = path.join(FIXTURES, 'benign-skill');
    const policyPath = path.join(FIXTURES, 'policy-require-approval.yaml');

    // Start from a valid receipt, then inject a capability requiring approval.
    const receipt = await generateReceipt(bundleDir, { policyPath: undefined, deterministic: true });
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

    const receipt = await generateReceipt(bundleDir, { policyPath, deterministic: true });

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
