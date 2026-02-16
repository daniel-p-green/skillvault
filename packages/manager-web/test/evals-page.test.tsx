import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('seeds and runs eval workflows from the UI', async () => {
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: /Evals/i }));
    await screen.findByRole('heading', { level: 2, name: 'Evals' });

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
});

