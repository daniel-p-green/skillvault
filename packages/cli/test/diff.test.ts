import { describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';

import { main } from '../src/cli.js';
import { DETERMINISTIC_CREATED_AT_ISO } from '../src/lib/time.js';

const FIXTURES = path.resolve(process.cwd(), 'test', 'fixtures');

async function copyFixtureToTmp(name: string): Promise<string> {
  const src = path.join(FIXTURES, name);
  const tmpDir = await fs.mkdtemp(path.join(process.cwd(), 'test-tmp-'));
  const dst = path.join(tmpDir, name);
  await fs.mkdir(dst, { recursive: true });

  const entries = await fs.readdir(src);
  for (const e of entries) {
    await fs.copyFile(path.join(src, e), path.join(dst, e));
  }

  return dst;
}

describe('skillvault diff', () => {
  it('diffs two bundles deterministically (file add/modify)', async () => {
    const aDir = await copyFixtureToTmp('benign-skill');
    const bDir = await copyFixtureToTmp('benign-skill');

    try {
      // Modify one file and add one file in b.
      await fs.writeFile(path.join(bDir, 'tool.js'), "export function hello() {\n  return 'hello-v2';\n}\n", 'utf8');
      await fs.writeFile(path.join(bDir, 'new.txt'), 'new file\n', 'utf8');

      const outDir = await fs.mkdtemp(path.join(process.cwd(), 'test-tmp-'));
      const outPath = path.join(outDir, 'diff.json');

      const code = await main(['node', 'skillvault', 'diff', '--a', aDir, '--b', bDir, '--deterministic', '--out', outPath]);
      expect(code).toBe(0);

      const raw = await fs.readFile(outPath, 'utf8');
      const diff = JSON.parse(raw) as any;

      expect(diff.contract_version).toBe('0.1');
      expect(diff.created_at).toBe(DETERMINISTIC_CREATED_AT_ISO);

      expect(diff.summary.added).toBe(1);
      expect(diff.summary.modified).toBe(1);
      expect(diff.summary.removed).toBe(0);

      const tool = diff.file_diffs.find((d: any) => d.path === 'tool.js');
      expect(tool.change).toBe('modified');
      const added = diff.file_diffs.find((d: any) => d.path === 'new.txt');
      expect(added.change).toBe('added');

      expect(diff.capability_deltas).toEqual({ added: [], removed: [] });
      expect(diff.finding_deltas).toEqual({ added: [], removed: [] });
    } finally {
      await fs.rm(path.dirname(aDir), { recursive: true, force: true });
      await fs.rm(path.dirname(bDir), { recursive: true, force: true });
    }
  });

  it('accepts receipt-vs-receipt inputs', async () => {
    const bundleDir = path.join(FIXTURES, 'benign-skill');
    const policyPath = path.join(FIXTURES, 'policy-pass.yaml');

    const tmpDir = await fs.mkdtemp(path.join(process.cwd(), 'test-tmp-'));

    try {
      const receiptA = path.join(tmpDir, 'a.json');
      const receiptB = path.join(tmpDir, 'b.json');
      const diffOut = path.join(tmpDir, 'diff.json');

      // Same bundle twice => diff should be all unchanged.
      const signingKey = path.join(FIXTURES, 'keys', 'ed25519-private.pem');
      await main([
        'node',
        'skillvault',
        'receipt',
        bundleDir,
        '--policy',
        policyPath,
        '--signing-key',
        signingKey,
        '--deterministic',
        '--out',
        receiptA
      ]);
      await main([
        'node',
        'skillvault',
        'receipt',
        bundleDir,
        '--policy',
        policyPath,
        '--signing-key',
        signingKey,
        '--deterministic',
        '--out',
        receiptB
      ]);

      const code = await main(['node', 'skillvault', 'diff', '--a', receiptA, '--b', receiptB, '--deterministic', '--out', diffOut]);
      expect(code).toBe(0);

      const raw = await fs.readFile(diffOut, 'utf8');
      const diff = JSON.parse(raw) as any;

      expect(diff.created_at).toBe(DETERMINISTIC_CREATED_AT_ISO);
      expect(diff.summary.modified).toBe(0);
      expect(diff.summary.added).toBe(0);
      expect(diff.summary.removed).toBe(0);
      expect(diff.summary.unchanged).toBeGreaterThanOrEqual(2);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('accepts bundle-vs-receipt inputs', async () => {
    const bundleDir = path.join(FIXTURES, 'benign-skill');
    const policyPath = path.join(FIXTURES, 'policy-pass.yaml');
    const signingKey = path.join(FIXTURES, 'keys', 'ed25519-private.pem');
    const tmpDir = await fs.mkdtemp(path.join(process.cwd(), 'test-tmp-'));

    try {
      const receiptPath = path.join(tmpDir, 'receipt.json');
      const outPath = path.join(tmpDir, 'diff.json');

      await main([
        'node',
        'skillvault',
        'receipt',
        bundleDir,
        '--policy',
        policyPath,
        '--signing-key',
        signingKey,
        '--deterministic',
        '--out',
        receiptPath
      ]);

      const code = await main([
        'node',
        'skillvault',
        'diff',
        '--a',
        bundleDir,
        '--b',
        receiptPath,
        '--policy',
        policyPath,
        '--deterministic',
        '--out',
        outPath
      ]);
      expect(code).toBe(0);

      const diff = JSON.parse(await fs.readFile(outPath, 'utf8')) as any;
      expect(diff.created_at).toBe(DETERMINISTIC_CREATED_AT_ISO);
      expect(diff.summary).toEqual({ added: 0, removed: 0, modified: 0, unchanged: diff.summary.unchanged });
      expect(diff.summary.unchanged).toBeGreaterThanOrEqual(2);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
