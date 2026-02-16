import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

import { PageShell } from '../components/PageShell.js';
import { apiGet, apiPost } from '../services/http.js';

interface SkillItem {
  id: string;
  name: string;
}

interface SkillsResponse {
  skills: SkillItem[];
}

interface AdaptersResponse {
  adapters: Array<{ id: string; displayName: string; isEnabled: boolean }>;
}

export function DeployPage() {
  const [selectedSkill, setSelectedSkill] = useState('');
  const [selectedAdapter, setSelectedAdapter] = useState('*');
  const [scope, setScope] = useState<'project' | 'global'>('project');
  const [mode, setMode] = useState<'copy' | 'symlink'>('symlink');

  const skillsQuery = useQuery({
    queryKey: ['skills'],
    queryFn: () => apiGet<SkillsResponse>('/skills')
  });
  const adaptersQuery = useQuery({
    queryKey: ['adapters'],
    queryFn: () => apiGet<AdaptersResponse>('/adapters')
  });

  const enabledAdapters = useMemo(
    () => (adaptersQuery.data?.adapters ?? []).filter((adapter) => adapter.isEnabled),
    [adaptersQuery.data]
  );

  const deployMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSkill) {
        throw new Error('Select a skill before deploying.');
      }
      return apiPost(`/skills/${selectedSkill}/deploy`, {
        adapter: selectedAdapter,
        scope,
        mode
      });
    }
  });

  const undeployMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSkill) {
        throw new Error('Select a skill before undeploying.');
      }
      return apiPost(`/skills/${selectedSkill}/undeploy`, {
        adapter: selectedAdapter,
        scope
      });
    }
  });

  const onDeploy = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    deployMutation.mutate();
  };

  return (
    <PageShell title="Deploy Flow" subtitle="Choose a version, adapter targets, scope, and install mode with immediate deployment feedback.">
      <form onSubmit={onDeploy} className="form-grid">
        <label className="field">
          Skill
          <select className="select" value={selectedSkill} onChange={(event) => setSelectedSkill(event.target.value)}>
            <option value="">Select skill</option>
            {(skillsQuery.data?.skills ?? []).map((skill) => (
              <option key={skill.id} value={skill.id}>
                {skill.name}
              </option>
            ))}
          </select>
        </label>

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

        <div className="row">
          <button className="button" type="submit">
            {deployMutation.isPending ? 'Deploying...' : 'Deploy'}
          </button>
          <button
            className="button tertiary"
            type="button"
            onClick={() => undeployMutation.mutate()}
          >
            {undeployMutation.isPending ? 'Removing...' : 'Undeploy'}
          </button>
        </div>
      </form>

      <div className="record-card">
        <h3>Preview</h3>
        <p>
          Deploy <strong>{selectedSkill || '[skill]'}</strong> to <strong>{selectedAdapter}</strong> using <strong>{scope}</strong> scope and{' '}
          <strong>{mode}</strong> mode.
        </p>
      </div>

      {deployMutation.error ? <p className="error-copy">{String(deployMutation.error)}</p> : null}
      {undeployMutation.error ? <p className="error-copy">{String(undeployMutation.error)}</p> : null}
      {deployMutation.data ? <pre className="record-card">{JSON.stringify(deployMutation.data, null, 2)}</pre> : null}
      {undeployMutation.data ? <pre className="record-card">{JSON.stringify(undeployMutation.data, null, 2)}</pre> : null}
    </PageShell>
  );
}
