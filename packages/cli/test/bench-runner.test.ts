import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadBenchConfig } from '../src/bench/config.js';
import { runBenchSuite } from '../src/bench/runner.js';
import type { LoadedBenchConfig } from '../src/bench/types.js';

const EXAMPLE_CONFIG = path.resolve(process.cwd(), 'examples', 'bench-v0', 'bench.yaml');

describe('benchmark runner', () => {
  it('produces deterministic outputs for the same config when deterministic mode is enabled', async () => {
    const loaded = await loadBenchConfig(EXAMPLE_CONFIG);

    const runOne = await runBenchSuite(loaded, { deterministicOverride: true });
    const runTwo = await runBenchSuite(loaded, { deterministicOverride: true });

    expect(JSON.stringify(runTwo)).toBe(JSON.stringify(runOne));
    expect(runOne.aggregates.no_skill?.pass_count).toBe(1);
    expect(runOne.aggregates.curated_skill?.pass_count).toBe(3);
    expect(runOne.aggregates.self_generated_skill?.pass_count).toBe(2);
    expect(runOne.error_breakdown.no_skill?.assertion_failed).toBe(2);
  });

  it('retries failing command verifiers up to the configured retry budget', async () => {
    const loaded: LoadedBenchConfig = {
      config_path: '/tmp/bench.yaml',
      config_dir: process.cwd(),
      config: {
        schema: 'skillvault.bench.config.v1',
        metadata: {},
        execution: {
          deterministic: true,
          retries: 1,
          seed: 0
        },
        conditions: [
          { id: 'no_skill' },
          { id: 'curated_skill' },
          { id: 'self_generated_skill', adapter: { id: 'stub', options: { bundle_path: './examples/bench-v0/conditions/self-generated-skill' } } }
        ],
        tasks: [
          {
            id: 'retry-once',
            domain: 'runner',
            timeout_ms: 1000,
            verifier: {
              type: 'command',
              command: "node -e \"process.exit(process.env.SKILLVAULT_BENCH_ATTEMPT === '1' ? 1 : 0)\""
            }
          }
        ]
      }
    };

    const run = await runBenchSuite(loaded, { deterministicOverride: true });
    expect(run.results).toHaveLength(3);
    for (const result of run.results) {
      expect(result.passed).toBe(true);
      expect(result.attempts).toBe(2);
      expect(result.error_category).toBe('none');
    }
  });
});
