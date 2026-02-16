import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PageShell } from '../components/PageShell.js';
import { apiGet, apiPost } from '../services/http.js';

interface Adapter {
  id: string;
  displayName: string;
  projectPath: string;
  globalPath: string;
  isEnabled: boolean;
}

interface AdaptersResponse {
  adapters: Adapter[];
}

export function AdaptersPage() {
  const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const queryClient = useQueryClient();

  const adaptersQuery = useQuery({
    queryKey: ['adapters'],
    queryFn: () => apiGet<AdaptersResponse>('/adapters')
  });

  const toggleMutation = useMutation({
    mutationFn: (payload: { id: string; enabled: boolean }) => apiPost('/adapters/toggle', payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['adapters'] });
    }
  });

  const syncMutation = useMutation({
    mutationFn: () => apiPost('/adapters/sync'),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['adapters'] });
    }
  });

  const filteredAdapters = useMemo(() => {
    const all = adaptersQuery.data?.adapters ?? [];
    if (filter === 'enabled') return all.filter((adapter) => adapter.isEnabled);
    if (filter === 'disabled') return all.filter((adapter) => !adapter.isEnabled);
    return all;
  }, [adaptersQuery.data, filter]);

  return (
    <PageShell title="Adapters" subtitle="skills.sh parity snapshot plus local enable/disable controls and path diagnostics.">
      <div className="row spread">
        <div className="toggle-row" role="tablist" aria-label="Adapter filter">
          <button type="button" className={`chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All</button>
          <button type="button" className={`chip ${filter === 'enabled' ? 'active' : ''}`} onClick={() => setFilter('enabled')}>Enabled</button>
          <button type="button" className={`chip ${filter === 'disabled' ? 'active' : ''}`} onClick={() => setFilter('disabled')}>Disabled</button>
        </div>
        <button className="button secondary" type="button" onClick={() => syncMutation.mutate()}>
          {syncMutation.isPending ? 'Syncing...' : 'Sync Snapshot'}
        </button>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Adapter</th>
            <th>Project Path</th>
            <th>Global Path</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {filteredAdapters.map((adapter) => (
            <tr key={adapter.id}>
              <td>
                <strong>{adapter.displayName}</strong>
                <div className="table-subtle">{adapter.id}</div>
              </td>
              <td><code>{adapter.projectPath}</code></td>
              <td><code>{adapter.globalPath}</code></td>
              <td>
                {adapter.isEnabled
                  ? <span className="tag pass">Enabled</span>
                  : <span className="tag fail">Disabled</span>}
              </td>
              <td>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => toggleMutation.mutate({ id: adapter.id, enabled: !adapter.isEnabled })}
                >
                  {adapter.isEnabled ? 'Disable' : 'Enable'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PageShell>
  );
}
