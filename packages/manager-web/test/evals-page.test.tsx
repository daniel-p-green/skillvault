import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { App } from '../src/App.js';

type JsonValue = Record<string, unknown>;

function createResponse(body: JsonValue, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false }
    }
  });
}

function renderApp() {
  const client = createQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  );
}

function installFetchMock(overrides: Record<string, JsonValue>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      const path = url.replace(/^https?:\/\/[^/]+/, '');
      const key = `${method} ${path}`;
      const body = overrides[key] ?? overrides[path];
      if (!body) {
        return createResponse({ error: `No mock for ${key}` }, 404);
      }
      return createResponse(body);
    })
  );
}

describe('evals page', () => {
  beforeEach(() => {
    installFetchMock({
      '/health': { ok: true },
      '/skills': { skills: [] },
      '/deployments': { deployments: [] },
      '/audit/summary': { totals: { staleSkills: 0, driftedDeployments: 0 } },
      '/evals/datasets': {
        datasets: [
          {
            id: 'default-manager-regression',
            name: 'Default Manager Regression Dataset',
            description: 'Deterministic checks'
          }
        ]
      },
      'POST /evals/datasets/seed': {
        datasetId: 'default-manager-regression',
        caseCount: 3
      },
      'POST /evals/runs': {
        run: {
          id: 'run-1',
          datasetId: 'default-manager-regression',
          score: 1,
          status: 'completed'
        },
        comparison: {
          baselineRunId: 'run-0',
          delta: 0.25,
          regressed: false
        },
        regressionFailed: false
      },
      '/bench/configs': {
        configs: [
          {
            id: 'bench/example.yaml',
            name: 'example.yaml',
            path: '/workspace/bench/example.yaml',
            source: 'workspace'
          }
        ]
      },
      '/bench/runs?limit=25': {
        runs: [
          {
            runId: 'run-bench-1',
            runPath: '/workspace/.skillvault/export/bench/runs/run-bench-1.json',
            configPath: '/workspace/bench/example.yaml',
            label: 'nightly',
            createdAt: '1970-01-01T00:00:00.000Z',
            deterministic: true,
            gitCommit: 'abc123',
            conditionPassRates: {
              no_skill: 0.4,
              curated_skill: 0.8,
              self_generated_skill: 0.6
            },
            deltas: {
              curated_vs_no_skill: 0.4,
              self_generated_vs_no_skill: 0.2
            }
          }
        ]
      },
      'POST /bench/runs': {
        runId: 'run-bench-2',
        runPath: '/workspace/.skillvault/export/bench/runs/run-bench-2.json',
        run: {
          contract_id: 'skillvault.bench.run.v1',
          created_at: '1970-01-01T00:00:00.000Z',
          run: {
            config_path: '/workspace/bench/example.yaml',
            git_commit: 'abc123',
            deterministic: true,
            seed: 0,
            retries: 0
          },
          conditions: [
            { id: 'no_skill' },
            { id: 'curated_skill' },
            { id: 'self_generated_skill' }
          ],
          aggregates: {
            no_skill: {
              condition_id: 'no_skill',
              sample_count: 5,
              pass_count: 2,
              fail_count: 3,
              pass_rate: 0.4,
              avg_duration_ms: 0,
              confidence_95: { low: 0.1, high: 0.7 }
            },
            curated_skill: {
              condition_id: 'curated_skill',
              sample_count: 5,
              pass_count: 4,
              fail_count: 1,
              pass_rate: 0.8,
              avg_duration_ms: 0,
              confidence_95: { low: 0.3, high: 0.95 }
            },
            self_generated_skill: {
              condition_id: 'self_generated_skill',
              sample_count: 5,
              pass_count: 3,
              fail_count: 2,
              pass_rate: 0.6,
              avg_duration_ms: 0,
              confidence_95: { low: 0.2, high: 0.85 }
            }
          },
          deltas: {
            curated_vs_no_skill: {
              baseline_condition_id: 'no_skill',
              target_condition_id: 'curated_skill',
              sample_count: 5,
              pass_count_delta: 2,
              pass_rate_delta: 0.4,
              avg_duration_ms_delta: 0
            },
            self_generated_vs_no_skill: {
              baseline_condition_id: 'no_skill',
              target_condition_id: 'self_generated_skill',
              sample_count: 5,
              pass_count_delta: 1,
              pass_rate_delta: 0.2,
              avg_duration_ms_delta: 0
            }
          },
          error_breakdown: {
            no_skill: { assertion_failed: 3 },
            curated_skill: { assertion_failed: 1 },
            self_generated_skill: { execution_error: 1 }
          }
        },
        report: {
          contract_id: 'skillvault.bench.report.v1',
          created_at: '1970-01-01T00:00:00.000Z',
          source_created_at: '1970-01-01T00:00:00.000Z',
          deterministic: true,
          aggregates: {
            no_skill: {
              condition_id: 'no_skill',
              sample_count: 5,
              pass_count: 2,
              fail_count: 3,
              pass_rate: 0.4,
              avg_duration_ms: 0,
              confidence_95: { low: 0.1, high: 0.7 }
            },
            curated_skill: {
              condition_id: 'curated_skill',
              sample_count: 5,
              pass_count: 4,
              fail_count: 1,
              pass_rate: 0.8,
              avg_duration_ms: 0,
              confidence_95: { low: 0.3, high: 0.95 }
            },
            self_generated_skill: {
              condition_id: 'self_generated_skill',
              sample_count: 5,
              pass_count: 3,
              fail_count: 2,
              pass_rate: 0.6,
              avg_duration_ms: 0,
              confidence_95: { low: 0.2, high: 0.85 }
            }
          },
          deltas: {
            curated_vs_no_skill: {
              baseline_condition_id: 'no_skill',
              target_condition_id: 'curated_skill',
              sample_count: 5,
              pass_count_delta: 2,
              pass_rate_delta: 0.4,
              avg_duration_ms_delta: 0
            },
            self_generated_vs_no_skill: {
              baseline_condition_id: 'no_skill',
              target_condition_id: 'self_generated_skill',
              sample_count: 5,
              pass_count_delta: 1,
              pass_rate_delta: 0.2,
              avg_duration_ms_delta: 0
            }
          },
          error_breakdown: {
            no_skill: { assertion_failed: 3 },
            curated_skill: { assertion_failed: 1 },
            self_generated_skill: { execution_error: 1 }
          }
        }
      },
      '/bench/runs/run-bench-1': {
        contract_id: 'skillvault.bench.run.v1',
        created_at: '1970-01-01T00:00:00.000Z',
        run: {
          config_path: '/workspace/bench/example.yaml',
          git_commit: 'abc123',
          deterministic: true,
          seed: 0,
          retries: 0
        },
        conditions: [
          { id: 'no_skill' },
          { id: 'curated_skill' },
          { id: 'self_generated_skill' }
        ],
        aggregates: {},
        deltas: {
          curated_vs_no_skill: null,
          self_generated_vs_no_skill: null
        },
        error_breakdown: {}
      },
      '/bench/runs/run-bench-1/report': {
        contract_id: 'skillvault.bench.report.v1',
        created_at: '1970-01-01T00:00:00.000Z',
        source_created_at: '1970-01-01T00:00:00.000Z',
        deterministic: true,
        aggregates: {},
        deltas: {
          curated_vs_no_skill: null,
          self_generated_vs_no_skill: null
        },
        error_breakdown: {}
      }
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('seeds and runs eval workflows from the UI', async () => {
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: /Evals \+ Bench/i }));
    await screen.findByRole('heading', { level: 2, name: 'Evals + Bench' });

    fireEvent.click(screen.getByRole('button', { name: /Seed Default Dataset/i }));
    await screen.findByText(/Seeded 3 cases/i);

    fireEvent.change(screen.getByLabelText('Dataset'), { target: { value: 'default-manager-regression' } });
    fireEvent.click(screen.getByRole('button', { name: /Run Eval/i }));

    await waitFor(() => {
      expect(screen.getByText('Latest Run')).toBeTruthy();
      expect(screen.getByText(/Score:/i)).toBeTruthy();
      expect(screen.getByText(/improved/i)).toBeTruthy();
    });
  });

  it('runs benchmark flow and opens run/report history', async () => {
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: /Evals \+ Bench/i }));
    await screen.findByRole('heading', { level: 2, name: 'Evals + Bench' });

    fireEvent.click(screen.getByRole('button', { name: 'Skill Benchmarks' }));
    await screen.findByText('Recent Benchmark Runs');
    fireEvent.change(screen.getByLabelText('Benchmark Config'), { target: { value: '/workspace/bench/example.yaml' } });

    fireEvent.click(screen.getByRole('button', { name: /Run Benchmark/i }));
    await screen.findByText('Condition Pass Rates');
    await screen.findByText('curated_skill - no_skill');

    fireEvent.click(screen.getByRole('button', { name: /Open run JSON/i }));
    await waitFor(() => {
      expect(screen.getByText(/"contract_id": "skillvault.bench.run.v1"/)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /View report/i }));
    await waitFor(() => {
      expect(screen.getByText(/"contract_id": "skillvault.bench.report.v1"/)).toBeTruthy();
    });
  });
});
