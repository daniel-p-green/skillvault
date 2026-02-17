import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PageShell } from '../components/PageShell.js';
import { apiGet, apiPost } from '../services/http.js';

interface TelemetryStatusResponse {
  totals: {
    total: number;
    pending: number;
    retry: number;
    sent: number;
    dead_letter: number;
    skipped: number;
  };
  latest: Array<{
    id: string;
    eventType: string;
    source: string;
    subjectType: string;
    outboxStatus: string;
    createdAt: string;
  }>;
}

interface FlushResponse {
  target: 'jsonl' | 'weave';
  processed: number;
  sent: number;
  retried: number;
  deadLetter: number;
  outputPath?: string;
}

export function TelemetryPage() {
  const [target, setTarget] = useState<'jsonl' | 'weave'>('jsonl');
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: ['telemetry-status'],
    queryFn: () => apiGet<TelemetryStatusResponse>('/telemetry/status')
  });

  const flushMutation = useMutation({
    mutationFn: () => apiPost<FlushResponse>('/telemetry/flush', { target, maxEvents: 100 }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['telemetry-status'] });
    }
  });

  const totals = statusQuery.data?.totals;

  return (
    <PageShell
      title="Telemetry"
      subtitle="Track benchmark, scan, and deploy events with local-first outbox visibility and optional export."
    >
      <div className="card-grid">
        <article className="metric-card">
          <div className="metric-title">Total Events</div>
          <div className="metric-value">{totals?.total ?? 0}</div>
        </article>
        <article className="metric-card">
          <div className="metric-title">Pending / Retry</div>
          <div className="metric-value">{totals?.pending ?? 0} / {totals?.retry ?? 0}</div>
        </article>
        <article className="metric-card">
          <div className="metric-title">Sent</div>
          <div className="metric-value">{totals?.sent ?? 0}</div>
        </article>
        <article className="metric-card">
          <div className="metric-title">Dead Letter</div>
          <div className="metric-value">{totals?.dead_letter ?? 0}</div>
        </article>
      </div>

      <div className="row">
        <label className="field">
          Flush Target
          <select className="select" value={target} onChange={(event) => setTarget(event.target.value as 'jsonl' | 'weave')}>
            <option value="jsonl">jsonl</option>
            <option value="weave">weave</option>
          </select>
        </label>
        <button className="button secondary" type="button" onClick={() => flushMutation.mutate()}>
          {flushMutation.isPending ? 'Flushing...' : 'Flush Outbox'}
        </button>
      </div>

      {flushMutation.data ? (
        <pre className="record-card">{JSON.stringify(flushMutation.data, null, 2)}</pre>
      ) : null}

      <h3>Latest Events</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Event</th>
            <th>Source</th>
            <th>Subject</th>
            <th>Status</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {(statusQuery.data?.latest ?? []).map((event) => (
            <tr key={event.id}>
              <td><code>{event.eventType}</code></td>
              <td>{event.source}</td>
              <td>{event.subjectType}</td>
              <td>{event.outboxStatus}</td>
              <td>{event.createdAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </PageShell>
  );
}
