import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SkillVaultManager } from '../src/services/manager.js';

describe('eval harness', () => {
  it('seeds datasets, runs evaluations, and compares against baseline', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skillvault-evals-'));
    const manager = new SkillVaultManager(root);
    try {
      await manager.init();
      const seed = await manager.seedEvalDataset();
      expect(seed.caseCount).toBeGreaterThan(0);

      const datasets = manager.listEvalDatasets();
      expect(datasets.some((dataset) => dataset.id === seed.datasetId)).toBe(true);

      const firstRun = await manager.runEval({ datasetId: seed.datasetId });
      expect(firstRun.run.status).toBe('completed');
      expect(firstRun.results.length).toBe(seed.caseCount);
      expect(firstRun.regressionFailed).toBe(false);

      manager.db.db.prepare(`
        UPDATE eval_cases
        SET expected_json = '{"min": 10000}'
        WHERE dataset_id = ? AND case_key = 'adapters_available'
      `).run(seed.datasetId);

      const secondRun = await manager.runEval({
        datasetId: seed.datasetId,
        baselineRunId: firstRun.run.id,
        failOnRegression: true
      });
      expect(secondRun.comparison?.baselineRunId).toBe(firstRun.run.id);
      expect(secondRun.comparison?.regressed).toBe(true);
      expect(secondRun.regressionFailed).toBe(true);

      const compared = await manager.compareEvalRun(secondRun.run.id);
      expect(compared.baselineRunId).toBe(firstRun.run.id);
      expect(compared.regressed).toBe(true);
    } finally {
      await manager.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

