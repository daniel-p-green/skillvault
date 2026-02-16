import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import type { TelemetryEvent, TelemetryOutboxStatus } from '../adapters/types.js';
import { SkillVaultDb, type TelemetryEventRow } from '../storage/db.js';

interface RecordTelemetryInput {
  eventType: string;
  source: string;
  subjectType: string;
  subjectId?: string | null;
  details?: Record<string, unknown>;
}

export interface TelemetryStatusReport {
  totals: {
    total: number;
    pending: number;
    retry: number;
    sent: number;
    dead_letter: number;
    skipped: number;
  };
  latest: TelemetryEvent[];
}

export interface TelemetryFlushReport {
  target: 'jsonl' | 'weave';
  processed: number;
  sent: number;
  retried: number;
  deadLetter: number;
  outputPath?: string;
}

function rowToTelemetryEvent(row: TelemetryEventRow): TelemetryEvent {
  return {
    id: row.id,
    eventType: row.event_type,
    source: row.source,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    details: JSON.parse(row.details_json) as Record<string, unknown>,
    outboxStatus: row.outbox_status,
    exportTarget: row.export_target,
    attemptCount: row.attempt_count,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sentAt: row.sent_at
  };
}

export class TelemetryService {
  constructor(
    private readonly db: SkillVaultDb,
    private readonly outboxDir: string,
    private readonly nowIso: () => string = () => new Date().toISOString()
  ) {}

  private async persistOutboxFile(event: TelemetryEvent): Promise<void> {
    await fs.mkdir(this.outboxDir, { recursive: true });
    const outboxPath = path.join(this.outboxDir, `${event.createdAt.slice(0, 10)}-${event.id}.json`);
    await fs.writeFile(outboxPath, `${JSON.stringify(event, null, 2)}\n`, 'utf8');
  }

  async record(input: RecordTelemetryInput): Promise<TelemetryEvent> {
    const now = this.nowIso();
    const row: TelemetryEventRow = {
      id: randomUUID(),
      event_type: input.eventType,
      source: input.source,
      subject_type: input.subjectType,
      subject_id: input.subjectId ?? null,
      details_json: JSON.stringify(input.details ?? {}),
      outbox_status: 'pending',
      export_target: null,
      attempt_count: 0,
      last_error: null,
      created_at: now,
      updated_at: now,
      sent_at: null
    };
    this.db.insertTelemetryEvent(row);
    const event = rowToTelemetryEvent(row);
    await this.persistOutboxFile(event);
    return event;
  }

  status(limit = 25): TelemetryStatusReport {
    const counts = this.db.telemetryStatusCounts();
    const latest = this.db.listTelemetryEvents(limit).map(rowToTelemetryEvent);
    return {
      totals: {
        total: Object.values(counts).reduce((sum, value) => sum + value, 0),
        pending: counts.pending ?? 0,
        retry: counts.retry ?? 0,
        sent: counts.sent ?? 0,
        dead_letter: counts.dead_letter ?? 0,
        skipped: counts.skipped ?? 0
      },
      latest
    };
  }

  private setStatus(
    row: TelemetryEventRow,
    status: TelemetryOutboxStatus,
    target: 'jsonl' | 'weave',
    opts?: { error?: string | null; sentAt?: string | null }
  ): void {
    this.db.updateTelemetryEventStatus({
      id: row.id,
      outbox_status: status,
      export_target: target,
      attempt_count: row.attempt_count + 1,
      last_error: opts?.error ?? null,
      updated_at: this.nowIso(),
      sent_at: opts?.sentAt ?? null
    });
  }

  async flushJsonl(maxEvents = 100): Promise<TelemetryFlushReport> {
    const rows = this.db.listTelemetryOutbox(['pending', 'retry'], maxEvents);
    if (rows.length === 0) {
      return { target: 'jsonl', processed: 0, sent: 0, retried: 0, deadLetter: 0 };
    }

    await fs.mkdir(this.outboxDir, { recursive: true });
    const outputPath = path.join(this.outboxDir, `flush-${this.nowIso().replace(/[:.]/g, '-')}.jsonl`);
    const lines = rows.map((row) => JSON.stringify(rowToTelemetryEvent(row)));
    await fs.writeFile(outputPath, `${lines.join('\n')}\n`, 'utf8');

    const sentAt = this.nowIso();
    for (const row of rows) {
      this.setStatus(row, 'sent', 'jsonl', { sentAt });
    }

    return {
      target: 'jsonl',
      processed: rows.length,
      sent: rows.length,
      retried: 0,
      deadLetter: 0,
      outputPath
    };
  }

  listOutbox(maxEvents = 100): TelemetryEvent[] {
    return this.db.listTelemetryOutbox(['pending', 'retry'], maxEvents).map(rowToTelemetryEvent);
  }

  markRetry(eventId: string, target: 'jsonl' | 'weave', error: string): TelemetryOutboxStatus | null {
    const row = this.db.getTelemetryEventById(eventId);
    if (!row) return null;
    const nextStatus: TelemetryOutboxStatus = row.attempt_count >= 4 ? 'dead_letter' : 'retry';
    this.setStatus(row, nextStatus, target, { error, sentAt: null });
    return nextStatus;
  }

  markSent(eventId: string, target: 'jsonl' | 'weave'): boolean {
    const row = this.db.getTelemetryEventById(eventId);
    if (!row) return false;
    this.setStatus(row, 'sent', target, { sentAt: this.nowIso() });
    return true;
  }
}
