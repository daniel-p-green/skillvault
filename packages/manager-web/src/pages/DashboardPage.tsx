import { useQuery } from '@tanstack/react-query';

import { PageShell } from '../components/PageShell.js';
import { apiGet } from '../services/http.js';

interface SkillSummary {
  id: string;
  name: string;
  verdict: 'PASS' | 'WARN' | 'FAIL' | null;
  risk_total: number | null;
}

interface SkillsResponse {
  skills: SkillSummary[];
}

interface DeploymentEntry {
  status: string;
}

interface DeploymentsResponse {
  deployments: DeploymentEntry[];
}

interface AuditSummaryResponse {
  totals: {
    staleSkills: number;
    driftedDeployments: number;
  };
}

const WORKFLOW_STEPS: Array<{ id: string; title: string; detail: string }> = [
  {
    id: 'discover',
    title: '1. Discover',
    detail: 'Source skills from local bundles and trusted catalogs, then stage candidates for review.'
  },
  {
    id: 'scan',
    title: '2. Scan + Receipt',
    detail: 'Run deterministic scanning, capture findings, and create verifiable trust receipts before rollout.'
  },
  {
    id: 'benchmark',
    title: '3. Benchmark + Eval',
    detail: 'Measure curated and self-generated skills against no-skill baselines using reproducible runs.'
  },
  {
    id: 'deploy',
    title: '4. Deploy + Audit',
    detail: 'Deploy across adapters with trust gates, then monitor drift and stale-scan risk.'
  }
];

const PERSONA_USE_CASES: Array<{ title: string; scenario: string }> = [
  {
    title: 'Power users running multiple AI tools',
    scenario: 'Keep one vault of trusted skills and deploy to codex, cursor, claude-code, and other adapters with consistent policy checks.'
  },
  {
    title: 'Team leads standardizing workflows',
    scenario: 'Curate baseline bundles, benchmark improvements, and allow controlled overrides only when justified.'
  },
  {
    title: 'Security-minded builders',
    scenario: 'Treat every skill bundle as untrusted input until deterministic scan + receipt verification is complete.'
  }
];

export function DashboardPage() {
  const skillsQuery = useQuery({
    queryKey: ['skills'],
    queryFn: () => apiGet<SkillsResponse>('/skills')
  });
  const deploymentQuery = useQuery({
    queryKey: ['deployments'],
    queryFn: () => apiGet<DeploymentsResponse>('/deployments')
  });
  const auditQuery = useQuery({
    queryKey: ['audit-summary'],
    queryFn: () => apiGet<AuditSummaryResponse>('/audit/summary')
  });

  const skills = skillsQuery.data?.skills ?? [];
  const deployments = deploymentQuery.data?.deployments ?? [];
  const liveDeployments = deployments.filter((entry) => entry.status === 'deployed').length;
  const pass = skills.filter((item) => item.verdict === 'PASS').length;
  const warn = skills.filter((item) => item.verdict === 'WARN').length;
  const fail = skills.filter((item) => item.verdict === 'FAIL').length;

  return (
    <PageShell
      title="Overview"
      subtitle="Multi-tool skill manager view of discover → scan/receipt → eval/benchmark → deploy, with security signals always visible."
    >
      <div className="card-grid">
        <article className="metric-card">
          <div className="metric-title">Skills in Vault</div>
          <div className="metric-value">{skills.length}</div>
        </article>
        <article className="metric-card">
          <div className="metric-title">Live Deployments</div>
          <div className="metric-value">{liveDeployments}</div>
        </article>
        <article className="metric-card">
          <div className="metric-title">PASS / WARN / FAIL</div>
          <div className="metric-value">{pass} / {warn} / {fail}</div>
        </article>
        <article className="metric-card">
          <div className="metric-title">Stale / Drifted</div>
          <div className="metric-value">
            {(auditQuery.data?.totals.staleSkills ?? 0)} / {(auditQuery.data?.totals.driftedDeployments ?? 0)}
          </div>
        </article>
      </div>

      <div className="record-card">
        <h3>Security baseline</h3>
        <p>SkillVault is local-first for power users managing skills across multiple tools, with deterministic scan + trust receipts before deploy.</p>
        <p className="table-subtle">Scan for security always.</p>
      </div>

      <h3>Operator Workflow</h3>
      <div className="card-grid">
        {WORKFLOW_STEPS.map((step) => (
          <article key={step.id} className="record-card">
            <h3>{step.title}</h3>
            <p>{step.detail}</p>
          </article>
        ))}
      </div>

      <h3>Who SkillVault Serves</h3>
      <div className="card-grid">
        {PERSONA_USE_CASES.map((persona) => (
          <article key={persona.title} className="record-card">
            <h3>{persona.title}</h3>
            <p>{persona.scenario}</p>
          </article>
        ))}
      </div>

      <h3>Latest Skills</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Verdict</th>
            <th>Risk</th>
          </tr>
        </thead>
        <tbody>
          {skills.slice(0, 10).map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td>
                <span className={`tag ${(item.verdict ?? 'PASS').toLowerCase()}`}>{item.verdict ?? 'PASS'}</span>
              </td>
              <td>{item.risk_total ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {skillsQuery.isLoading ? <p>Loading dashboard...</p> : null}
    </PageShell>
  );
}
