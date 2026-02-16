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
    <PageShell title="Vault Dashboard" subtitle="Trust posture, deployment momentum, and drift pressure in one screen.">
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
