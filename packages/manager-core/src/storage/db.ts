import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';

import type { AdapterSpec, DeploymentRecord, SkillRecord, SkillVersionRecord, TrustVerdict } from '../adapters/types.js';

function readMigrationSql(): string[] {
  const candidates = [
    new URL('./migrations/', import.meta.url),
    new URL('../../src/storage/migrations/', import.meta.url)
  ];
  for (const candidate of candidates) {
    try {
      const dirPath = fileURLToPath(candidate);
      const migrationFiles = fs.readdirSync(dirPath)
        .filter((name) => /^\d+_.+\.sql$/.test(name))
        .sort((a, b) => a.localeCompare(b));
      if (migrationFiles.length === 0) {
        continue;
      }
      return migrationFiles.map((fileName) => fs.readFileSync(path.join(dirPath, fileName), 'utf8'));
    } catch {
      // Try next candidate.
    }
  }
  throw new Error('Unable to locate migration files');
}

const MIGRATION_SQL = readMigrationSql();

export interface SkillRow {
  id: string;
  name: string;
  description: string | null;
  source_type: string;
  source_locator: string | null;
  created_at: string;
  updated_at: string;
}

export interface SkillVersionRow {
  id: string;
  skill_id: string;
  version_hash: string;
  manifest_path: string | null;
  bundle_sha256: string;
  created_at: string;
  is_current: number;
}

export interface AdapterRow {
  id: string;
  display_name: string;
  project_path: string;
  global_path: string;
  is_enabled: number;
  metadata_json: string;
  updated_at: string;
}

export interface CurrentSkillInventoryRow {
  id: string;
  name: string;
  description: string | null;
  source_type: string;
  source_locator: string | null;
  skill_version_id: string;
  version_hash: string;
  version_created_at: string;
  bundle_sha256: string;
  risk_total: number | null;
  verdict: TrustVerdict | null;
}

export interface ScanRunRow {
  id: string;
  skill_version_id: string;
  risk_total: number;
  verdict: TrustVerdict;
  findings_json: string;
  scanner_version: string;
  created_at: string;
}

export interface ReceiptRow {
  id: string;
  skill_version_id: string;
  receipt_path: string;
  signature_alg: string | null;
  key_id: string | null;
  payload_sha256: string | null;
  created_at: string;
}

export interface TelemetryEventRow {
  id: string;
  event_type: string;
  source: string;
  subject_type: string;
  subject_id: string | null;
  details_json: string;
  outbox_status: 'pending' | 'retry' | 'sent' | 'dead_letter' | 'skipped';
  export_target: string | null;
  attempt_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
}

export interface EvalDatasetRow {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface EvalCaseRow {
  id: string;
  dataset_id: string;
  case_key: string;
  input_json: string;
  expected_json: string;
  weight: number;
  created_at: string;
}

export interface EvalRunRow {
  id: string;
  dataset_id: string;
  baseline_run_id: string | null;
  status: 'running' | 'completed' | 'failed';
  score: number;
  summary_json: string;
  created_at: string;
  completed_at: string | null;
}

export interface EvalResultRow {
  id: string;
  run_id: string;
  case_id: string;
  status: 'pass' | 'fail';
  score: number;
  details_json: string;
  created_at: string;
}

export interface PrincipalRow {
  id: string;
  name: string;
  type: 'user' | 'service';
  created_at: string;
  updated_at: string;
}

export interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  permissions_json: string;
  created_at: string;
  updated_at: string;
}

export interface ApiTokenRow {
  id: string;
  principal_id: string;
  label: string;
  role_name: string;
  token_hash: string;
  is_active: number;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

export class SkillVaultDb {
  readonly db: Database.Database;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  migrate(): void {
    for (const sql of MIGRATION_SQL) {
      this.db.exec(sql);
    }
  }

  close(): void {
    this.db.close();
  }

  upsertAdapters(specs: AdapterSpec[], updatedAt: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO adapters (id, display_name, project_path, global_path, is_enabled, metadata_json, updated_at)
      VALUES (@id, @display_name, @project_path, @global_path, COALESCE((SELECT is_enabled FROM adapters WHERE id=@id), 1), @metadata_json, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        display_name=excluded.display_name,
        project_path=excluded.project_path,
        global_path=excluded.global_path,
        metadata_json=excluded.metadata_json,
        updated_at=excluded.updated_at
    `);

    const tx = this.db.transaction((rows: AdapterSpec[]) => {
      for (const row of rows) {
        stmt.run({
          id: row.id,
          display_name: row.displayName,
          project_path: row.projectPath,
          global_path: row.globalPath,
          metadata_json: JSON.stringify({
            detectionPaths: row.detectionPaths,
            manifestFilenames: row.manifestFilenames,
            supportsSymlink: row.supportsSymlink,
            supportsGlobal: row.supportsGlobal,
            notes: row.notes ?? null
          }),
          updated_at: updatedAt
        });
      }
    });
    tx(specs);
  }

  listAdapters(): AdapterRow[] {
    return this.db.prepare('SELECT * FROM adapters ORDER BY id').all() as AdapterRow[];
  }

  setAdapterEnabled(id: string, enabled: boolean, updatedAt: string): void {
    this.db.prepare('UPDATE adapters SET is_enabled = ?, updated_at = ? WHERE id = ?').run(enabled ? 1 : 0, updatedAt, id);
  }

  insertSkill(row: SkillRow): void {
    this.db.prepare(`
      INSERT INTO skills (id, name, description, source_type, source_locator, created_at, updated_at)
      VALUES (@id, @name, @description, @source_type, @source_locator, @created_at, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,
        description=excluded.description,
        source_type=excluded.source_type,
        source_locator=excluded.source_locator,
        updated_at=excluded.updated_at
    `).run(row);
  }

  insertSkillVersion(row: SkillVersionRow): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO skill_versions
      (id, skill_id, version_hash, manifest_path, bundle_sha256, created_at, is_current)
      VALUES (@id, @skill_id, @version_hash, @manifest_path, @bundle_sha256, @created_at, @is_current)
    `).run(row);
  }

  setCurrentVersion(skillId: string, versionId: string): void {
    const tx = this.db.transaction(() => {
      this.db.prepare('UPDATE skill_versions SET is_current = 0 WHERE skill_id = ?').run(skillId);
      this.db.prepare('UPDATE skill_versions SET is_current = 1 WHERE id = ?').run(versionId);
    });
    tx();
  }

  insertScanRun(row: ScanRunRow): void {
    this.db.prepare(`
      INSERT INTO scan_runs (id, skill_version_id, risk_total, verdict, findings_json, scanner_version, created_at)
      VALUES (@id, @skill_version_id, @risk_total, @verdict, @findings_json, @scanner_version, @created_at)
    `).run(row);
  }

  insertReceipt(row: ReceiptRow): void {
    this.db.prepare(`
      INSERT INTO receipts (id, skill_version_id, receipt_path, signature_alg, key_id, payload_sha256, created_at)
      VALUES (@id, @skill_version_id, @receipt_path, @signature_alg, @key_id, @payload_sha256, @created_at)
    `).run(row);
  }

  insertDeployment(row: {
    id: string;
    skill_version_id: string;
    adapter_id: string;
    install_scope: string;
    installed_path: string;
    install_mode: string;
    status: string;
    deployed_at: string;
    drift_status: string;
  }): void {
    this.db.prepare(`
      INSERT INTO deployments (id, skill_version_id, adapter_id, install_scope, installed_path, install_mode, status, deployed_at, drift_status)
      VALUES (@id, @skill_version_id, @adapter_id, @install_scope, @installed_path, @install_mode, @status, @deployed_at, @drift_status)
    `).run(row);
  }

  insertAuditEvent(row: { id: string; event_type: string; subject_type: string; subject_id: string | null; details_json: string; created_at: string }): void {
    this.db.prepare(`
      INSERT INTO audit_events (id, event_type, subject_type, subject_id, details_json, created_at)
      VALUES (@id, @event_type, @subject_type, @subject_id, @details_json, @created_at)
    `).run(row);
  }

  insertTelemetryEvent(row: TelemetryEventRow): void {
    this.db.prepare(`
      INSERT INTO telemetry_events (
        id, event_type, source, subject_type, subject_id, details_json,
        outbox_status, export_target, attempt_count, last_error,
        created_at, updated_at, sent_at
      ) VALUES (
        @id, @event_type, @source, @subject_type, @subject_id, @details_json,
        @outbox_status, @export_target, @attempt_count, @last_error,
        @created_at, @updated_at, @sent_at
      )
    `).run(row);
  }

  listTelemetryEvents(limit = 100): TelemetryEventRow[] {
    return this.db.prepare(`
      SELECT *
      FROM telemetry_events
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit) as TelemetryEventRow[];
  }

  getTelemetryEventById(id: string): TelemetryEventRow | undefined {
    return this.db.prepare(`
      SELECT *
      FROM telemetry_events
      WHERE id = ?
      LIMIT 1
    `).get(id) as TelemetryEventRow | undefined;
  }

  listTelemetryOutbox(statuses: Array<TelemetryEventRow['outbox_status']>, limit = 100): TelemetryEventRow[] {
    if (statuses.length === 0) return [];
    const placeholders = statuses.map(() => '?').join(', ');
    return this.db.prepare(`
      SELECT *
      FROM telemetry_events
      WHERE outbox_status IN (${placeholders})
      ORDER BY created_at ASC
      LIMIT ?
    `).all(...statuses, limit) as TelemetryEventRow[];
  }

  telemetryStatusCounts(): Record<string, number> {
    const rows = this.db.prepare(`
      SELECT outbox_status AS status, COUNT(*) AS count
      FROM telemetry_events
      GROUP BY outbox_status
    `).all() as Array<{ status: string; count: number }>;
    const out: Record<string, number> = {};
    for (const row of rows) {
      out[row.status] = row.count;
    }
    return out;
  }

  updateTelemetryEventStatus(row: {
    id: string;
    outbox_status: TelemetryEventRow['outbox_status'];
    export_target: string | null;
    attempt_count: number;
    last_error: string | null;
    updated_at: string;
    sent_at: string | null;
  }): void {
    this.db.prepare(`
      UPDATE telemetry_events
      SET outbox_status = @outbox_status,
          export_target = @export_target,
          attempt_count = @attempt_count,
          last_error = @last_error,
          updated_at = @updated_at,
          sent_at = @sent_at
      WHERE id = @id
    `).run(row);
  }

  upsertEvalDataset(row: EvalDatasetRow): void {
    this.db.prepare(`
      INSERT INTO eval_datasets (id, name, description, created_at, updated_at)
      VALUES (@id, @name, @description, @created_at, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        updated_at = excluded.updated_at
    `).run(row);
  }

  listEvalDatasets(): EvalDatasetRow[] {
    return this.db.prepare(`
      SELECT *
      FROM eval_datasets
      ORDER BY created_at DESC
    `).all() as EvalDatasetRow[];
  }

  getEvalDatasetById(id: string): EvalDatasetRow | undefined {
    return this.db.prepare(`
      SELECT *
      FROM eval_datasets
      WHERE id = ?
      LIMIT 1
    `).get(id) as EvalDatasetRow | undefined;
  }

  upsertEvalCase(row: EvalCaseRow): void {
    this.db.prepare(`
      INSERT INTO eval_cases (id, dataset_id, case_key, input_json, expected_json, weight, created_at)
      VALUES (@id, @dataset_id, @case_key, @input_json, @expected_json, @weight, @created_at)
      ON CONFLICT(dataset_id, case_key) DO UPDATE SET
        input_json = excluded.input_json,
        expected_json = excluded.expected_json,
        weight = excluded.weight
    `).run(row);
  }

  listEvalCases(datasetId: string): EvalCaseRow[] {
    return this.db.prepare(`
      SELECT *
      FROM eval_cases
      WHERE dataset_id = ?
      ORDER BY case_key ASC
    `).all(datasetId) as EvalCaseRow[];
  }

  insertEvalRun(row: EvalRunRow): void {
    this.db.prepare(`
      INSERT INTO eval_runs (id, dataset_id, baseline_run_id, status, score, summary_json, created_at, completed_at)
      VALUES (@id, @dataset_id, @baseline_run_id, @status, @score, @summary_json, @created_at, @completed_at)
    `).run(row);
  }

  updateEvalRun(row: {
    id: string;
    status: EvalRunRow['status'];
    score: number;
    summary_json: string;
    completed_at: string | null;
  }): void {
    this.db.prepare(`
      UPDATE eval_runs
      SET status = @status,
          score = @score,
          summary_json = @summary_json,
          completed_at = @completed_at
      WHERE id = @id
    `).run(row);
  }

  getEvalRunById(id: string): EvalRunRow | undefined {
    return this.db.prepare(`
      SELECT *
      FROM eval_runs
      WHERE id = ?
      LIMIT 1
    `).get(id) as EvalRunRow | undefined;
  }

  listEvalRuns(datasetId: string): EvalRunRow[] {
    return this.db.prepare(`
      SELECT *
      FROM eval_runs
      WHERE dataset_id = ?
      ORDER BY created_at DESC
    `).all(datasetId) as EvalRunRow[];
  }

  insertEvalResult(row: EvalResultRow): void {
    this.db.prepare(`
      INSERT INTO eval_results (id, run_id, case_id, status, score, details_json, created_at)
      VALUES (@id, @run_id, @case_id, @status, @score, @details_json, @created_at)
      ON CONFLICT(run_id, case_id) DO UPDATE SET
        status = excluded.status,
        score = excluded.score,
        details_json = excluded.details_json
    `).run(row);
  }

  listEvalResults(runId: string): EvalResultRow[] {
    return this.db.prepare(`
      SELECT *
      FROM eval_results
      WHERE run_id = ?
      ORDER BY created_at ASC
    `).all(runId) as EvalResultRow[];
  }

  upsertPrincipal(row: PrincipalRow): void {
    this.db.prepare(`
      INSERT INTO principals (id, name, type, created_at, updated_at)
      VALUES (@id, @name, @type, @created_at, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        type = excluded.type,
        updated_at = excluded.updated_at
    `).run(row);
  }

  getPrincipalById(id: string): PrincipalRow | undefined {
    return this.db.prepare(`
      SELECT *
      FROM principals
      WHERE id = ?
      LIMIT 1
    `).get(id) as PrincipalRow | undefined;
  }

  upsertRole(row: RoleRow): void {
    this.db.prepare(`
      INSERT INTO roles (id, name, description, permissions_json, created_at, updated_at)
      VALUES (@id, @name, @description, @permissions_json, @created_at, @updated_at)
      ON CONFLICT(name) DO UPDATE SET
        description = excluded.description,
        permissions_json = excluded.permissions_json,
        updated_at = excluded.updated_at
    `).run(row);
  }

  listRoles(): RoleRow[] {
    return this.db.prepare(`
      SELECT *
      FROM roles
      ORDER BY name ASC
    `).all() as RoleRow[];
  }

  getRoleByName(name: string): RoleRow | undefined {
    return this.db.prepare(`
      SELECT *
      FROM roles
      WHERE name = ?
      LIMIT 1
    `).get(name) as RoleRow | undefined;
  }

  assignPrincipalRole(row: { id: string; principal_id: string; role_id: string; created_at: string }): void {
    this.db.prepare(`
      INSERT INTO principal_roles (id, principal_id, role_id, created_at)
      VALUES (@id, @principal_id, @role_id, @created_at)
      ON CONFLICT(principal_id, role_id) DO NOTHING
    `).run(row);
  }

  insertApiToken(row: ApiTokenRow): void {
    this.db.prepare(`
      INSERT INTO api_tokens (
        id, principal_id, label, role_name, token_hash, is_active, created_at, last_used_at, expires_at
      ) VALUES (
        @id, @principal_id, @label, @role_name, @token_hash, @is_active, @created_at, @last_used_at, @expires_at
      )
    `).run(row);
  }

  getActiveTokenByHash(tokenHash: string, nowIso: string): ApiTokenRow | undefined {
    return this.db.prepare(`
      SELECT *
      FROM api_tokens
      WHERE token_hash = ?
        AND is_active = 1
        AND (expires_at IS NULL OR expires_at > ?)
      LIMIT 1
    `).get(tokenHash, nowIso) as ApiTokenRow | undefined;
  }

  touchApiToken(id: string, lastUsedAt: string): void {
    this.db.prepare(`
      UPDATE api_tokens
      SET last_used_at = ?
      WHERE id = ?
    `).run(lastUsedAt, id);
  }

  getCurrentSkillVersion(skillId: string): SkillVersionRow | undefined {
    return this.db.prepare('SELECT * FROM skill_versions WHERE skill_id = ? AND is_current = 1 LIMIT 1').get(skillId) as SkillVersionRow | undefined;
  }

  getCurrentSkillInventory(skillId: string): CurrentSkillInventoryRow | undefined {
    return this.db.prepare(`
      SELECT s.id, s.name, s.description, s.source_type, s.source_locator,
             sv.id AS skill_version_id,
             sv.version_hash,
             sv.created_at AS version_created_at,
             sv.bundle_sha256,
             sr.risk_total, sr.verdict
      FROM skills s
      JOIN skill_versions sv ON sv.skill_id = s.id AND sv.is_current = 1
      LEFT JOIN scan_runs sr ON sr.id = (
        SELECT sr2.id FROM scan_runs sr2
        WHERE sr2.skill_version_id = sv.id
        ORDER BY sr2.created_at DESC
        LIMIT 1
      )
      WHERE s.id = ?
      LIMIT 1
    `).get(skillId) as CurrentSkillInventoryRow | undefined;
  }

  listCurrentSkills(): CurrentSkillInventoryRow[] {
    return this.db.prepare(`
      SELECT s.id, s.name, s.description, s.source_type, s.source_locator,
             sv.id AS skill_version_id,
             sv.version_hash,
             sv.created_at AS version_created_at,
             sv.bundle_sha256,
             sr.risk_total, sr.verdict
      FROM skills s
      JOIN skill_versions sv ON sv.skill_id = s.id AND sv.is_current = 1
      LEFT JOIN scan_runs sr ON sr.id = (
        SELECT sr2.id FROM scan_runs sr2
        WHERE sr2.skill_version_id = sv.id
        ORDER BY sr2.created_at DESC
        LIMIT 1
      )
      ORDER BY s.name
    `).all() as CurrentSkillInventoryRow[];
  }

  listSkillVersions(skillId: string): SkillVersionRow[] {
    return this.db.prepare(`
      SELECT *
      FROM skill_versions
      WHERE skill_id = ?
      ORDER BY created_at DESC
    `).all(skillId) as SkillVersionRow[];
  }

  getLatestScanForVersion(skillVersionId: string): ScanRunRow | undefined {
    return this.db.prepare(`
      SELECT *
      FROM scan_runs
      WHERE skill_version_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(skillVersionId) as ScanRunRow | undefined;
  }

  listReceiptsForVersion(skillVersionId: string): ReceiptRow[] {
    return this.db.prepare(`
      SELECT *
      FROM receipts
      WHERE skill_version_id = ?
      ORDER BY created_at DESC
    `).all(skillVersionId) as ReceiptRow[];
  }

  listDeployments(): Array<DeploymentRecord & { skillName: string; skillId: string; versionHash: string }> {
    return this.db.prepare(`
      SELECT d.id,
             d.skill_version_id AS skillVersionId,
             d.adapter_id AS adapterId,
             d.install_scope AS installScope,
             d.installed_path AS installedPath,
             d.install_mode AS installMode,
             d.status,
             d.deployed_at AS deployedAt,
             d.drift_status AS driftStatus,
             s.name AS skillName,
             s.id AS skillId,
             sv.version_hash AS versionHash
      FROM deployments d
      JOIN skill_versions sv ON sv.id = d.skill_version_id
      JOIN skills s ON s.id = sv.skill_id
      ORDER BY d.deployed_at DESC
    `).all() as Array<DeploymentRecord & { skillName: string; skillId: string; versionHash: string }>;
  }

  listDeploymentsForSkill(skillId: string): DeploymentRecord[] {
    return this.db.prepare(`
      SELECT d.id,
             d.skill_version_id AS skillVersionId,
             d.adapter_id AS adapterId,
             d.install_scope AS installScope,
             d.installed_path AS installedPath,
             d.install_mode AS installMode,
             d.status,
             d.deployed_at AS deployedAt,
             d.drift_status AS driftStatus
      FROM deployments d
      JOIN skill_versions sv ON sv.id = d.skill_version_id
      WHERE sv.skill_id = ?
      ORDER BY d.deployed_at DESC
    `).all(skillId) as DeploymentRecord[];
  }

  listActiveDeployments(): Array<{ id: string; installedPath: string }> {
    return this.db.prepare(`
      SELECT id, installed_path AS installedPath
      FROM deployments
      WHERE status = 'deployed'
      ORDER BY deployed_at DESC
    `).all() as Array<{ id: string; installedPath: string }>;
  }

  updateDeploymentDrift(id: string, driftStatus: 'in_sync' | 'drifted' | 'missing_path'): void {
    this.db.prepare('UPDATE deployments SET drift_status = ? WHERE id = ?').run(driftStatus, id);
  }

  mapSkillRow(row: SkillRow): SkillRecord {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      sourceType: row.source_type,
      sourceLocator: row.source_locator,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  mapSkillVersionRow(row: SkillVersionRow): SkillVersionRecord {
    return {
      id: row.id,
      skillId: row.skill_id,
      versionHash: row.version_hash,
      manifestPath: row.manifest_path,
      bundleSha256: row.bundle_sha256,
      createdAt: row.created_at,
      isCurrent: row.is_current === 1
    };
  }
}
