import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
      '/discover/sources': {
        sources: [
          { id: 'skills-sh', label: 'skills.sh', url: 'https://skills.sh', description: 'Directory', importHint: 'Paste URL' }
        ]
      },
      '/skills/filesystem': {
        totals: { managedSkills: 1, unmanagedSkills: 0, installations: 1, adaptersScanned: 2 },
        skills: [
          {
            skillId: 'alpha-skill',
            name: 'Alpha Skill',
            sourceType: 'path',
            sourceLocator: '/tmp/alpha',
            versionHash: 'v1',
            riskTotal: 0,
            verdict: 'PASS',
            managed: true,
            installations: [{ adapterId: 'codex', scope: 'project', installedPath: '/tmp/alpha', managedDeployment: true }]
          }
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
      'POST /sync': { discovered: [{ skillId: 'alpha-skill' }] },
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
      },
      'POST /skills/imported-skill/deploy': {
        deployments: [{ adapterId: 'codex', status: 'deployed' }]
      }
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders dashboard with seeded manager summary', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 2, name: 'Overview' });
    await screen.findByText('Skills in Vault');
    expect(screen.getByText('PASS / WARN / FAIL')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText('Alpha Skill')).toBeTruthy();
    });
  });

  it('runs deploy flow happy path', async () => {
    renderApp();
    const nav = await screen.findByLabelText('Primary navigation');
    fireEvent.click(within(nav).getByRole('button', { name: /^Deploy\b/i }));
    await screen.findByRole('heading', { level: 2, name: 'Deploy' });

    fireEvent.change(screen.getByLabelText('Skill'), { target: { value: 'alpha-skill' } });
    fireEvent.change(screen.getByLabelText('Adapter'), { target: { value: 'codex' } });
    fireEvent.click(screen.getByRole('button', { name: /^Deploy$/ }));

    await waitFor(() => {
      expect(screen.getByText(/"ok": true/)).toBeTruthy();
    });
  });

  it('renders trust-block remediation when deploy is denied by security gate', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = (init?.method ?? 'GET').toUpperCase();
        const path = url.replace(/^https?:\/\/[^/]+/, '');
        const key = `${method} ${path}`;

        if (key === 'POST /skills/alpha-skill/deploy') {
          return createResponse({
            code: 'DEPLOY_BLOCKED_BY_TRUST',
            message: 'Deployment blocked for alpha-skill: latest trust verdict is FAIL (92).',
            skillId: 'alpha-skill',
            verdict: 'FAIL',
            riskTotal: 92,
            overrideAllowed: true,
            remediation: 'Resolve scan findings or explicitly use override permissions for emergency rollout.'
          }, 409);
        }

        const bodyByPath: Record<string, JsonValue> = {
          '/health': { ok: true },
          '/skills': {
            skills: [
              { id: 'alpha-skill', name: 'Alpha Skill', verdict: 'FAIL', risk_total: 92, version_hash: 'v1' }
            ]
          },
          '/adapters': {
            adapters: [
              { id: 'codex', displayName: 'Codex', projectPath: '.agents/skills', globalPath: '~/.codex/skills', isEnabled: true }
            ]
          },
          '/deployments': { deployments: [] },
          '/audit/summary': {
            totals: { skills: 1, deployments: 0, staleSkills: 0, driftedDeployments: 0 },
            staleSkills: [],
            driftedDeployments: []
          }
        };
        const body = bodyByPath[path];
        if (!body) {
          return createResponse({ error: `No mock for ${key}` }, 404);
        }
        return createResponse(body);
      })
    );

    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: /^Deploy\b/i }));
    await screen.findByRole('heading', { level: 2, name: 'Deploy' });

    fireEvent.change(screen.getByLabelText('Skill'), { target: { value: 'alpha-skill' } });
    fireEvent.change(screen.getByLabelText('Adapter'), { target: { value: 'codex' } });
    fireEvent.click(screen.getByRole('button', { name: /^Deploy$/ }));

    await screen.findByText('Deploy blocked by trust gate');
    expect(screen.getByText(/Deployment blocked for alpha-skill/i)).toBeTruthy();
    expect(screen.getByText(/Resolve scan findings/i)).toBeTruthy();
  });

  it('filters adapters and shows status badges', async () => {
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: /Adapters/i }));
    await screen.findByText('Configure the tool connectors used to discover, scan, benchmark, and deploy skills across your local stack.');
    fireEvent.click(screen.getByRole('button', { name: 'Disabled' }));
    await waitFor(() => {
      expect(screen.getByText('OpenClaw')).toBeTruthy();
    });
  });

  it('shows filesystem-backed installed skills inventory', async () => {
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: /Installed Skills/i }));
    await screen.findByRole('heading', { level: 2, name: 'Installed Skills' });
    expect(screen.getByText('Cross-tool filesystem inventory: origin, trust state, version, and install targets before benchmark and deploy decisions.')).toBeTruthy();
    expect(await screen.findByText('alpha-skill')).toBeTruthy();
    const pathMatches = await screen.findAllByText('/tmp/alpha');
    expect(pathMatches.length).toBeGreaterThan(0);
  });

  it('shows actionable filesystem scan errors instead of empty-state confusion', async () => {
    installFetchMock({
      '/health': { ok: true },
      '/skills': { skills: [] },
      '/deployments': { deployments: [] },
      '/audit/summary': {
        totals: { skills: 0, deployments: 0, staleSkills: 0, driftedDeployments: 0 },
        staleSkills: [],
        driftedDeployments: []
      }
    });
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: /Installed Skills/i }));
    await screen.findByRole('heading', { level: 2, name: 'Installed Skills' });
    expect(await screen.findByText(/Filesystem scan failed:/i)).toBeTruthy();
  });

  it('falls back to /sync when older API returns Skill not found for /skills/filesystem', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = (init?.method ?? 'GET').toUpperCase();
        const path = url.replace(/^https?:\/\/[^/]+/, '');
        const headers = new Headers(init?.headers);

        if (path === '/skills/filesystem') {
          return createResponse({ error: 'Skill not found' }, 404);
        }
        if (method === 'POST' && path === '/sync') {
          if (headers.has('Content-Type')) {
            return createResponse({
              statusCode: 400,
              code: 'FST_ERR_CTP_EMPTY_JSON_BODY',
              error: 'Bad Request',
              message: "Body cannot be empty when content-type is set to 'application/json'"
            }, 400);
          }
          return createResponse({
            discovered: [{ adapterId: 'codex', scope: 'project', installedPath: '/tmp/legacy-skill', skillId: 'legacy-skill' }]
          });
        }

        const overrides: Record<string, JsonValue> = {
          '/health': { ok: true },
          '/skills': { skills: [] },
          '/deployments': { deployments: [] },
          '/audit/summary': {
            totals: { skills: 0, deployments: 0, staleSkills: 0, driftedDeployments: 0 },
            staleSkills: [],
            driftedDeployments: []
          },
          '/adapters': { adapters: [] },
          '/discover/sources': { sources: [] }
        };
        const key = `${method} ${path}`;
        const body = overrides[key] ?? overrides[path];
        if (!body) {
          return createResponse({ error: `No mock for ${key}` }, 404);
        }
        return createResponse(body);
      })
    );

    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: /Installed Skills/i }));
    await screen.findByRole('heading', { level: 2, name: 'Installed Skills' });
    const matches = await screen.findAllByText('legacy-skill');
    expect(matches.length).toBeGreaterThan(0);
    expect(screen.queryByText(/Filesystem scan failed:/i)).toBeNull();
  });

  it('imports by URL from discover page and deploys after scan', async () => {
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: /Discover & Import/i }));
    await screen.findByRole('heading', { level: 2, name: 'Discover & Import' });

    fireEvent.click(await screen.findByRole('button', { name: /Use URL/i }));
    fireEvent.click(screen.getByRole('button', { name: /Import and Deploy/i }));

    await waitFor(() => {
      expect(screen.getByText(/"skillId": "imported-skill"/)).toBeTruthy();
      expect(screen.getByText(/"deployments"/)).toBeTruthy();
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
    await screen.findByText('SkillVault Manager');
    expect(screen.getByRole('button', { name: /Overview/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Installed Skills/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Discover & Import/i })).toBeTruthy();
  });
});
