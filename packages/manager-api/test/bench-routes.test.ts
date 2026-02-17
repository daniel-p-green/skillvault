import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createServer } from '../src/server.js';

describe('manager api bench routes', () => {
  it('lists configs, runs benchmarks, and serves run/report payloads', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skillvault-manager-api-bench-'));
    const app = createServer({ rootDir: root });
    try {
      const benchDir = path.join(root, 'bench');
      const noSkillDir = path.join(benchDir, 'conditions', 'no-skill');
      const curatedDir = path.join(benchDir, 'conditions', 'curated');
      const selfGeneratedDir = path.join(benchDir, 'conditions', 'self');
      await fs.mkdir(noSkillDir, { recursive: true });
      await fs.mkdir(curatedDir, { recursive: true });
      await fs.mkdir(selfGeneratedDir, { recursive: true });

      await fs.writeFile(path.join(noSkillDir, 'answer.txt'), 'baseline output', 'utf8');
      await fs.writeFile(path.join(curatedDir, 'answer.txt'), 'guardrails and receipt', 'utf8');
      await fs.writeFile(path.join(selfGeneratedDir, 'answer.txt'), 'guardrails', 'utf8');

      const configPath = path.join(benchDir, 'api-suite.yaml');
      await fs.writeFile(
        configPath,
        [
          'schema: skillvault.bench.config.v1',
          'execution:',
          '  deterministic: true',
          '  retries: 0',
          '  seed: 1',
          'conditions:',
          '  - id: no_skill',
          '    bundle_path: ./conditions/no-skill',
          '  - id: curated_skill',
          '    bundle_path: ./conditions/curated',
          '  - id: self_generated_skill',
          '    adapter:',
          '      id: stub',
          '      options:',
          '        bundle_path: ./conditions/self',
          'tasks:',
          '  - id: has_answer',
          '    domain: quality',
          '    timeout_ms: 1000',
          '    verifier:',
          '      type: function',
          '      function: bundle_file_exists',
          '      args:',
          '        path: answer.txt'
        ].join('\n'),
        'utf8'
      );

      const configsResponse = await app.inject({ method: 'GET', url: '/bench/configs' });
      expect(configsResponse.statusCode).toBe(200);
      const configs = configsResponse.json() as { configs: Array<{ path: string }> };
      expect(configs.configs.some((entry) => entry.path === configPath)).toBe(true);

      const runResponse = await app.inject({
        method: 'POST',
        url: '/bench/runs',
        payload: { configPath: 'bench/api-suite.yaml', deterministic: true, save: true }
      });
      expect(runResponse.statusCode).toBe(200);
      const runBody = runResponse.json() as {
        runId: string;
        runPath: string;
        run: { contract_id: string };
        report: { contract_id: string };
      };
      expect(runBody.run.contract_id).toBe('skillvault.bench.run.v1');
      expect(runBody.report.contract_id).toBe('skillvault.bench.report.v1');
      expect(runBody.runId.length).toBeGreaterThan(0);
      expect(runBody.runPath.endsWith('.json')).toBe(true);

      const runsResponse = await app.inject({ method: 'GET', url: '/bench/runs?limit=5' });
      expect(runsResponse.statusCode).toBe(200);
      const runsBody = runsResponse.json() as { runs: Array<{ runId: string }> };
      expect(runsBody.runs.some((entry) => entry.runId === runBody.runId)).toBe(true);

      const runGetResponse = await app.inject({ method: 'GET', url: `/bench/runs/${runBody.runId}` });
      expect(runGetResponse.statusCode).toBe(200);
      const fetchedRun = runGetResponse.json() as { contract_id: string };
      expect(fetchedRun.contract_id).toBe('skillvault.bench.run.v1');

      const reportGetResponse = await app.inject({ method: 'GET', url: `/bench/runs/${runBody.runId}/report` });
      expect(reportGetResponse.statusCode).toBe(200);
      const fetchedReport = reportGetResponse.json() as { contract_id: string };
      expect(fetchedReport.contract_id).toBe('skillvault.bench.report.v1');

      const invalidConfigResponse = await app.inject({
        method: 'POST',
        url: '/bench/runs',
        payload: { configPath: 'https://example.com/bench.yaml' }
      });
      expect(invalidConfigResponse.statusCode).toBe(400);
      const invalidBody = invalidConfigResponse.json() as { code: string };
      expect(invalidBody.code).toBe('BENCH_CONFIG_PATH_INVALID');
    } finally {
      await app.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
