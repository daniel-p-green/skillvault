export const BENCH_CONTRACT_VERSION = '0.1' as const;
export type BenchContractVersion = typeof BENCH_CONTRACT_VERSION;
export const BENCH_RUN_CONTRACT_V1 = 'skillvault.bench.run.v1' as const;
export const BENCH_REPORT_CONTRACT_V1 = 'skillvault.bench.report.v1' as const;

export const BENCH_CONFIG_SCHEMA_V1 = 'skillvault.bench.config.v1' as const;

export const REQUIRED_BENCH_CONDITIONS = ['no_skill', 'curated_skill', 'self_generated_skill'] as const;
export type RequiredBenchConditionId = (typeof REQUIRED_BENCH_CONDITIONS)[number];

export type BenchErrorCategory =
  | 'none'
  | 'assertion_failed'
  | 'verification_failed'
  | 'timeout'
  | 'execution_error';

export interface BenchMetadata {
  suite?: string;
  model_label?: string;
  environment_label?: string;
}

export interface BenchExecutionConfig {
  retries: number;
  seed: number;
  deterministic: boolean;
}

export interface BenchConditionAdapterConfig {
  id: string;
  options?: Record<string, unknown>;
}

export interface BenchConditionConfig {
  id: string;
  bundle_path?: string;
  adapter?: BenchConditionAdapterConfig;
}

export type BenchTaskVerifierFunctionName = 'bundle_file_exists' | 'bundle_file_contains';

export interface BenchTaskVerifierFunctionConfig {
  type: 'function';
  function: BenchTaskVerifierFunctionName;
  args?: Record<string, unknown>;
}

export interface BenchTaskVerifierCommandConfig {
  type: 'command';
  command: string;
}

export type BenchTaskVerifierConfig = BenchTaskVerifierFunctionConfig | BenchTaskVerifierCommandConfig;

export interface BenchTaskConfig {
  id: string;
  domain: string;
  timeout_ms: number;
  verifier: BenchTaskVerifierConfig;
}

export interface BenchConfigV1 {
  schema: typeof BENCH_CONFIG_SCHEMA_V1;
  metadata: BenchMetadata;
  execution: BenchExecutionConfig;
  conditions: BenchConditionConfig[];
  tasks: BenchTaskConfig[];
}

export interface LoadedBenchConfig {
  config_path: string;
  config_dir: string;
  config: BenchConfigV1;
}

export interface BenchConditionRef {
  id: string;
  bundle_path?: string;
  adapter_id?: string;
}

export interface BenchTaskRef {
  id: string;
  domain: string;
  timeout_ms: number;
  verifier: {
    type: BenchTaskVerifierConfig['type'];
    label: string;
  };
}

export interface BenchTaskResult {
  condition_id: string;
  task_id: string;
  passed: boolean;
  duration_ms: number;
  attempts: number;
  exit_code: number | null;
  error_category: BenchErrorCategory | string;
  error_message?: string;
  stdout_excerpt?: string;
  stderr_excerpt?: string;
}

export interface BenchConfidence95 {
  method: 'wilson';
  low: number;
  high: number;
}

export interface BenchConditionAggregate {
  condition_id: string;
  sample_count: number;
  pass_count: number;
  fail_count: number;
  pass_rate: number;
  avg_duration_ms: number;
  confidence_95: BenchConfidence95;
}

export interface BenchDeltaMetric {
  baseline_condition_id: string;
  target_condition_id: string;
  sample_count: number;
  pass_count_delta: number;
  pass_rate_delta: number;
  avg_duration_ms_delta: number;
}

export interface BenchRunMetadata {
  config_path: string;
  git_commit: string | null;
  deterministic: boolean;
  seed: number;
  retries: number;
  metadata: BenchMetadata;
}

export interface BenchRunOutput {
  contract_version: BenchContractVersion;
  contract_id: typeof BENCH_RUN_CONTRACT_V1;
  created_at: string;
  run: BenchRunMetadata;
  conditions: BenchConditionRef[];
  tasks: BenchTaskRef[];
  results: BenchTaskResult[];
  aggregates: Record<string, BenchConditionAggregate>;
  deltas: {
    curated_vs_no_skill: BenchDeltaMetric | null;
    self_generated_vs_no_skill: BenchDeltaMetric | null;
  };
  error_breakdown: Record<string, Record<string, number>>;
}

export interface BenchReportOutput {
  contract_version: BenchContractVersion;
  contract_id: typeof BENCH_REPORT_CONTRACT_V1;
  created_at: string;
  source_created_at: string;
  deterministic: boolean;
  aggregates: Record<string, BenchConditionAggregate>;
  deltas: BenchRunOutput['deltas'];
  error_breakdown: Record<string, Record<string, number>>;
}
