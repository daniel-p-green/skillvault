import type {
  BenchConditionAggregate,
  BenchDeltaMetric,
  BenchRunOutput,
  BenchTaskResult
} from './types.js';

export interface BenchAggregationResult {
  aggregates: Record<string, BenchConditionAggregate>;
  deltas: BenchRunOutput['deltas'];
  error_breakdown: Record<string, Record<string, number>>;
}

function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function wilson95(passCount: number, sampleCount: number): BenchConditionAggregate['confidence_95'] {
  if (sampleCount <= 0) {
    return { method: 'wilson', low: 0, high: 0 };
  }

  const z = 1.96;
  const z2 = z * z;
  const phat = passCount / sampleCount;
  const denominator = 1 + (z2 / sampleCount);
  const center = (phat + (z2 / (2 * sampleCount))) / denominator;
  const margin = (
    z *
    Math.sqrt((phat * (1 - phat) / sampleCount) + (z2 / (4 * sampleCount * sampleCount)))
  ) / denominator;

  return {
    method: 'wilson',
    low: round(Math.max(0, center - margin), 4),
    high: round(Math.min(1, center + margin), 4)
  };
}

function buildDelta(
  baseline: BenchConditionAggregate | undefined,
  target: BenchConditionAggregate | undefined
): BenchDeltaMetric | null {
  if (!baseline || !target) return null;

  const baselineRate = baseline.sample_count === 0 ? 0 : baseline.pass_count / baseline.sample_count;
  const targetRate = target.sample_count === 0 ? 0 : target.pass_count / target.sample_count;

  return {
    baseline_condition_id: baseline.condition_id,
    target_condition_id: target.condition_id,
    sample_count: Math.min(baseline.sample_count, target.sample_count),
    pass_count_delta: target.pass_count - baseline.pass_count,
    pass_rate_delta: round(targetRate - baselineRate, 4),
    avg_duration_ms_delta: round(target.avg_duration_ms - baseline.avg_duration_ms, 3)
  };
}

function sortedRecord(input: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of Object.keys(input).sort()) {
    out[key] = input[key];
  }
  return out;
}

export function aggregateBenchResults(
  results: BenchTaskResult[],
  conditionIdsInOrder: string[]
): BenchAggregationResult {
  const grouped = new Map<string, BenchTaskResult[]>();
  for (const result of results) {
    const existing = grouped.get(result.condition_id);
    if (existing) {
      existing.push(result);
    } else {
      grouped.set(result.condition_id, [result]);
    }
  }

  const aggregates: Record<string, BenchConditionAggregate> = {};
  const errorBreakdown: Record<string, Record<string, number>> = {};

  for (const conditionId of conditionIdsInOrder) {
    const rows = grouped.get(conditionId) ?? [];
    const sampleCount = rows.length;
    const passCount = rows.filter((row) => row.passed).length;
    const failCount = sampleCount - passCount;
    const durationSum = rows.reduce((sum, row) => sum + row.duration_ms, 0);
    const passRate = sampleCount === 0 ? 0 : round(passCount / sampleCount, 4);
    const avgDuration = sampleCount === 0 ? 0 : round(durationSum / sampleCount, 3);

    aggregates[conditionId] = {
      condition_id: conditionId,
      sample_count: sampleCount,
      pass_count: passCount,
      fail_count: failCount,
      pass_rate: passRate,
      avg_duration_ms: avgDuration,
      confidence_95: wilson95(passCount, sampleCount)
    };

    const errorCounts: Record<string, number> = {};
    for (const row of rows) {
      if (row.error_category === 'none') continue;
      errorCounts[row.error_category] = (errorCounts[row.error_category] ?? 0) + 1;
    }
    errorBreakdown[conditionId] = sortedRecord(errorCounts);
  }

  return {
    aggregates,
    deltas: {
      curated_vs_no_skill: buildDelta(aggregates.no_skill, aggregates.curated_skill),
      self_generated_vs_no_skill: buildDelta(aggregates.no_skill, aggregates.self_generated_skill)
    },
    error_breakdown: errorBreakdown
  };
}
