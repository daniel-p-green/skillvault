import type { FormEvent } from 'react';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { PageShell } from '../components/PageShell.js';
import { apiPost } from '../services/http.js';

interface DiscoverResponse {
  results: Array<{ installRef: string; installs?: number; url: string }>;
}

export function DiscoverPage() {
  const [query, setQuery] = useState('skill manager');
  const [importPath, setImportPath] = useState('');

  const discoverMutation = useMutation({
    mutationFn: () => apiPost<DiscoverResponse>('/discover', { query })
  });

  const importMutation = useMutation({
    mutationFn: () => apiPost('/skills/import', { path: importPath })
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
    <PageShell title="Discover" subtitle="Query skills.sh, shortlist useful entries, and import trusted bundles into your local vault.">
      <form onSubmit={onSearch} className="row">
        <input
          className="input"
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
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <h3>Import Bundle</h3>
      <form onSubmit={onImport} className="row">
        <input
          className="input"
          value={importPath}
          onChange={(event) => setImportPath(event.target.value)}
          placeholder="/absolute/path/to/bundle or bundle.zip"
        />
        <button className="button" type="submit">
          {importMutation.isPending ? 'Importing...' : 'Import'}
        </button>
      </form>

      {importMutation.error ? <p className="error-copy">{String(importMutation.error)}</p> : null}
      {importMutation.data ? <pre className="record-card">{JSON.stringify(importMutation.data, null, 2)}</pre> : null}
    </PageShell>
  );
}
