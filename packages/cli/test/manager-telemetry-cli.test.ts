import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { main } from '../src/cli.js';

const FIXTURES = path.resolve(process.cwd(), 'test', 'fixtures');

async function readJsonFile<T>(inputPath: string): Promise<T> {
  const raw = await fs.readFile(inputPath, 'utf8');
  return JSON.parse(raw) as T;
}

describe('skillvault manager telemetry CLI', () => {
  it('shows telemetry status and flushes pending events to jsonl', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skillvault-manager-telemetry-cli-'));
    const importOut = path.join(root, 'import.json');
    const statusOut = path.join(root, 'telemetry-status.json');
    const flushOut = path.join(root, 'telemetry-flush.json');
    const statusAfterOut = path.join(root, 'telemetry-status-after.json');

    try {
      const initCode = await main([
        'node', 'skillvault', 'manager', 'init',
        '--root', root
      ]);
      expect(initCode).toBe(0);

      const importCode = await main([
        'node', 'skillvault', 'manager', 'import',
        path.join(FIXTURES, 'benign-skill'),
        '--root', root,
        '--out', importOut
      ]);
      expect(importCode).toBe(0);

      const statusCode = await main([
        'node', 'skillvault', 'manager', 'telemetry', 'status',
        '--root', root,
        '--out', statusOut
      ]);
      expect(statusCode).toBe(0);
      const status = await readJsonFile<{ totals: { pending: number; total: number } }>(statusOut);
      expect(status.totals.total).toBeGreaterThan(0);
      expect(status.totals.pending).toBeGreaterThan(0);

      const flushCode = await main([
        'node', 'skillvault', 'manager', 'telemetry', 'flush',
        '--target', 'jsonl',
        '--root', root,
        '--out', flushOut
      ]);
      expect(flushCode).toBe(0);
      const flush = await readJsonFile<{ sent: number; outputPath?: string }>(flushOut);
      expect(flush.sent).toBeGreaterThan(0);
      expect(typeof flush.outputPath).toBe('string');
      expect(await fs.stat(String(flush.outputPath))).toBeTruthy();

      const statusAfterCode = await main([
        'node', 'skillvault', 'manager', 'telemetry', 'status',
        '--root', root,
        '--out', statusAfterOut
      ]);
      expect(statusAfterCode).toBe(0);
      const statusAfter = await readJsonFile<{ totals: { pending: number; sent: number } }>(statusAfterOut);
      expect(statusAfter.totals.pending).toBe(0);
      expect(statusAfter.totals.sent).toBeGreaterThan(0);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

