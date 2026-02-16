import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
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
import { apiGet } from './services/http.js';

type PageKey = 'dashboard' | 'installed' | 'skill' | 'adapters' | 'deploy' | 'audit' | 'discover' | 'telemetry' | 'evals' | 'access';

interface HealthResponse {
  ok: boolean;
}

const NAV_ITEMS: Array<{ key: PageKey; label: string; description: string }> = [
  { key: 'dashboard', label: 'Overview', description: 'Current risk and deployment health' },
  { key: 'installed', label: 'Installed Skills', description: 'What is installed and where' },
  { key: 'skill', label: 'Skill Detail', description: 'Version, receipt, and findings' },
  { key: 'adapters', label: 'Adapters', description: 'Targets, paths, and status' },
  { key: 'deploy', label: 'Deploy', description: 'Install or remove to selected apps' },
  { key: 'audit', label: 'Audit', description: 'Drift and stale scan checks' },
  { key: 'discover', label: 'Discover & Import', description: 'Find sources and import by URL' },
  { key: 'telemetry', label: 'Telemetry', description: 'Export queue and event delivery' },
  { key: 'evals', label: 'Evals', description: 'Regression checks before rollout' },
  { key: 'access', label: 'Access', description: 'Auth mode, roles, and tokens' }
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
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => apiGet<HealthResponse>('/health'),
    retry: 1
  });

  const selected = useMemo(() => NAV_ITEMS.find((item) => item.key === page), [page]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="status-row">
          <span className={`status-dot ${health.data?.ok ? 'live' : 'down'}`} />
          <span className="status-text">
            {health.data?.ok ? 'Manager API live on :4646' : health.isLoading ? 'Checking manager API...' : 'Manager API unavailable'}
          </span>
        </div>
        <h1 className="brand">SkillVault Manager</h1>
        <p className="subtitle">
          Utility-first control plane for importing, scanning, and deploying skills across Codex, Windsurf, OpenClaw, Cursor, and Claude Code.
        </p>
      </header>

      <div className="grid">
        <aside className="sidebar" aria-label="Primary navigation">
          {NAV_ITEMS.map((item, index) => (
            <motion.button
              key={item.key}
              className={`nav-button ${item.key === page ? 'active' : ''}`}
              onClick={() => setPage(item.key)}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.03 * index + 0.02, duration: 0.28 }}
              type="button"
            >
              <span className="nav-label">{item.label}</span>
              <span className="nav-description">{item.description}</span>
            </motion.button>
          ))}
        </aside>

        <main>
          <motion.div
            key={page}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.26, ease: 'easeOut' }}
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
