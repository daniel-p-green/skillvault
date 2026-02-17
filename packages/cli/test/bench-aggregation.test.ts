import { describe, expect, it } from 'vitest';

import { aggregateBenchResults } from '../src/bench/aggregate.js';

describe('benchmark aggregation', () => {
  it('computes pass rates, deltas, and error breakdown by condition', () => {
    const aggregated = aggregateBenchResults(
      [
        { condition_id: 'no_skill', task_id: 'a', passed: true, duration_ms: 4, attempts: 1, exit_code: 0, error_category: 'none' },
        { condition_id: 'no_skill', task_id: 'b', passed: false, duration_ms: 7, attempts: 1, exit_code: 1, error_category: 'assertion_failed' },
        { condition_id: 'curated_skill', task_id: 'a', passed: true, duration_ms: 3, attempts: 1, exit_code: 0, error_category: 'none' },
        { condition_id: 'curated_skill', task_id: 'b', passed: true, duration_ms: 5, attempts: 1, exit_code: 0, error_category: 'none' },
        { condition_id: 'self_generated_skill', task_id: 'a', passed: true, duration_ms: 6, attempts: 1, exit_code: 0, error_category: 'none' },
        { condition_id: 'self_generated_skill', task_id: 'b', passed: false, duration_ms: 9, attempts: 1, exit_code: 1, error_category: 'verification_failed' }
      ],
      ['no_skill', 'curated_skill', 'self_generated_skill']
    );

    expect(aggregated.aggregates.no_skill?.pass_rate).toBe(0.5);
    expect(aggregated.aggregates.curated_skill?.pass_rate).toBe(1);
    expect(aggregated.aggregates.self_generated_skill?.pass_rate).toBe(0.5);

    expect(aggregated.deltas.curated_vs_no_skill?.pass_rate_delta).toBe(0.5);
    expect(aggregated.deltas.curated_vs_no_skill?.pass_count_delta).toBe(1);
    expect(aggregated.deltas.self_generated_vs_no_skill?.pass_rate_delta).toBe(0);

    expect(aggregated.error_breakdown.no_skill).toEqual({ assertion_failed: 1 });
    expect(aggregated.error_breakdown.curated_skill).toEqual({});
    expect(aggregated.error_breakdown.self_generated_skill).toEqual({ verification_failed: 1 });
  });
});
