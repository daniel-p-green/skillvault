import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { App } from '../src/App.js';
import { setApiToken } from '../src/services/http.js';

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

describe('manager web auth token forwarding', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const path = url.replace(/^https?:\/\/[^/]+/, '');
        const bodyByPath: Record<string, unknown> = {
          '/health': { ok: true },
          '/skills': { skills: [] },
          '/deployments': { deployments: [] },
          '/audit/summary': {
            totals: { staleSkills: 0, driftedDeployments: 0 }
          }
        };
        const body = bodyByPath[path] ?? {};
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
  });

  afterEach(() => {
    setApiToken(null);
    vi.unstubAllGlobals();
  });

  it('sends bearer token header when API token is set in local storage', async () => {
    setApiToken('svtok_test_token');
    renderApp();
    await screen.findByText('Vault Dashboard');

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalled();
    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit | undefined;
      const headers = new Headers(init?.headers);
      expect(headers.get('Authorization')).toBe('Bearer svtok_test_token');
    }
  });
});
