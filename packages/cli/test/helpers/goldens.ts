import fs from 'node:fs/promises';
import path from 'node:path';

import { main } from '../../src/cli.js';

export const FIXTURES_DIR = path.resolve(process.cwd(), 'test', 'fixtures');
export const GOLDENS_DIR = path.resolve(process.cwd(), 'test', 'goldens');

export async function runCliToFile(args: string[], outPath: string): Promise<number> {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  return main(['node', 'skillvault', ...args, '--out', outPath]);
}

export function shouldRegenGoldens(): boolean {
  return process.env.REGEN_GOLDENS === '1';
}

export async function expectGolden(outPath: string, goldenPath: string): Promise<void> {
  const actual = await fs.readFile(outPath, 'utf8');

  if (shouldRegenGoldens()) {
    await fs.mkdir(path.dirname(goldenPath), { recursive: true });
    await fs.writeFile(goldenPath, actual, 'utf8');
    return;
  }

  const expected = await fs.readFile(goldenPath, 'utf8');
  if (actual !== expected) {
    // Print a minimal hint (full diff is too noisy).
    const hint = `Golden mismatch:\n  out: ${outPath}\n  golden: ${goldenPath}\n\nTo regenerate: REGEN_GOLDENS=1 npm test`;
    throw new Error(hint);
  }
}

export async function writeTmpFile(name: string): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(process.cwd(), 'test-tmp-'));
  return path.join(tmpDir, name);
}
