import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PageShell } from '../components/PageShell.js';
import { apiGet, apiPost } from '../services/http.js';

interface DatasetResponse {
  datasets: Array<{ id: string; name: string; description: string | null }>;
}

interface EvalRunResponse {
  run: {
    id: string;
    datasetId: string;
    score: number;
    status: string;
  };
  comparison?: {
    baselineRunId: string;
    delta: number;
    regressed: boolean;
  };
  regressionFailed: boolean;
}

export function EvalsPage() {
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [baselineRunId, setBaselineRunId] = useState('');
  const queryClient = useQueryClient();

  const datasetsQuery = useQuery({
    queryKey: ['eval-datasets'],
    queryFn: () => apiGet<DatasetResponse>('/evals/datasets')
  });

  const seedMutation = useMutation({
    mutationFn: () => apiPost<{ datasetId: string; caseCount: number }>('/evals/datasets/seed', {}),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['eval-datasets'] });
      setSelectedDatasetId(data.datasetId);
    }
  });

  const runMutation = useMutation({
    mutationFn: () => {
      if (!selectedDatasetId) {
        throw new Error('Select or seed a dataset before running eval.');
      }
      return apiPost<EvalRunResponse>('/evals/runs', {
        datasetId: selectedDatasetId,
        baselineRunId: baselineRunId || undefined,
        failOnRegression: false
      });
    }
  });

  const datasets = datasetsQuery.data?.datasets ?? [];
  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === selectedDatasetId),
    [datasets, selectedDatasetId]
  );

  return (
    <PageShell title="Evals" subtitle="Run deterministic regression checks and compare score deltas before rollout.">
      <div className="row">
        <button className="button secondary" type="button" onClick={() => seedMutation.mutate()}>
          {seedMutation.isPending ? 'Seeding...' : 'Seed Default Dataset'}
        </button>
        {seedMutation.data ? <span className="tag pass">Seeded {seedMutation.data.caseCount} cases</span> : null}
      </div>

      <div className="form-grid">
        <label className="field">
          Dataset
          <select className="select" value={selectedDatasetId} onChange={(event) => setSelectedDatasetId(event.target.value)}>
            <option value="">Select dataset</option>
            {datasets.map((dataset) => (
              <option key={dataset.id} value={dataset.id}>{dataset.name}</option>
            ))}
          </select>
        </label>

        <label className="field">
          Baseline Run Id (Optional)
          <input
            className="input"
            value={baselineRunId}
            onChange={(event) => setBaselineRunId(event.target.value)}
            placeholder="previous-run-id"
          />
        </label>

        <button className="button" type="button" onClick={() => runMutation.mutate()}>
          {runMutation.isPending ? 'Running...' : 'Run Eval'}
        </button>
      </div>

      {selectedDataset ? (
        <div className="record-card">
          <h3>{selectedDataset.name}</h3>
          <p>{selectedDataset.description ?? 'No description provided.'}</p>
        </div>
      ) : null}

      {runMutation.data ? (
        <div className="record-card">
          <h3>Latest Run</h3>
          <p><strong>Run:</strong> <code>{runMutation.data.run.id}</code></p>
          <p><strong>Status:</strong> {runMutation.data.run.status}</p>
          <p><strong>Score:</strong> {runMutation.data.run.score}</p>
          {runMutation.data.comparison ? (
            <p>
              <strong>Delta:</strong> {runMutation.data.comparison.delta} ({runMutation.data.comparison.regressed ? 'regressed' : 'improved'})
            </p>
          ) : null}
        </div>
      ) : null}
    </PageShell>
  );
}

