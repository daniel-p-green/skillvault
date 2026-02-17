import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SkillVaultManager } from '../src/services/manager.js';
import { BenchServiceError } from '../src/services/benchService.js';

describe('bench service', () => {
  it('discovers configs, executes runs, and persists file-backed run history', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skillvault-bench-service-'));
    const manager = new SkillVaultManager(root);
    try {
      await manager.init();

      const benchDir = path.join(root, 'bench');
      const noSkillDir = path.join(benchDir, 'conditions', 'no-skill');
      const curatedDir = path.join(benchDir, 'conditions', 'curated');
      const selfGeneratedDir = path.join(benchDir, 'conditions', 'self');
      await fs.mkdir(noSkillDir, { recursive: true });
      await fs.mkdir(curatedDir, { recursive: true });
      await fs.mkdir(selfGeneratedDir, { recursive: true });

      await fs.writeFile(path.join(noSkillDir, 'answer.txt'), 'baseline output', 'utf8');
      await fs.writeFile(path.join(curatedDir, 'answer.txt'), 'output with guardrails and receipt', 'utf8');
      await fs.writeFile(path.join(selfGeneratedDir, 'answer.txt'), 'output with guardrails only', 'utf8');

      const configPath = path.join(benchDir, 'suite.yaml');
      await fs.writeFile(
        configPath,
        [
          'schema: skillvault.bench.config.v1',
          'metadata:',
          '  suite: manager-core-test',
          'execution:',
          '  deterministic: true',
          '  retries: 0',
          '  seed: 7',
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
          '        path: answer.txt',
          '  - id: has_receipt',
          '    domain: trust',
          '    timeout_ms: 1000',
          '    verifier:',
          '      type: function',
          '      function: bundle_file_contains',
          '      args:',
          '        path: answer.txt',
          '        contains: receipt'
        ].join('\n'),
        'utf8'
      );

      const configs = await manager.listBenchConfigs();
      expect(configs.some((entry) => entry.path === configPath)).toBe(true);

      const started = await manager.runBench({ configPath: 'bench/suite.yaml' });
      expect(started.saved).toBe(true);
      expect(started.run.contract_id).toBe('skillvault.bench.run.v1');
      expect(started.report.contract_id).toBe('skillvault.bench.report.v1');

      const stat = await fs.stat(started.runPath);
      expect(stat.isFile()).toBe(true);

      const runs = await manager.listBenchRuns(10);
      expect(runs.length).toBeGreaterThanOrEqual(1);
      expect(runs[0]?.runId).toBe(started.runId);

      const fetchedRun = await manager.getBenchRun(started.runId);
      expect(fetchedRun.contract_id).toBe('skillvault.bench.run.v1');

      const fetchedReport = await manager.getBenchReport(started.runId);
      expect(fetchedReport.contract_id).toBe('skillvault.bench.report.v1');
    } finally {
      await manager.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('rejects non-local config paths with stable error metadata', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skillvault-bench-service-error-'));
    const manager = new SkillVaultManager(root);
    try {
      await manager.init();
      let error: unknown;
      try {
        await manager.runBench({ configPath: 'https://example.com/bench.yaml' });
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(BenchServiceError);
      const benchError = error as BenchServiceError;
      expect(benchError.code).toBe('BENCH_CONFIG_PATH_INVALID');
    } finally {
      await manager.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
