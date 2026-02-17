import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';

import { DashboardPage } from './pages/DashboardPage.js';
import { SkillDetailPage } from './pages/SkillDetailPage.js';
import { InstalledSkillsPage } from './pages/InstalledSkillsPage.js';
import { AdaptersPage } from './pages/AdaptersPage.js';
import { DeployPage } from './pages/DeployPage.js';
import { AuditPage } from './pages/AuditPage.js';
import { DiscoverPage } from './pages/DiscoverPage.js';
import { TelemetryPage } from './pages/TelemetryPage.js';
import { EvalsPage } from './pages/EvalsPage.js';
import { AccessPage } from './pages/AccessPage.js';
import { API_BASE, apiGet } from './services/http.js';

type PageKey = 'dashboard' | 'installed' | 'skill' | 'adapters' | 'deploy' | 'audit' | 'discover' | 'telemetry' | 'evals' | 'access';

interface HealthResponse {
  ok: boolean;
}

const NAV_ITEMS: Array<{ key: PageKey; label: string; description: string }> = [
  { key: 'dashboard', label: 'Overview', description: 'Pipeline status: discover, scan, benchmark, deploy' },
  { key: 'installed', label: 'Installed Skills', description: 'Multi-tool inventory with source and install paths' },
  { key: 'skill', label: 'Skill Detail', description: 'Version history, receipts, findings, and deploy readiness' },
  { key: 'adapters', label: 'Adapters', description: 'Tool connectors, target paths, and adapter health' },
  { key: 'deploy', label: 'Deploy', description: 'Controlled rollout with trust-gate enforcement' },
  { key: 'audit', label: 'Audit', description: 'Drift and stale-scan anomalies across deployed skills' },
  { key: 'discover', label: 'Discover & Import', description: 'Find skills, import locally, then scan + receipt' },
  { key: 'telemetry', label: 'Telemetry', description: 'Event outbox and export delivery status' },
  { key: 'evals', label: 'Evals + Bench', description: 'Regression and A/B benchmark outcomes by condition' },
  { key: 'access', label: 'Access', description: 'Auth mode, RBAC roles, and token controls' }
];

function pageForKey(key: PageKey) {
  switch (key) {
    case 'dashboard':
      return <DashboardPage />;
    case 'installed':
      return <InstalledSkillsPage />;
    case 'skill':
      return <SkillDetailPage />;
    case 'adapters':
      return <AdaptersPage />;
    case 'deploy':
      return <DeployPage />;
    case 'audit':
      return <AuditPage />;
    case 'discover':
      return <DiscoverPage />;
    case 'telemetry':
      return <TelemetryPage />;
    case 'evals':
      return <EvalsPage />;
    case 'access':
      return <AccessPage />;
    default:
      return <DashboardPage />;
  }
}

export function App() {
  const [page, setPage] = useState<PageKey>('dashboard');
  const prefersReducedMotion = useReducedMotion();
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => apiGet<HealthResponse>('/health'),
    retry: 1
  });

  const selected = useMemo(() => NAV_ITEMS.find((item) => item.key === page), [page]);
  const managerApiLabel = useMemo(() => {
    try {
      const apiUrl = new URL(API_BASE);
      const normalizedPath = apiUrl.pathname !== '/' ? apiUrl.pathname : '';
      return `${apiUrl.host}${normalizedPath}`;
    } catch {
      return API_BASE;
    }
  }, []);

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <header className="topbar">
        <div className="status-row">
          <span className={`status-dot ${health.data?.ok ? 'live' : 'down'}`} />
          <span className="status-text">
            {health.data?.ok ? `Manager API live at ${managerApiLabel}` : health.isLoading ? 'Checking manager API...' : 'Manager API unavailable'}
          </span>
        </div>
        <h1 className="brand">SkillVault Manager</h1>
        <p className="subtitle">
          All-in-one skill manager for devs and power users: discover across ecosystems, scan and receipt for security always, benchmark outcomes, and deploy safely across tools.
        </p>
      </header>

      <div className="grid">
        <aside className="sidebar" aria-label="Primary navigation">
          {NAV_ITEMS.map((item, index) => (
            <motion.button
              key={item.key}
              className={`nav-button ${item.key === page ? 'active' : ''}`}
              onClick={() => setPage(item.key)}
              initial={prefersReducedMotion ? false : { opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.03 * index + 0.02, duration: 0.28 }}
              type="button"
            >
              <span className="nav-label">{item.label}</span>
              <span className="nav-description">{item.description}</span>
            </motion.button>
          ))}
        </aside>

        <main id="main-content" tabIndex={-1}>
          <motion.div
            key={page}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.26, ease: 'easeOut' }}
          >
            {pageForKey(page)}
          </motion.div>
        </main>
      </div>

      <footer className="footer-note">
        Active view: <strong>{selected?.label}</strong> - {selected?.description}
      </footer>
    </div>
  );
}
