import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

import { expectGolden, shouldRegenGoldens } from './helpers/goldens.js';

async function writeTmp(dir: string, name: string, contents: string): Promise<string> {
  const p = path.join(dir, name);
  await fs.writeFile(p, contents, 'utf8');
  return p;
}

describe('golden harness', () => {
  it('does not regenerate by default', async () => {
    const prev = process.env.REGEN_GOLDENS;
    delete process.env.REGEN_GOLDENS;

    const tmpDir = await fs.mkdtemp(path.join(process.cwd(), 'test-tmp-'));
    try {
      const outPath = await writeTmp(tmpDir, 'out.json', '{"a":1}\n');
      const goldenPath = await writeTmp(tmpDir, 'golden.json', '{"a":2}\n');

      expect(shouldRegenGoldens()).toBe(false);
      await expect(expectGolden(outPath, goldenPath)).rejects.toThrow(/Golden mismatch/);

      // Golden file should remain unchanged.
      const goldenAfter = await fs.readFile(goldenPath, 'utf8');
      expect(goldenAfter).toBe('{"a":2}\n');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
      if (prev === undefined) delete process.env.REGEN_GOLDENS;
      else process.env.REGEN_GOLDENS = prev;
    }
  });

  it('regenerates when REGEN_GOLDENS=1', async () => {
    const prev = process.env.REGEN_GOLDENS;
    process.env.REGEN_GOLDENS = '1';

    const tmpDir = await fs.mkdtemp(path.join(process.cwd(), 'test-tmp-'));
    try {
      const outPath = await writeTmp(tmpDir, 'out.json', '{"a":3}\n');
      const goldenPath = await writeTmp(tmpDir, 'golden.json', '{"a":0}\n');

      expect(shouldRegenGoldens()).toBe(true);
      await expectGolden(outPath, goldenPath);

      const goldenAfter = await fs.readFile(goldenPath, 'utf8');
      expect(goldenAfter).toBe('{"a":3}\n');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
      if (prev === undefined) delete process.env.REGEN_GOLDENS;
      else process.env.REGEN_GOLDENS = prev;
    }
  });
});
