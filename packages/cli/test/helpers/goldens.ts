import fs from 'node:fs/promises';
import path from 'node:path';

import { main } from '../../src/cli.js';

export const FIXTURES_DIR = path.resolve(process.cwd(), 'test', 'fixtures');
export const GOLDENS_DIR = path.resolve(process.cwd(), 'test', 'goldens');

export async function runCliToFile(args: string[], outPath: string): Promise<number> {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  return main(['node', 'skillvault', ...args, '--out', outPath]);
}

export async function expectGolden(outPath: string, goldenPath: string): Promise<void> {
  const [actual, expected] = await Promise.all([fs.readFile(outPath, 'utf8'), fs.readFile(goldenPath, 'utf8')]);
  if (actual !== expected) {
    // Print a minimal hint (full diff is too noisy).
    const hint = `Golden mismatch:\n  out: ${outPath}\n  golden: ${goldenPath}\n`;
    throw new Error(hint);
  }
}

export async function writeTmpFile(name: string): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(process.cwd(), 'test-tmp-'));
  return path.join(tmpDir, name);
}
