import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PageShell } from '../components/PageShell.js';
import { apiGet, apiPost } from '../services/http.js';

interface FilesystemInventoryResponse {
  totals: {
    managedSkills: number;
    unmanagedSkills: number;
    installations: number;
    adaptersScanned: number;
  };
  skills: Array<{
    skillId: string;
    name: string;
    sourceType: string | null;
    sourceLocator: string | null;
    versionHash: string | null;
    riskTotal: number | null;
    verdict: 'PASS' | 'WARN' | 'FAIL' | null;
    managed: boolean;
    installations: Array<{
      adapterId: string;
      scope: 'project' | 'global';
      installedPath: string;
      managedDeployment: boolean;
    }>;
  }>;
}

interface SyncFallbackResponse {
  discovered: Array<{
    adapterId: string;
    scope: 'project' | 'global';
    installedPath: string;
    skillId: string;
  }>;
}

function messageFromError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

function guidanceForError(rawMessage: string): string | null {
  if (rawMessage.includes('API 401') || rawMessage.includes('API 403')) {
    return 'Access denied by Manager API. Open Access and set a valid token, then retry.';
  }
  if (rawMessage.includes('Failed to fetch') || rawMessage.includes('NetworkError')) {
    return 'Manager API is unreachable. Start it with: skillvault manager serve --root /Users/danielgreen/Documents/GitHub/skillvault';
  }
  if (rawMessage.includes('API 404')) {
    return 'Manager API route not found. Ensure API and web are on the same version and retry.';
  }
  return null;
}

function buildInventoryFromSyncFallback(data: SyncFallbackResponse): FilesystemInventoryResponse {
  const bySkill = new Map<string, FilesystemInventoryResponse['skills'][number]>();
  const adapterIds = new Set<string>();

  for (const row of data.discovered) {
    adapterIds.add(row.adapterId);
    const existing = bySkill.get(row.skillId);
    if (!existing) {
      bySkill.set(row.skillId, {
        skillId: row.skillId,
        name: row.skillId,
        sourceType: 'filesystem',
        sourceLocator: null,
        versionHash: null,
        riskTotal: null,
        verdict: null,
        managed: false,
        installations: [{
          adapterId: row.adapterId,
          scope: row.scope,
          installedPath: row.installedPath,
          managedDeployment: false
        }]
      });
      continue;
    }

    existing.installations.push({
      adapterId: row.adapterId,
      scope: row.scope,
      installedPath: row.installedPath,
      managedDeployment: false
    });
  }

  const skills = [...bySkill.values()].sort((a, b) => a.skillId.localeCompare(b.skillId));
  return {
    totals: {
      managedSkills: 0,
      unmanagedSkills: skills.length,
      installations: skills.reduce((sum, skill) => sum + skill.installations.length, 0),
      adaptersScanned: adapterIds.size
    },
    skills
  };
}

export function InstalledSkillsPage() {
  const queryClient = useQueryClient();

  const inventoryQuery = useQuery({
    queryKey: ['skills-filesystem'],
    queryFn: async () => {
      try {
        return await apiGet<FilesystemInventoryResponse>('/skills/filesystem');
      } catch (error) {
        const message = messageFromError(error);
        const isLegacyFilesystem404 = message.includes('API 404') && message.includes('Skill not found');
        if (!isLegacyFilesystem404) {
          throw error;
        }

        const syncFallback = await apiPost<SyncFallbackResponse>('/sync');
        return buildInventoryFromSyncFallback(syncFallback);
      }
    }
  });

  const syncMutation = useMutation({
    mutationFn: () => apiPost<{ discovered: Array<{ skillId: string }> }>('/sync'),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['skills-filesystem'] });
    }
  });

  const report = inventoryQuery.data;
  const inventoryErrorMessage = inventoryQuery.error ? messageFromError(inventoryQuery.error) : null;
  const syncErrorMessage = syncMutation.error ? messageFromError(syncMutation.error) : null;
  const inventoryErrorHint = inventoryErrorMessage ? guidanceForError(inventoryErrorMessage) : null;
  const syncErrorHint = syncErrorMessage ? guidanceForError(syncErrorMessage) : null;

  return (
    <PageShell
      title="Installed Skills"
      subtitle="Master inventory across the local filesystem: what exists, where it came from, its current version, and where each skill is installed."
    >
      <div className="row spread">
        <div className="table-subtle">Use this view to reconcile managed and unmanaged skills before making changes.</div>
        <button className="button secondary" type="button" disabled={syncMutation.isPending} onClick={() => syncMutation.mutate()}>
          {syncMutation.isPending ? 'Scanning...' : 'Rescan Filesystem'}
        </button>
      </div>

      {inventoryErrorMessage ? (
        <div className="record-card">
          <p className="error-copy">Filesystem scan failed: {inventoryErrorMessage}</p>
          {inventoryErrorHint ? <p className="table-subtle">{inventoryErrorHint}</p> : null}
        </div>
      ) : null}

      {syncErrorMessage ? (
        <div className="record-card">
          <p className="error-copy">Rescan failed: {syncErrorMessage}</p>
          {syncErrorHint ? <p className="table-subtle">{syncErrorHint}</p> : null}
        </div>
      ) : null}

      <div className="card-grid">
        <article className="metric-card">
          <div className="metric-title">Managed Skills</div>
          <div className="metric-value">{report?.totals.managedSkills ?? 0}</div>
        </article>
        <article className="metric-card">
          <div className="metric-title">Unmanaged Skills</div>
          <div className="metric-value">{report?.totals.unmanagedSkills ?? 0}</div>
        </article>
        <article className="metric-card">
          <div className="metric-title">Install Locations</div>
          <div className="metric-value">{report?.totals.installations ?? 0}</div>
        </article>
        <article className="metric-card">
          <div className="metric-title">Adapters Scanned</div>
          <div className="metric-value">{report?.totals.adaptersScanned ?? 0}</div>
        </article>
      </div>

      {inventoryQuery.isLoading ? <p>Scanning adapter paths...</p> : null}

      {!inventoryQuery.isLoading && !inventoryQuery.error && (report?.skills.length ?? 0) === 0 ? (
        <p>No installed skills detected yet.</p>
      ) : null}

      {!inventoryQuery.isLoading && !inventoryQuery.error && (report?.skills.length ?? 0) > 0 ? (
        <table className="table">
          <thead>
            <tr>
              <th>Skill</th>
              <th>Source</th>
              <th>Version</th>
              <th>Risk</th>
              <th>Installed In</th>
            </tr>
          </thead>
          <tbody>
            {report?.skills.map((skill) => (
              <tr key={skill.skillId}>
                <td>
                  <strong>{skill.name}</strong>
                  <div className="table-subtle">{skill.skillId}</div>
                  {skill.managed ? <span className="tag pass">managed</span> : <span className="tag warn">unmanaged</span>}
                </td>
                <td>
                  <div>{skill.sourceType ?? 'unknown'}</div>
                  <div className="table-subtle">{skill.sourceLocator ?? 'No source recorded'}</div>
                </td>
                <td>
                  <code>{skill.versionHash ?? '-'}</code>
                </td>
                <td>
                  {skill.verdict ? <span className={`tag ${skill.verdict.toLowerCase()}`}>{skill.verdict}</span> : <span className="tag">n/a</span>}
                  <div className="table-subtle">{skill.riskTotal ?? '-'}</div>
                </td>
                <td>
                  {skill.installations.length === 0 ? (
                    <span className="table-subtle">No active install locations</span>
                  ) : (
                    <div className="stack-sm">
                      {skill.installations.map((install) => (
                        <div key={`${install.adapterId}:${install.scope}:${install.installedPath}`}>
                          <code>{install.adapterId}</code>
                          {' '}
                          <span className="table-subtle">({install.scope})</span>
                          <div className="table-subtle">{install.installedPath}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </PageShell>
  );
}
