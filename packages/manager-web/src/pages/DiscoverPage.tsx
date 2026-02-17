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

const DISCOVERY_PRESETS = [
  { id: 'benchmark', label: 'Benchmark-ready skills', query: 'benchmark eval deterministic verifier skill' },
  { id: 'security', label: 'Security-focused skills', query: 'security scanner policy receipt verification' },
  { id: 'automation', label: 'Cross-tool automation', query: 'multi tool workflow automation codex cursor claude' },
  { id: 'docs', label: 'Documentation helpers', query: 'docs changelog release notes markdown' }
] as const;

const DISCOVERY_PLAYBOOKS = [
  {
    id: 'standardize',
    title: 'Standardize prompts across coding tools',
    detail: 'Discover one candidate skill, import locally, then deploy through selected adapters after trust checks.'
  },
  {
    id: 'safety',
    title: 'Screen community skills before rollout',
    detail: 'Use URL import for discovery, require checklist confirmation, and rely on deterministic scan + receipt artifacts.'
  },
  {
    id: 'measure',
    title: 'Validate impact before broad rollout',
    detail: 'Run benchmark mode with no_skill, curated_skill, and self_generated_skill before shipping to multiple tools.'
  }
] as const;

const URL_SECURITY_CHECKLIST = [
  { id: 'reviewedSource', label: 'I reviewed the source repository and maintainer trust signals.' },
  { id: 'reviewedCapabilities', label: 'I understand which commands, prompts, or tool actions this skill can trigger.' },
  { id: 'confirmedPolicy', label: 'I will only deploy after deterministic scan findings and receipt verification.' }
] as const;

type UrlChecklistState = Record<(typeof URL_SECURITY_CHECKLIST)[number]['id'], boolean>;

export function DiscoverPage() {
  const [query, setQuery] = useState('skill manager');
  const [importInput, setImportInput] = useState('');
  const [deployAfterImport, setDeployAfterImport] = useState(true);
  const [selectedAdapter, setSelectedAdapter] = useState('*');
  const [scope, setScope] = useState<'project' | 'global'>('project');
  const [mode, setMode] = useState<'copy' | 'symlink'>('symlink');
  const [urlChecklist, setUrlChecklist] = useState<UrlChecklistState>({
    reviewedSource: false,
    reviewedCapabilities: false,
    confirmedPolicy: false
  });

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

  const trimmedImportInput = importInput.trim();
  const isUrlImport = /^https?:\/\//i.test(trimmedImportInput);
  const checklistComplete = URL_SECURITY_CHECKLIST.every((item) => urlChecklist[item.id]);
  const importBlockedByChecklist = isUrlImport && !checklistComplete;

  const importMutation = useMutation({
    mutationFn: async () => {
      const normalized = importInput.trim();
      if (!normalized) {
        throw new Error('Enter a local bundle path or a supported URL before importing.');
      }
      if (/^https?:\/\//i.test(normalized) && !URL_SECURITY_CHECKLIST.every((item) => urlChecklist[item.id])) {
        throw new Error('Complete the URL import security checklist before importing from remote discovery sources.');
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

  const toggleChecklistItem = (id: keyof UrlChecklistState) => {
    setUrlChecklist((current) => ({ ...current, [id]: !current[id] }));
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
            <p><a className="touch-link" href={source.url} target="_blank" rel="noreferrer">{source.url}</a></p>
            <p className="table-subtle">{source.importHint}</p>
            <button className="button secondary" type="button" onClick={() => setImportInput(source.url)}>
              Use URL
            </button>
          </article>
        ))}
      </div>

      <h3>Discovery Intent Presets</h3>
      <div className="row">
        {DISCOVERY_PRESETS.map((preset) => (
          <button
            key={preset.id}
            className={`chip ${query === preset.query ? 'active' : ''}`}
            type="button"
            onClick={() => setQuery(preset.query)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <h3>Discovery Playbooks</h3>
      <div className="card-grid">
        {DISCOVERY_PLAYBOOKS.map((playbook) => (
          <article key={playbook.id} className="record-card">
            <h3>{playbook.title}</h3>
            <p>{playbook.detail}</p>
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
                    ? <a className="touch-link" href={row.url} target="_blank" rel="noreferrer">{row.url}</a>
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

      <div className="record-card">
        <h3>URL Import Security Checklist</h3>
        <p className="table-subtle">Remote discovery is powerful, but only imported URLs require this checklist before execution.</p>
        <div className="form-grid">
          {URL_SECURITY_CHECKLIST.map((item) => (
            <label key={item.id} className="toggle-row">
              <input
                type="checkbox"
                checked={urlChecklist[item.id]}
                onChange={() => toggleChecklistItem(item.id)}
              />
              {item.label}
            </label>
          ))}
        </div>
        {isUrlImport ? (
          <p className="table-subtle">
            {checklistComplete
              ? 'Checklist complete. URL import is ready for deterministic scan + receipt.'
              : 'Checklist incomplete. URL import remains blocked until all items are confirmed.'}
          </p>
        ) : (
          <p className="table-subtle">Local path imports still run deterministic scan + receipt, but checklist confirmation is optional.</p>
        )}
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

        <button className="button" type="submit" disabled={importMutation.isPending || importBlockedByChecklist || !trimmedImportInput}>
          {importMutation.isPending ? 'Running import...' : deployAfterImport ? 'Import and Deploy' : 'Import'}
        </button>
      </form>

      {importBlockedByChecklist ? (
        <p className="error-copy">
          URL import is blocked until the security checklist is complete.
        </p>
      ) : null}
      {importMutation.error ? <p className="error-copy">{String(importMutation.error)}</p> : null}
      {importMutation.data ? <pre className="record-card">{JSON.stringify(importMutation.data, null, 2)}</pre> : null}
    </PageShell>
  );
}
