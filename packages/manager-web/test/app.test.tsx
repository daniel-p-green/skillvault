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

describe('manager web app', () => {
  beforeEach(() => {
    installFetchMock({
      '/health': { ok: true },
      '/skills': {
        skills: [
          { id: 'alpha-skill', name: 'Alpha Skill', verdict: 'PASS', risk_total: 0, version_hash: 'v1' },
          { id: 'beta-skill', name: 'Beta Skill', verdict: 'FAIL', risk_total: 80, version_hash: 'v2' }
        ]
      },
      '/deployments': {
        deployments: [{ status: 'deployed' }, { status: 'removed' }]
      },
      '/audit/summary': {
        totals: { skills: 2, deployments: 2, staleSkills: 1, driftedDeployments: 1 },
        staleSkills: [{ skillId: 'alpha-skill', versionHash: 'v1', createdAt: '2025-01-01T00:00:00.000Z' }],
        driftedDeployments: [{ adapterId: 'codex', installedPath: '/tmp/alpha', driftStatus: 'missing_path' }]
      },
      '/adapters': {
        adapters: [
          { id: 'codex', displayName: 'Codex', projectPath: '.agents/skills', globalPath: '~/.codex/skills', isEnabled: true },
          { id: 'openclaw', displayName: 'OpenClaw', projectPath: 'skills', globalPath: '~/.openclaw/skills', isEnabled: false }
        ]
      },
      '/adapters/validate': {
        issues: []
      },
      '/skills/alpha-skill': {
        skill: {
          id: 'alpha-skill',
          name: 'Alpha Skill',
          description: 'Alpha description',
          version_hash: 'v1',
          risk_total: 0,
          verdict: 'PASS'
        },
        versions: [{ id: 'alpha:v1', versionHash: 'v1', createdAt: '2025-01-01T00:00:00.000Z', isCurrent: true }],
        latestScan: { findings: [], scanner_version: 'manager-core.v0.2' },
        receipts: [{ id: 'r1', receipt_path: '/tmp/r1.json', created_at: '2025-01-01T00:00:00.000Z' }],
        deployments: [{ adapterId: 'codex', installScope: 'project', installMode: 'symlink', status: 'deployed', driftStatus: 'in_sync' }]
      },
      'POST /skills/alpha-skill/deploy': { ok: true, deployments: [{ adapterId: 'codex', status: 'deployed' }] },
      'POST /skills/alpha-skill/undeploy': { ok: true, undeployed: [{ adapterId: 'codex', removed: true }] },
      'POST /adapters/toggle': { ok: true },
      'POST /adapters/sync': { total: 40 },
      'POST /discover': {
        results: [{ installRef: 'owner/repo@skill', installs: 42, url: 'https://skills.sh/owner/repo/skill' }]
      },
      'POST /skills/import': {
        skillId: 'imported-skill',
        versionId: 'imported-skill:123',
        versionHash: '123',
        receiptPath: '/tmp/receipt.json',
        riskTotal: 0,
        verdict: 'PASS'
      }
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders dashboard with seeded manager summary', async () => {
    renderApp();
    await screen.findByText('Vault Dashboard');
    await screen.findByText('Skills in Vault');
    expect(screen.getByText('PASS / WARN / FAIL')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText('Alpha Skill')).toBeTruthy();
    });
  });

  it('runs deploy flow happy path', async () => {
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: /Deploy Flow/i }));
    await screen.findByRole('heading', { level: 2, name: 'Deploy Flow' });

    fireEvent.change(screen.getByLabelText('Skill'), { target: { value: 'alpha-skill' } });
    fireEvent.change(screen.getByLabelText('Adapter'), { target: { value: 'codex' } });
    fireEvent.click(screen.getByRole('button', { name: /^Deploy$/ }));

    await waitFor(() => {
      expect(screen.getByText(/"ok": true/)).toBeTruthy();
    });
  });

  it('filters adapters and shows status badges', async () => {
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: /Adapters/i }));
    await screen.findByText('skills.sh parity snapshot plus local enable/disable controls and path diagnostics.');
    fireEvent.click(screen.getByRole('button', { name: 'Disabled' }));
    await waitFor(() => {
      expect(screen.getByText('OpenClaw')).toBeTruthy();
    });
  });

  it('renders audit stale and drift findings', async () => {
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: /Audit/i }));
    await screen.findByText('Stale Skills');
    expect(screen.getByText('alpha-skill')).toBeTruthy();
    expect(screen.getByText('missing_path')).toBeTruthy();
  });

  it('keeps navigation accessible on small viewport widths', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 420 });
    window.dispatchEvent(new Event('resize'));
    renderApp();
    await screen.findByText('SkillVault Operations Atelier');
    expect(screen.getByRole('button', { name: /Dashboard/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Discover/i })).toBeTruthy();
  });
});
