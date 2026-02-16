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

describe('telemetry page', () => {
  beforeEach(() => {
    installFetchMock({
      '/health': { ok: true },
      '/skills': { skills: [] },
      '/deployments': { deployments: [] },
      '/audit/summary': { totals: { staleSkills: 0, driftedDeployments: 0 } },
      '/telemetry/status': {
        totals: {
          total: 5,
          pending: 2,
          retry: 1,
          sent: 2,
          dead_letter: 0,
          skipped: 0
        },
        latest: [
          {
            id: 'evt1',
            eventType: 'skill.imported',
            source: 'manager-core',
            subjectType: 'skill_version',
            outboxStatus: 'pending',
            createdAt: '2026-02-16T00:00:00.000Z'
          }
        ]
      },
      'POST /telemetry/flush': {
        target: 'jsonl',
        processed: 2,
        sent: 2,
        retried: 0,
        deadLetter: 0,
        outputPath: '/tmp/flush.jsonl'
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders telemetry metrics and flush action results', async () => {
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: /Telemetry/i }));
    await screen.findByRole('heading', { level: 2, name: 'Telemetry' });
    await screen.findByText('Total Events');
    expect(screen.getByText('5')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Flush Outbox/i }));
    await waitFor(() => {
      expect(screen.getByText(/"processed": 2/)).toBeTruthy();
    });
  });
});

