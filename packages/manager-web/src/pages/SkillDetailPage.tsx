import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { PageShell } from '../components/PageShell.js';
import { apiGet } from '../services/http.js';

interface SkillListResponse {
  skills: Array<{ id: string; name: string }>;
}

interface SkillDetailResponse {
  skill: {
    id: string;
    name: string;
    description: string | null;
    version_hash: string;
    risk_total: number | null;
    verdict: 'PASS' | 'WARN' | 'FAIL' | null;
  };
  versions: Array<{ id: string; versionHash: string; createdAt: string; isCurrent: boolean }>;
  latestScan: {
    findings: Array<{ code: string; severity: 'warn' | 'error'; message: string }>;
    scanner_version: string;
  } | null;
  receipts: Array<{ id: string; receipt_path: string; created_at: string }>;
  deployments: Array<{ adapterId: string; installScope: string; installMode: string; status: string; driftStatus: string }>;
}

export function SkillDetailPage() {
  const [selectedSkillId, setSelectedSkillId] = useState<string>('');

  const skillsQuery = useQuery({
    queryKey: ['skills'],
    queryFn: () => apiGet<SkillListResponse>('/skills')
  });

  useEffect(() => {
    if (!selectedSkillId && skillsQuery.data?.skills.length) {
      setSelectedSkillId(skillsQuery.data.skills[0].id);
    }
  }, [selectedSkillId, skillsQuery.data]);

  const detailQuery = useQuery({
    queryKey: ['skill-detail', selectedSkillId],
    enabled: Boolean(selectedSkillId),
    queryFn: () => apiGet<SkillDetailResponse>(`/skills/${selectedSkillId}`)
  });

  const detail = detailQuery.data;

  return (
    <PageShell title="Skill Detail" subtitle="Version lineage, scan findings, receipt metadata, and deployment matrix.">
      <div className="row">
        <label className="field">
          Skill
          <select
            className="select"
            value={selectedSkillId}
            onChange={(event) => setSelectedSkillId(event.target.value)}
          >
            <option value="">Select skill</option>
            {(skillsQuery.data?.skills ?? []).map((skill) => (
              <option key={skill.id} value={skill.id}>
                {skill.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!detail ? (
        <p>Import a skill to inspect timeline, scan findings, and receipts.</p>
      ) : (
        <>
          <div className="record-card">
            <h3>{detail.skill.name}</h3>
            <p>{detail.skill.description ?? 'No description provided.'}</p>
            <p><strong>Version:</strong> {detail.skill.version_hash}</p>
            <p><strong>Risk:</strong> {detail.skill.risk_total ?? 0}</p>
            <p>
              <strong>Verdict:</strong>{' '}
              <span className={`tag ${(detail.skill.verdict ?? 'PASS').toLowerCase()}`}>{detail.skill.verdict ?? 'PASS'}</span>
            </p>
          </div>

          <h3>Version Timeline</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Created</th>
                <th>Current</th>
              </tr>
            </thead>
            <tbody>
              {detail.versions.map((version) => (
                <tr key={version.id}>
                  <td><code>{version.versionHash}</code></td>
                  <td>{version.createdAt}</td>
                  <td>{version.isCurrent ? <span className="tag pass">Current</span> : <span className="tag">Historic</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Latest Scan Findings</h3>
          {detail.latestScan?.findings.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Severity</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {detail.latestScan.findings.map((finding) => (
                  <tr key={`${finding.code}-${finding.message}`}>
                    <td><code>{finding.code}</code></td>
                    <td><span className={`tag ${finding.severity}`}>{finding.severity.toUpperCase()}</span></td>
                    <td>{finding.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No findings on latest scan.</p>
          )}

          <h3>Receipts</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Receipt Id</th>
                <th>Path</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {detail.receipts.map((receipt) => (
                <tr key={receipt.id}>
                  <td><code>{receipt.id}</code></td>
                  <td><code>{receipt.receipt_path}</code></td>
                  <td>{receipt.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Deployment Matrix</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Adapter</th>
                <th>Scope</th>
                <th>Mode</th>
                <th>Status</th>
                <th>Drift</th>
              </tr>
            </thead>
            <tbody>
              {detail.deployments.map((deployment, index) => (
                <tr key={`${deployment.adapterId}-${deployment.installScope}-${index}`}>
                  <td>{deployment.adapterId}</td>
                  <td>{deployment.installScope}</td>
                  <td>{deployment.installMode}</td>
                  <td>{deployment.status}</td>
                  <td>{deployment.driftStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </PageShell>
  );
}
