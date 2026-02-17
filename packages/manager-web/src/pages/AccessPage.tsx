import type { FormEvent } from 'react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PageShell } from '../components/PageShell.js';
import { apiGet, apiPost, setApiToken } from '../services/http.js';

interface MeResponse {
  authMode: 'off' | 'required';
  session: {
    principalId: string;
    roleName: string;
  } | null;
}

interface RolesResponse {
  roles: Array<{ id: string; name: string; description: string | null; permissions: string[] }>;
}

interface CreateTokenResponse {
  principalId: string;
  roleName: string;
  label: string;
  token: string;
}

export function AccessPage() {
  const [localToken, setLocalToken] = useState('');
  const [principalId, setPrincipalId] = useState('local-admin');
  const [roleName, setRoleName] = useState<'admin' | 'operator' | 'viewer'>('viewer');
  const [label, setLabel] = useState('ui-generated');
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: () => apiGet<MeResponse>('/me')
  });

  const rolesQuery = useQuery({
    queryKey: ['rbac-roles'],
    queryFn: () => apiGet<RolesResponse>('/rbac/roles')
  });

  const createTokenMutation = useMutation({
    mutationFn: () => apiPost<CreateTokenResponse>('/auth/tokens', {
      principalId,
      roleName,
      label
    }),
    onSuccess: async (data) => {
      setLocalToken(data.token);
      setApiToken(data.token);
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    }
  });

  const onApplyToken = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setApiToken(localToken.trim().length > 0 ? localToken.trim() : null);
    void queryClient.invalidateQueries({ queryKey: ['me'] });
  };

  const mode = meQuery.data?.authMode ?? 'off';

  return (
    <PageShell title="Access" subtitle="RBAC and token controls for secure admin workflows, including deploy risk overrides.">
      <div className="card-grid">
        <article className="metric-card">
          <div className="metric-title">Auth Mode</div>
          <div className="metric-value">{mode}</div>
        </article>
        <article className="metric-card">
          <div className="metric-title">Session Principal</div>
          <div className="metric-value">{meQuery.data?.session?.principalId ?? 'anonymous'}</div>
        </article>
        <article className="metric-card">
          <div className="metric-title">Session Role</div>
          <div className="metric-value">{meQuery.data?.session?.roleName ?? 'n/a'}</div>
        </article>
      </div>

      <h3>Apply Token</h3>
      <form onSubmit={onApplyToken} className="row">
        <input
          className="input"
          value={localToken}
          onChange={(event) => setLocalToken(event.target.value)}
          placeholder="Paste bearer token"
        />
        <button className="button secondary" type="submit">Use Token</button>
      </form>

      <h3>Create Token</h3>
      <div className="form-grid">
        <label className="field">
          Principal
          <input className="input" value={principalId} onChange={(event) => setPrincipalId(event.target.value)} />
        </label>
        <label className="field">
          Role
          <select className="select" value={roleName} onChange={(event) => setRoleName(event.target.value as 'admin' | 'operator' | 'viewer')}>
            <option value="viewer">viewer</option>
            <option value="operator">operator</option>
            <option value="admin">admin</option>
          </select>
        </label>
        <label className="field">
          Label
          <input className="input" value={label} onChange={(event) => setLabel(event.target.value)} />
        </label>
        <button className="button tertiary" type="button" onClick={() => createTokenMutation.mutate()}>
          {createTokenMutation.isPending ? 'Creating...' : 'Create Token'}
        </button>
      </div>

      <h3>Roles</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Role</th>
            <th>Description</th>
            <th>Permissions</th>
          </tr>
        </thead>
        <tbody>
          {(rolesQuery.data?.roles ?? []).map((role) => (
            <tr key={role.id}>
              <td><code>{role.name}</code></td>
              <td>{role.description ?? '-'}</td>
              <td>{role.permissions.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {createTokenMutation.data ? (
        <pre className="record-card">{JSON.stringify(createTokenMutation.data, null, 2)}</pre>
      ) : null}
    </PageShell>
  );
}
