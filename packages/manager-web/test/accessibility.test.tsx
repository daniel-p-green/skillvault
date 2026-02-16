import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { App } from '../src/App.js';

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

describe('navigation accessibility', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        const path = url.replace(/^https?:\/\/[^/]+/, '');
        const bodyByPath: Record<string, unknown> = {
          '/health': { ok: true },
          '/skills': { skills: [] },
          '/deployments': { deployments: [] },
          '/audit/summary': { totals: { staleSkills: 0, driftedDeployments: 0 } }
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
    vi.unstubAllGlobals();
  });

  it('exposes all primary views as keyboard-reachable nav buttons', async () => {
    renderApp();
    await screen.findByText('SkillVault Operations Atelier');

    for (const label of [
      'Dashboard',
      'Skill Detail',
      'Adapters',
      'Deploy Flow',
      'Audit',
      'Discover',
      'Telemetry',
      'Evals',
      'Access'
    ]) {
      const button = screen.getByRole('button', { name: new RegExp(label, 'i') });
      expect(button).toBeTruthy();
      expect((button as HTMLButtonElement).type).toBe('button');
    }
  });
});

