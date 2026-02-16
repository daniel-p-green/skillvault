import { useQuery } from '@tanstack/react-query';

import { PageShell } from '../components/PageShell.js';
import { apiGet } from '../services/http.js';

interface AuditResponse {
  totals: {
    skills: number;
    deployments: number;
    staleSkills: number;
    driftedDeployments: number;
  };
  staleSkills: Array<{ skillId: string; versionHash: string; createdAt: string }>;
  driftedDeployments: Array<{ adapterId: string; installedPath: string; driftStatus: string }>;
}

export function AuditPage() {
  const auditQuery = useQuery({
    queryKey: ['audit'],
    queryFn: () => apiGet<AuditResponse>('/audit/summary')
  });

  const totals = auditQuery.data?.totals;

  return (
    <PageShell title="Audit" subtitle="Stale scans, drifted installs, and trust anomalies across the full vault.">
      {totals ? (
        <>
          <div className="card-grid">
            <article className="metric-card">
              <div className="metric-title">Skills</div>
              <div className="metric-value">{totals.skills}</div>
            </article>
            <article className="metric-card">
              <div className="metric-title">Deployments</div>
              <div className="metric-value">{totals.deployments}</div>
            </article>
            <article className="metric-card">
              <div className="metric-title">Stale Scans</div>
              <div className="metric-value">{totals.staleSkills}</div>
            </article>
            <article className="metric-card">
              <div className="metric-title">Drifted</div>
              <div className="metric-value">{totals.driftedDeployments}</div>
            </article>
          </div>

          <h3>Stale Skills</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Skill</th>
                <th>Version Hash</th>
                <th>Created At</th>
              </tr>
            </thead>
            <tbody>
              {auditQuery.data?.staleSkills.map((skill) => (
                <tr key={`${skill.skillId}-${skill.versionHash}`}>
                  <td>{skill.skillId}</td>
                  <td><code>{skill.versionHash}</code></td>
                  <td>{skill.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Drifted Deployments</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Adapter</th>
                <th>Installed Path</th>
                <th>Drift Status</th>
              </tr>
            </thead>
            <tbody>
              {auditQuery.data?.driftedDeployments.map((deployment) => (
                <tr key={`${deployment.adapterId}-${deployment.installedPath}`}>
                  <td>{deployment.adapterId}</td>
                  <td><code>{deployment.installedPath}</code></td>
                  <td><span className="tag fail">{deployment.driftStatus}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p>Running vault-wide audit...</p>
      )}
    </PageShell>
  );
}
