import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { main } from '../src/cli.js';

const EXAMPLE_CONFIG = path.resolve(process.cwd(), 'examples', 'bench-v0', 'bench.yaml');

describe('skillvault bench CLI', () => {
  it('runs benchmark suites and reports from saved JSON input', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skillvault-bench-cli-'));
    const runOut = path.join(tmpDir, 'bench-run.json');
    const reportOut = path.join(tmpDir, 'bench-report.txt');

    try {
      const runCode = await main([
        'node', 'skillvault', 'bench', 'run',
        '--config', EXAMPLE_CONFIG,
        '--format', 'table',
        '--out', runOut,
        '--deterministic'
      ]);
      expect(runCode).toBe(0);

      const run = JSON.parse(await fs.readFile(runOut, 'utf8')) as {
        contract_id: string;
        deltas: { curated_vs_no_skill: { pass_rate_delta: number } | null };
      };
      expect(run.contract_id).toBe('skillvault.bench.run.v1');
      expect(run.deltas.curated_vs_no_skill?.pass_rate_delta).toBeGreaterThan(0);

      const reportCode = await main([
        'node', 'skillvault', 'bench', 'report',
        '--input', runOut,
        '--format', 'table',
        '--out', reportOut
      ]);
      expect(reportCode).toBe(0);

      const table = await fs.readFile(reportOut, 'utf8');
      expect(table).toContain('comparison | pass_rate_delta | pass_count_delta | avg_duration_ms_delta');
      expect(table).toContain('curated_vs_no_skill');
      expect(table).toContain('self_generated_vs_no_skill');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
