import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PageShell } from '../components/PageShell.js';
import { ApiRequestError, apiGet, apiPost } from '../services/http.js';

interface DatasetResponse {
  datasets: Array<{ id: string; name: string; description: string | null }>;
}

interface EvalRunResponse {
  run: {
    id: string;
    datasetId: string;
    score: number;
    status: string;
  };
  comparison?: {
    baselineRunId: string;
    delta: number;
    regressed: boolean;
  };
  regressionFailed: boolean;
}

interface BenchConfigEntry {
  id: string;
  name: string;
  path: string;
  source: string;
}

interface BenchConfigsResponse {
  configs: BenchConfigEntry[];
}

interface BenchRunListEntry {
  runId: string;
  runPath: string;
  configPath: string;
  label: string | null;
  createdAt: string;
  deterministic: boolean;
  gitCommit: string | null;
  conditionPassRates: Record<string, number>;
  deltas: {
    curated_vs_no_skill: number | null;
    self_generated_vs_no_skill: number | null;
  };
}

interface BenchRunsResponse {
  runs: BenchRunListEntry[];
}

interface BenchConditionAggregate {
  condition_id: string;
  sample_count: number;
  pass_count: number;
  fail_count: number;
  pass_rate: number;
  avg_duration_ms: number;
  confidence_95: {
    low: number;
    high: number;
  };
}

interface BenchDeltaMetric {
  baseline_condition_id: string;
  target_condition_id: string;
  sample_count: number;
  pass_count_delta: number;
  pass_rate_delta: number;
  avg_duration_ms_delta: number;
}

interface BenchRunOutput {
  contract_id: string;
  created_at: string;
  run: {
    config_path: string;
    git_commit: string | null;
    deterministic: boolean;
    seed: number;
    retries: number;
    metadata?: {
      suite?: string;
      model_label?: string;
      environment_label?: string;
    };
  };
  conditions: Array<{ id: string }>;
  aggregates: Record<string, BenchConditionAggregate>;
  deltas: {
    curated_vs_no_skill: BenchDeltaMetric | null;
    self_generated_vs_no_skill: BenchDeltaMetric | null;
  };
  error_breakdown: Record<string, Record<string, number>>;
}

interface BenchReportOutput {
  contract_id: string;
  created_at: string;
  source_created_at: string;
  deterministic: boolean;
  aggregates: Record<string, BenchConditionAggregate>;
  deltas: {
    curated_vs_no_skill: BenchDeltaMetric | null;
    self_generated_vs_no_skill: BenchDeltaMetric | null;
  };
  error_breakdown: Record<string, Record<string, number>>;
}

interface BenchRunResponse {
  runId: string;
  runPath: string;
  run: BenchRunOutput;
  report: BenchReportOutput;
}

interface ParsedApiError {
  message: string;
  code: string | null;
  remediation: string | null;
  hint: string | null;
}

function parseApiError(error: unknown): ParsedApiError {
  if (error instanceof ApiRequestError) {
    const payload = error.payload ?? {};
    const message =
      (typeof payload.message === 'string' && payload.message) ||
      (typeof payload.error === 'string' && payload.error) ||
      error.message;
    const code = typeof payload.code === 'string' ? payload.code : null;
    const remediation = typeof payload.remediation === 'string' ? payload.remediation : null;

    let hint: string | null = null;
    if (code === 'BENCH_CONFIG_PATH_INVALID') {
      hint = 'Use a workspace-local config path (for example `bench/example.yaml`). URL paths are rejected.';
    } else if (code === 'BENCH_CONFIG_NOT_FOUND') {
      hint = 'Confirm the config file exists in this repository and retry.';
    } else if (code === 'BENCH_RUN_NOT_FOUND') {
      hint = 'Refresh recent runs and select a run that still exists on disk.';
    }

    return { message, code, remediation, hint };
  }

  return {
    message: error instanceof Error ? error.message : String(error),
    code: null,
    remediation: null,
    hint: null
  };
}

function toPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function toSignedPercent(delta: number | null): string {
  if (delta === null) return 'n/a';
  const percent = (delta * 100).toFixed(1);
  return delta >= 0 ? `+${percent}%` : `${percent}%`;
}

function conditionSortKey(conditionId: string): string {
  if (conditionId === 'no_skill') return '0';
  if (conditionId === 'curated_skill') return '1';
  if (conditionId === 'self_generated_skill') return '2';
  return `9-${conditionId}`;
}

type EvalTab = 'regression' | 'benchmarks';

export function EvalsPage() {
  const [activeTab, setActiveTab] = useState<EvalTab>('regression');
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [baselineRunId, setBaselineRunId] = useState('');
  const [selectedBenchConfigPath, setSelectedBenchConfigPath] = useState('');
  const [manualBenchConfigPath, setManualBenchConfigPath] = useState('');
  const [benchRunLabel, setBenchRunLabel] = useState('');
  const [benchDeterministic, setBenchDeterministic] = useState(true);
  const [activeBenchRunId, setActiveBenchRunId] = useState<string | null>(null);
  const [activeBenchRun, setActiveBenchRun] = useState<BenchRunOutput | null>(null);
  const [activeBenchReport, setActiveBenchReport] = useState<BenchReportOutput | null>(null);
  const queryClient = useQueryClient();

  const datasetsQuery = useQuery({
    queryKey: ['eval-datasets'],
    queryFn: () => apiGet<DatasetResponse>('/evals/datasets')
  });

  const seedMutation = useMutation({
    mutationFn: () => apiPost<{ datasetId: string; caseCount: number }>('/evals/datasets/seed', {}),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['eval-datasets'] });
      setSelectedDatasetId(data.datasetId);
    }
  });

  const runMutation = useMutation({
    mutationFn: () => {
      if (!selectedDatasetId) {
        throw new Error('Select or seed a dataset before running eval.');
      }
      return apiPost<EvalRunResponse>('/evals/runs', {
        datasetId: selectedDatasetId,
        baselineRunId: baselineRunId || undefined,
        failOnRegression: false
      });
    }
  });

  const benchConfigsQuery = useQuery({
    queryKey: ['bench-configs'],
    enabled: activeTab === 'benchmarks',
    queryFn: () => apiGet<BenchConfigsResponse>('/bench/configs')
  });

  const benchRunsQuery = useQuery({
    queryKey: ['bench-runs'],
    enabled: activeTab === 'benchmarks',
    queryFn: () => apiGet<BenchRunsResponse>('/bench/runs?limit=25')
  });

  useEffect(() => {
    if (selectedBenchConfigPath) return;
    const first = benchConfigsQuery.data?.configs[0];
    if (first) {
      setSelectedBenchConfigPath(first.path);
    }
  }, [benchConfigsQuery.data, selectedBenchConfigPath]);

  const benchRunMutation = useMutation({
    mutationFn: async () => {
      const configPath = manualBenchConfigPath.trim() || selectedBenchConfigPath;
      if (!configPath) {
        throw new Error('Select a benchmark config or enter a manual config path.');
      }
      return apiPost<BenchRunResponse>('/bench/runs', {
        configPath,
        deterministic: benchDeterministic,
        save: true,
        label: benchRunLabel.trim() || undefined
      });
    },
    onSuccess: async (data) => {
      setActiveBenchRunId(data.runId);
      setActiveBenchRun(data.run);
      setActiveBenchReport(data.report);
      await queryClient.invalidateQueries({ queryKey: ['bench-runs'] });
    }
  });

  const openRunMutation = useMutation({
    mutationFn: (runId: string) => apiGet<BenchRunOutput>(`/bench/runs/${encodeURIComponent(runId)}`),
    onSuccess: (run, runId) => {
      setActiveBenchRunId(runId);
      setActiveBenchRun(run);
    }
  });

  const openReportMutation = useMutation({
    mutationFn: (runId: string) => apiGet<BenchReportOutput>(`/bench/runs/${encodeURIComponent(runId)}/report`),
    onSuccess: (report, runId) => {
      setActiveBenchRunId(runId);
      setActiveBenchReport(report);
    }
  });

  const datasets = datasetsQuery.data?.datasets ?? [];
  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === selectedDatasetId),
    [datasets, selectedDatasetId]
  );

  const benchmarkSource = activeBenchReport ?? activeBenchRun;
  const orderedConditionIds = useMemo(() => {
    if (activeBenchRun?.conditions?.length) {
      return activeBenchRun.conditions.map((condition) => condition.id);
    }
    if (!benchmarkSource) return [];
    return Object.keys(benchmarkSource.aggregates).sort((a, b) => {
      const left = conditionSortKey(a);
      const right = conditionSortKey(b);
      if (left === right) return a.localeCompare(b);
      return left.localeCompare(right);
    });
  }, [activeBenchRun, benchmarkSource]);

  const benchError = benchRunMutation.error
    ? parseApiError(benchRunMutation.error)
    : openRunMutation.error
      ? parseApiError(openRunMutation.error)
      : openReportMutation.error
        ? parseApiError(openReportMutation.error)
        : null;

  return (
    <PageShell
      title="Evals + Bench"
      subtitle="Validate skills with deterministic regression checks and benchmark deltas before controlled rollout."
    >
      <div className="row" role="tablist" aria-label="Evaluation views">
        <button
          type="button"
          className={`chip ${activeTab === 'regression' ? 'active' : ''}`}
          aria-pressed={activeTab === 'regression'}
          onClick={() => setActiveTab('regression')}
        >
          Regression Evals
        </button>
        <button
          type="button"
          className={`chip ${activeTab === 'benchmarks' ? 'active' : ''}`}
          aria-pressed={activeTab === 'benchmarks'}
          onClick={() => setActiveTab('benchmarks')}
        >
          Skill Benchmarks
        </button>
      </div>

      {activeTab === 'regression' ? (
        <>
          <div className="row">
            <button className="button secondary" type="button" onClick={() => seedMutation.mutate()}>
              {seedMutation.isPending ? 'Seeding...' : 'Seed Default Dataset'}
            </button>
            {seedMutation.data ? <span className="tag pass">Seeded {seedMutation.data.caseCount} cases</span> : null}
          </div>

          <div className="form-grid">
            <label className="field">
              Dataset
              <select className="select" value={selectedDatasetId} onChange={(event) => setSelectedDatasetId(event.target.value)}>
                <option value="">Select dataset</option>
                {datasets.map((dataset) => (
                  <option key={dataset.id} value={dataset.id}>{dataset.name}</option>
                ))}
              </select>
            </label>

            <label className="field">
              Baseline Run Id (Optional)
              <input
                className="input"
                value={baselineRunId}
                onChange={(event) => setBaselineRunId(event.target.value)}
                placeholder="previous-run-id"
              />
            </label>

            <button className="button" type="button" onClick={() => runMutation.mutate()}>
              {runMutation.isPending ? 'Running...' : 'Run Eval'}
            </button>
          </div>

          {selectedDataset ? (
            <div className="record-card">
              <h3>{selectedDataset.name}</h3>
              <p>{selectedDataset.description ?? 'No description provided.'}</p>
            </div>
          ) : null}

          {runMutation.data ? (
            <div className="record-card">
              <h3>Latest Run</h3>
              <p><strong>Run:</strong> <code>{runMutation.data.run.id}</code></p>
              <p><strong>Status:</strong> {runMutation.data.run.status}</p>
              <p><strong>Score:</strong> {runMutation.data.run.score}</p>
              {runMutation.data.comparison ? (
                <p>
                  <strong>Delta:</strong> {runMutation.data.comparison.delta} ({runMutation.data.comparison.regressed ? 'regressed' : 'improved'})
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {activeTab === 'benchmarks' ? (
        <>
          <div className="form-grid">
            <label className="field">
              Benchmark Config
              <select
                className="select"
                value={selectedBenchConfigPath}
                onChange={(event) => setSelectedBenchConfigPath(event.target.value)}
              >
                <option value="">Select discovered config</option>
                {(benchConfigsQuery.data?.configs ?? []).map((config) => (
                  <option key={config.id} value={config.path}>
                    {config.name} ({config.path})
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              Manual Config Path (optional override)
              <input
                className="input"
                value={manualBenchConfigPath}
                onChange={(event) => setManualBenchConfigPath(event.target.value)}
                placeholder="bench/my-suite.yaml"
              />
            </label>

            <label className="field">
              Run Label (optional)
              <input
                className="input"
                value={benchRunLabel}
                onChange={(event) => setBenchRunLabel(event.target.value)}
                placeholder="nightly-baseline"
              />
            </label>

            <label className="toggle-row">
              <input
                type="checkbox"
                checked={benchDeterministic}
                onChange={(event) => setBenchDeterministic(event.target.checked)}
              />
              Deterministic benchmark mode
            </label>

            <button
              className="button"
              type="button"
              onClick={() => benchRunMutation.mutate()}
              disabled={benchRunMutation.isPending}
            >
              {benchRunMutation.isPending ? 'Running benchmark...' : 'Run Benchmark'}
            </button>
          </div>

          {benchError ? (
            <div className="record-card">
              <h3>Benchmark Run Error</h3>
              <p>{benchError.message}</p>
              {benchError.code ? <p><strong>Code:</strong> <code>{benchError.code}</code></p> : null}
              {benchError.hint ? <p>{benchError.hint}</p> : null}
              {benchError.remediation ? <p>{benchError.remediation}</p> : null}
            </div>
          ) : null}

          {benchmarkSource ? (
            <>
              <h3>Condition Pass Rates</h3>
              <div className="card-grid">
                {orderedConditionIds.map((conditionId) => {
                  const aggregate = benchmarkSource.aggregates[conditionId];
                  if (!aggregate) return null;
                  return (
                    <article key={conditionId} className="metric-card">
                      <div className="metric-title">{conditionId}</div>
                      <div className="metric-value">{toPercent(aggregate.pass_rate)}</div>
                      <p className="table-subtle">{aggregate.pass_count}/{aggregate.sample_count} passing</p>
                    </article>
                  );
                })}
              </div>

              <h3>Delta vs no_skill</h3>
              <div className="card-grid">
                <article className="metric-card">
                  <div className="metric-title">curated_skill - no_skill</div>
                  <div className="metric-value">
                    {toSignedPercent(benchmarkSource.deltas.curated_vs_no_skill?.pass_rate_delta ?? null)}
                  </div>
                </article>
                <article className="metric-card">
                  <div className="metric-title">self_generated_skill - no_skill</div>
                  <div className="metric-value">
                    {toSignedPercent(benchmarkSource.deltas.self_generated_vs_no_skill?.pass_rate_delta ?? null)}
                  </div>
                </article>
              </div>

              <h3>Error Categories by Condition</h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>Condition</th>
                    <th>Error Category</th>
                    <th>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {orderedConditionIds.flatMap((conditionId) => {
                    const categories = benchmarkSource.error_breakdown[conditionId] ?? {};
                    const keys = Object.keys(categories).sort();
                    if (keys.length === 0) {
                      return (
                        <tr key={`${conditionId}-none`}>
                          <td>{conditionId}</td>
                          <td>none</td>
                          <td>0</td>
                        </tr>
                      );
                    }
                    return keys.map((key) => (
                      <tr key={`${conditionId}-${key}`}>
                        <td>{conditionId}</td>
                        <td>{key}</td>
                        <td>{categories[key]}</td>
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </>
          ) : null}

          <h3>Recent Benchmark Runs</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Run</th>
                <th>Created</th>
                <th>Deterministic</th>
                <th>Curated Delta</th>
                <th>Self-generated Delta</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(benchRunsQuery.data?.runs ?? []).map((run) => (
                <tr key={run.runId}>
                  <td>
                    <code>{run.runId}</code>
                    {run.label ? <p className="table-subtle">{run.label}</p> : null}
                  </td>
                  <td>{run.createdAt}</td>
                  <td>{run.deterministic ? <span className="tag pass">true</span> : <span className="tag warn">false</span>}</td>
                  <td>{toSignedPercent(run.deltas.curated_vs_no_skill)}</td>
                  <td>{toSignedPercent(run.deltas.self_generated_vs_no_skill)}</td>
                  <td>
                    <div className="row">
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => openRunMutation.mutate(run.runId)}
                        disabled={openRunMutation.isPending}
                      >
                        Open run JSON
                      </button>
                      <button
                        type="button"
                        className="button tertiary"
                        onClick={() => openReportMutation.mutate(run.runId)}
                        disabled={openReportMutation.isPending}
                      >
                        View report
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {activeBenchRun ? (
            <div className="record-card">
              <h3>Run JSON {activeBenchRunId ? <span className="table-subtle">({activeBenchRunId})</span> : null}</h3>
              <pre>{JSON.stringify(activeBenchRun, null, 2)}</pre>
            </div>
          ) : null}

          {activeBenchReport ? (
            <div className="record-card">
              <h3>Report JSON {activeBenchRunId ? <span className="table-subtle">({activeBenchRunId})</span> : null}</h3>
              <pre>{JSON.stringify(activeBenchReport, null, 2)}</pre>
            </div>
          ) : null}
        </>
      ) : null}
    </PageShell>
  );
}
