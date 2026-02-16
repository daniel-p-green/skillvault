import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';

import type { AdapterSpec, DeploymentRecord, SkillRecord, SkillVersionRecord, TrustVerdict } from '../adapters/types.js';

function readMigration001(): string {
  const candidates = [
    new URL('./migrations/001_initial.sql', import.meta.url),
    new URL('../../src/storage/migrations/001_initial.sql', import.meta.url)
  ];
  for (const candidate of candidates) {
    try {
      return fs.readFileSync(fileURLToPath(candidate), 'utf8');
    } catch {
      // Try next candidate.
    }
  }
  throw new Error('Unable to locate migration file: 001_initial.sql');
}

const MIGRATION_001 = readMigration001();

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

export class SkillVaultDb {
  readonly db: Database.Database;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  migrate(): void {
    this.db.exec(MIGRATION_001);
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
