import { CONTRACT_VERSION } from '../contracts.js';
import { createdAtIso } from '../util/determinism.js';
import { BENCH_REPORT_CONTRACT_V1 } from './types.js';
import type { BenchConditionAggregate, BenchReportOutput, BenchRunOutput } from './types.js';

function conditionOrder(run: BenchRunOutput): string[] {
  return run.conditions.map((condition) => condition.id);
}

function formatRate(value: number): string {
  return value.toFixed(4);
}

function formatDelta(value: number): string {
  return value >= 0 ? `+${value.toFixed(4)}` : value.toFixed(4);
}

function renderAggregateRows(
  aggregates: Record<string, BenchConditionAggregate>,
  orderedConditionIds: string[]
): string[] {
  const rows: string[] = [];
  rows.push('condition | pass_rate | pass/total | avg_duration_ms | ci95_low | ci95_high');
  for (const conditionId of orderedConditionIds) {
    const aggregate = aggregates[conditionId];
    if (!aggregate) continue;
    rows.push(
      `${conditionId} | ${formatRate(aggregate.pass_rate)} | ${aggregate.pass_count}/${aggregate.sample_count} | ${aggregate.avg_duration_ms.toFixed(3)} | ${formatRate(aggregate.confidence_95.low)} | ${formatRate(aggregate.confidence_95.high)}`
    );
  }
  return rows;
}

function renderDeltaRows(deltas: BenchRunOutput['deltas']): string[] {
  const rows: string[] = [];
  rows.push('comparison | pass_rate_delta | pass_count_delta | avg_duration_ms_delta');

  const comparisons: Array<{ label: string; data: BenchRunOutput['deltas'][keyof BenchRunOutput['deltas']] }> = [
    { label: 'curated_vs_no_skill', data: deltas.curated_vs_no_skill },
    { label: 'self_generated_vs_no_skill', data: deltas.self_generated_vs_no_skill }
  ];

  for (const comparison of comparisons) {
    if (!comparison.data) {
      rows.push(`${comparison.label} | n/a | n/a | n/a`);
      continue;
    }
    rows.push(
      `${comparison.label} | ${formatDelta(comparison.data.pass_rate_delta)} | ${comparison.data.pass_count_delta >= 0 ? '+' : ''}${comparison.data.pass_count_delta} | ${comparison.data.avg_duration_ms_delta >= 0 ? '+' : ''}${comparison.data.avg_duration_ms_delta.toFixed(3)}`
    );
  }

  return rows;
}

function renderErrorBreakdownRows(
  errorBreakdown: Record<string, Record<string, number>>,
  orderedConditionIds: string[]
): string[] {
  const rows: string[] = [];
  rows.push('condition | error_category | count');

  let hasRows = false;
  for (const conditionId of orderedConditionIds) {
    const categories = errorBreakdown[conditionId] ?? {};
    const keys = Object.keys(categories);
    if (keys.length === 0) {
      rows.push(`${conditionId} | none | 0`);
      hasRows = true;
      continue;
    }
    for (const key of keys) {
      rows.push(`${conditionId} | ${key} | ${categories[key]}`);
      hasRows = true;
    }
  }

  if (!hasRows) {
    rows.push('none | none | 0');
  }

  return rows;
}

export function renderBenchRunTable(run: BenchRunOutput): string {
  const lines: string[] = [];
  lines.push(`benchmark_created_at: ${run.created_at}`);
  lines.push(`config_path: ${run.run.config_path}`);
  lines.push(`git_commit: ${run.run.git_commit ?? '-'}`);
  lines.push(`deterministic: ${run.run.deterministic}`);
  lines.push(`seed: ${run.run.seed}`);
  lines.push(`retries: ${run.run.retries}`);
  lines.push(`tasks: ${run.tasks.length}`);
  lines.push(`conditions: ${run.conditions.map((condition) => condition.id).join(', ')}`);
  lines.push('');
  lines.push(...renderAggregateRows(run.aggregates, conditionOrder(run)));
  lines.push('');
  lines.push(...renderDeltaRows(run.deltas));
  lines.push('');
  lines.push(...renderErrorBreakdownRows(run.error_breakdown, conditionOrder(run)));
  return `${lines.join('\n')}\n`;
}

export function buildBenchReport(run: BenchRunOutput): BenchReportOutput {
  return {
    contract_version: CONTRACT_VERSION,
    contract_id: BENCH_REPORT_CONTRACT_V1,
    created_at: createdAtIso(run.run.deterministic),
    source_created_at: run.created_at,
    deterministic: run.run.deterministic,
    aggregates: run.aggregates,
    deltas: run.deltas,
    error_breakdown: run.error_breakdown
  };
}

export function renderBenchReportTable(
  report: BenchReportOutput,
  orderedConditionIds: string[]
): string {
  const lines: string[] = [];
  lines.push(`report_created_at: ${report.created_at}`);
  lines.push(`source_created_at: ${report.source_created_at}`);
  lines.push(`deterministic: ${report.deterministic}`);
  lines.push('');
  lines.push(...renderAggregateRows(report.aggregates, orderedConditionIds));
  lines.push('');
  lines.push(...renderDeltaRows(report.deltas));
  lines.push('');
  lines.push(...renderErrorBreakdownRows(report.error_breakdown, orderedConditionIds));
  return `${lines.join('\n')}\n`;
}

export function parseBenchRunOutput(raw: string): BenchRunOutput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (err) {
    throw new Error(`Failed to parse benchmark result JSON: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Benchmark result JSON must be an object');
  }

  const asRecord = parsed as Record<string, unknown>;
  if (asRecord.contract_id !== 'skillvault.bench.run.v1') {
    throw new Error('Unsupported benchmark result contract_id');
  }

  if (!Array.isArray(asRecord.conditions) || !Array.isArray(asRecord.tasks) || !Array.isArray(asRecord.results)) {
    throw new Error('Benchmark result JSON is missing required arrays (conditions/tasks/results)');
  }

  return parsed as BenchRunOutput;
}
