import { describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';

import { main } from '../src/cli.js';
import { generateReceipt } from '../src/lib/receipt.js';
import { DETERMINISTIC_CREATED_AT_ISO } from '../src/lib/time.js';

const FIXTURES = path.resolve(process.cwd(), 'test', 'fixtures');

async function readJson(p: string): Promise<any> {
  const raw = await fs.readFile(p, 'utf8');
  return JSON.parse(raw) as any;
}

describe('skillvault gate', () => {
  it('evaluates policy using receipt data without reading bundle contents', async () => {
    const policyPath = path.join(FIXTURES, 'policy-pass.yaml');

    const tmpDir = await fs.mkdtemp(path.join(process.cwd(), 'test-tmp-'));

    try {
      // Work from a temp copy so we can delete it without touching git fixtures.
      const bundleSrc = path.join(FIXTURES, 'benign-skill');
      const bundleDir = path.join(tmpDir, 'bundle');
      await fs.cp(bundleSrc, bundleDir, { recursive: true });

      const receipt = await generateReceipt(bundleDir, { policyPath, deterministic: true });

      const receiptPath = path.join(tmpDir, 'receipt.json');
      await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8');

      // Delete the bundle directory to prove gate --receipt doesn't try to read it.
      await fs.rm(bundleDir, { recursive: true, force: true });

      const outPath = path.join(tmpDir, 'gate.json');

      const code = await main([
        'node',
        'skillvault',
        'gate',
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
      expect(report.verdict).toBe('PASS');
      expect(report.findings).toEqual([]);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('scans then gates when given a bundle path', async () => {
    const bundleDir = path.join(FIXTURES, 'benign-skill');
    const policyPath = path.join(FIXTURES, 'policy-pass.yaml');

    const tmpDir = await fs.mkdtemp(path.join(process.cwd(), 'test-tmp-'));

    try {
      const outPath = path.join(tmpDir, 'gate.json');

      const code = await main([
        'node',
        'skillvault',
        'gate',
        bundleDir,
        '--policy',
        policyPath,
        '--deterministic',
        '--out',
        outPath
      ]);

      expect(code).toBe(0);

      const report = await readJson(outPath);
      expect(report.created_at).toBe(DETERMINISTIC_CREATED_AT_ISO);
      expect(report.verdict).toBe('PASS');
      expect(report.policy.verdict).toBe('PASS');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('fails when policy requires approval but none are present (v0.1 placeholder) via receipt gating', async () => {
    const bundleDir = path.join(FIXTURES, 'benign-skill');
    const policyPath = path.join(FIXTURES, 'policy-require-approval.yaml');

    const receipt = await generateReceipt(bundleDir, { policyPath: undefined, deterministic: true });
    receipt.scan.capabilities = ['network'] as any;

    const tmpDir = await fs.mkdtemp(path.join(process.cwd(), 'test-tmp-'));

    try {
      const receiptPath = path.join(tmpDir, 'receipt.json');
      await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8');

      const outPath = path.join(tmpDir, 'gate.json');

      const code = await main([
        'node',
        'skillvault',
        'gate',
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
      expect(report.verdict).toBe('FAIL');
      const codes = report.findings.map((f: any) => f.code).sort();
      expect(codes).toContain('REQUIRED_APPROVAL_MISSING');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
