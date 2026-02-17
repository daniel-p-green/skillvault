import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

import { PageShell } from '../components/PageShell.js';
import { apiGet, apiPost } from '../services/http.js';

interface DiscoverResponse {
  results: Array<{ installRef: string; installs?: number; url: string }>;
}

interface DiscoverySourcesResponse {
  sources: Array<{ id: string; label: string; url: string; description: string; importHint: string }>;
}

interface AdaptersResponse {
  adapters: Array<{ id: string; displayName: string; isEnabled: boolean }>;
}

interface ImportResponse {
  skillId: string;
  versionId: string;
  versionHash: string;
  receiptPath: string;
  riskTotal: number;
  verdict: 'PASS' | 'WARN' | 'FAIL';
}

interface DeployResponse {
  deployments?: Array<{ adapterId: string; status: string }>;
}

export function DiscoverPage() {
  const [query, setQuery] = useState('skill manager');
  const [importInput, setImportInput] = useState('');
  const [deployAfterImport, setDeployAfterImport] = useState(true);
  const [selectedAdapter, setSelectedAdapter] = useState('*');
  const [scope, setScope] = useState<'project' | 'global'>('project');
  const [mode, setMode] = useState<'copy' | 'symlink'>('symlink');

  const discoverMutation = useMutation({
    mutationFn: () => apiPost<DiscoverResponse>('/discover', { query })
  });

  const sourcesQuery = useQuery({
    queryKey: ['discover-sources'],
    queryFn: () => apiGet<DiscoverySourcesResponse>('/discover/sources')
  });

  const adaptersQuery = useQuery({
    queryKey: ['adapters'],
    queryFn: () => apiGet<AdaptersResponse>('/adapters')
  });

  const enabledAdapters = useMemo(
    () => (adaptersQuery.data?.adapters ?? []).filter((adapter) => adapter.isEnabled),
    [adaptersQuery.data]
  );

  const importMutation = useMutation({
    mutationFn: async () => {
      const normalized = importInput.trim();
      if (!normalized) {
        throw new Error('Enter a local bundle path or a supported URL before importing.');
      }

      const imported = await apiPost<ImportResponse>('/skills/import', {
        path: normalized,
        sourceType: normalized.startsWith('http') ? 'url' : 'path',
        sourceLocator: normalized
      });

      if (!deployAfterImport) {
        return { imported };
      }

      const deployed = await apiPost<DeployResponse>(`/skills/${imported.skillId}/deploy`, {
        adapter: selectedAdapter,
        scope,
        mode
      });
      return { imported, deployed };
    }
  });

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    discoverMutation.mutate();
  };

  const onImport = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    importMutation.mutate();
  };

  return (
    <PageShell
      title="Discover & Import"
      subtitle="Discover skills across ecosystems, import locally, and always scan + receipt before any deploy."
    >
      <h3>Common Discovery Sources</h3>
      <div className="card-grid">
        {(sourcesQuery.data?.sources ?? []).map((source) => (
          <article key={source.id} className="record-card">
            <h3>{source.label}</h3>
            <p className="table-subtle">{source.description}</p>
            <p><a href={source.url} target="_blank" rel="noreferrer">{source.url}</a></p>
            <p className="table-subtle">{source.importHint}</p>
            <button className="button secondary" type="button" onClick={() => setImportInput(source.url)}>
              Use URL
            </button>
          </article>
        ))}
      </div>

      <h3>Search skills.sh</h3>
      <form onSubmit={onSearch} className="row">
        <label className="sr-only" htmlFor="discover-query">
          Search query
        </label>
        <input
          id="discover-query"
          className="input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search skills"
        />
        <button className="button tertiary" type="submit">
          {discoverMutation.isPending ? 'Searching...' : 'Search'}
        </button>
      </form>

      {discoverMutation.data?.results?.length ? (
        <table className="table">
          <thead>
            <tr>
              <th>Install Ref</th>
              <th>Installs</th>
              <th>URL</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {discoverMutation.data.results.map((row) => (
              <tr key={row.installRef}>
                <td><code>{row.installRef}</code></td>
                <td>{row.installs ?? '-'}</td>
                <td>
                  {row.url
                    ? <a href={row.url} target="_blank" rel="noreferrer">{row.url}</a>
                    : <span>-</span>}
                </td>
                <td>
                  <button
                    className="button secondary"
                    type="button"
                    disabled={!row.url}
                    onClick={() => setImportInput(row.url)}
                  >
                    Import URL
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <h3>Import and Optional Deploy</h3>
      <div className="record-card">
        <h3>Security-first flow</h3>
        <p>SkillVault imports locally, runs deterministic security scanning, writes trust receipts, then allows controlled deployment.</p>
        <p className="table-subtle">Scan for security always, especially before cross-tool rollout.</p>
      </div>
      <form onSubmit={onImport} className="form-grid">
        <label className="field">
          URL or Local Path
          <input
            className="input"
            value={importInput}
            onChange={(event) => setImportInput(event.target.value)}
            placeholder="https://skills.sh/... or /absolute/path/to/bundle"
          />
        </label>

        <label className="toggle-row">
          <input
            type="checkbox"
            checked={deployAfterImport}
            onChange={(event) => setDeployAfterImport(event.target.checked)}
          />
          Deploy immediately after successful import + scan
        </label>

        {deployAfterImport ? (
          <div className="card-grid">
            <label className="field">
              Adapter
              <select className="select" value={selectedAdapter} onChange={(event) => setSelectedAdapter(event.target.value)}>
                <option value="*">All enabled adapters</option>
                {enabledAdapters.map((adapter) => (
                  <option key={adapter.id} value={adapter.id}>
                    {adapter.displayName}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              Scope
              <select className="select" value={scope} onChange={(event) => setScope(event.target.value as 'project' | 'global')}>
                <option value="project">Project</option>
                <option value="global">Global</option>
              </select>
            </label>

            <label className="field">
              Mode
              <select className="select" value={mode} onChange={(event) => setMode(event.target.value as 'copy' | 'symlink')}>
                <option value="symlink">Symlink</option>
                <option value="copy">Copy</option>
              </select>
            </label>
          </div>
        ) : null}

        <button className="button" type="submit">
          {importMutation.isPending ? 'Running import...' : deployAfterImport ? 'Import and Deploy' : 'Import'}
        </button>
      </form>

      {importMutation.error ? <p className="error-copy">{String(importMutation.error)}</p> : null}
      {importMutation.data ? <pre className="record-card">{JSON.stringify(importMutation.data, null, 2)}</pre> : null}
    </PageShell>
  );
}
