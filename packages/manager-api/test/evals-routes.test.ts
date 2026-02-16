import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createServer } from '../src/server.js';

describe('manager api eval routes', () => {
  it('seeds datasets and runs evals via API', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skillvault-manager-api-evals-'));
    const app = createServer({ rootDir: root });
    try {
      const seedResponse = await app.inject({
        method: 'POST',
        url: '/evals/datasets/seed',
        payload: {}
      });
      expect(seedResponse.statusCode).toBe(200);
      const seed = seedResponse.json() as { datasetId: string };

      const datasetsResponse = await app.inject({ method: 'GET', url: '/evals/datasets' });
      expect(datasetsResponse.statusCode).toBe(200);
      const datasets = datasetsResponse.json() as { datasets: Array<{ id: string }> };
      expect(datasets.datasets.some((dataset) => dataset.id === seed.datasetId)).toBe(true);

      const runResponse = await app.inject({
        method: 'POST',
        url: '/evals/runs',
        payload: { datasetId: seed.datasetId }
      });
      expect(runResponse.statusCode).toBe(200);
      const run = runResponse.json() as { run: { id: string; datasetId: string } };
      expect(run.run.datasetId).toBe(seed.datasetId);

      const runGetResponse = await app.inject({
        method: 'GET',
        url: `/evals/runs/${run.run.id}`
      });
      expect(runGetResponse.statusCode).toBe(200);
      const fetchedRun = runGetResponse.json() as { run: { id: string } };
      expect(fetchedRun.run.id).toBe(run.run.id);
    } finally {
      await app.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

