import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
    await screen.findByText('SkillVault Manager');
    const nav = screen.getByLabelText('Primary navigation');

    for (const label of [
      'Overview',
      'Installed Skills',
      'Skill Detail',
      'Adapters',
      'Deploy',
      'Audit',
      'Discover & Import',
      'Telemetry',
      'Evals + Bench',
      'Access'
    ]) {
      const labelNode = within(nav).getByText(label);
      const button = labelNode.closest('button');
      expect(button).toBeTruthy();
      expect((button as HTMLButtonElement).type).toBe('button');
    }
  });
});
