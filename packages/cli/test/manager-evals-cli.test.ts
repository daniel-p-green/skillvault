import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SkillVaultManager } from '@skillvault/manager-core';
import { main } from '../src/cli.js';

async function readJsonFile<T>(inputPath: string): Promise<T> {
  const raw = await fs.readFile(inputPath, 'utf8');
  return JSON.parse(raw) as T;
}

describe('skillvault manager eval CLI', () => {
  it('seeds datasets, runs evals, and enforces regression exit code when requested', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skillvault-manager-evals-cli-'));
    const seedOut = path.join(root, 'eval-seed.json');
    const runOneOut = path.join(root, 'eval-run-one.json');
    const runTwoOut = path.join(root, 'eval-run-two.json');
    const compareOut = path.join(root, 'eval-compare.json');

    try {
      const initCode = await main([
        'node', 'skillvault', 'manager', 'init',
        '--root', root
      ]);
      expect(initCode).toBe(0);

      const seedCode = await main([
        'node', 'skillvault', 'manager', 'eval', 'datasets', 'seed',
        '--root', root,
        '--out', seedOut
      ]);
      expect(seedCode).toBe(0);
      const seed = await readJsonFile<{ datasetId: string }>(seedOut);

      const runOneCode = await main([
        'node', 'skillvault', 'manager', 'eval', 'run',
        '--dataset', seed.datasetId,
        '--root', root,
        '--out', runOneOut
      ]);
      expect(runOneCode).toBe(0);
      const runOne = await readJsonFile<{ run: { id: string } }>(runOneOut);

      const manager = new SkillVaultManager(root);
      await manager.init();
      try {
        manager.db.db.prepare(`
          UPDATE eval_cases
          SET expected_json = '{"min": 10000}'
          WHERE dataset_id = ? AND case_key = 'adapters_available'
        `).run(seed.datasetId);
      } finally {
        await manager.close();
      }

      const runTwoCode = await main([
        'node', 'skillvault', 'manager', 'eval', 'run',
        '--dataset', seed.datasetId,
        '--baseline', runOne.run.id,
        '--fail-on-regression',
        '--root', root,
        '--out', runTwoOut
      ]);
      expect(runTwoCode).toBe(1);
      const runTwo = await readJsonFile<{ run: { id: string }; comparison?: { regressed: boolean } }>(runTwoOut);
      expect(runTwo.comparison?.regressed).toBe(true);

      const compareCode = await main([
        'node', 'skillvault', 'manager', 'eval', 'compare',
        '--run', runTwo.run.id,
        '--root', root,
        '--out', compareOut
      ]);
      expect(compareCode).toBe(0);
      const compared = await readJsonFile<{ regressed: boolean; baselineRunId: string }>(compareOut);
      expect(compared.regressed).toBe(true);
      expect(compared.baselineRunId).toBe(runOne.run.id);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

