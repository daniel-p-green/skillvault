import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import AdmZip from 'adm-zip';

import { BUILTIN_ADAPTERS } from '../adapters/builtin.js';
import type {
  AdapterSpec,
  AuditSummary,
  DeploymentRecord,
  DeploymentResult,
  DiscoveryResult,
  InstallMode,
  InstallScope,
  SkillVersionRecord,
  TrustVerdict
} from '../adapters/types.js';
import { SkillVaultDb } from '../storage/db.js';
import { comparePathBytes, computeBundleSha256, sha256Hex } from '../utils/hash.js';

const execFileAsync = promisify(execFile);
const MANIFEST_FILENAMES = ['SKILL.md', 'skill.md'];

interface BundleFile {
  path: string;
  bytes: Uint8Array;
}

export interface ManagerImportResult {
  skillId: string;
  versionId: string;
  versionHash: string;
  receiptPath: string;
  riskTotal: number;
  verdict: TrustVerdict;
}

export interface InventoryQuery {
  risk?: TrustVerdict;
  adapter?: string;
  search?: string;
}

export interface InventoryRecord {
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

export interface SkillDetailRecord {
  skill: InventoryRecord;
  versions: SkillVersionRecord[];
  latestScan: {
    id: string;
    risk_total: number;
    verdict: TrustVerdict;
    findings: Array<{ code: string; severity: 'warn' | 'error'; message: string }>;
    scanner_version: string;
    created_at: string;
  } | null;
  receipts: Array<{
    id: string;
    receipt_path: string;
    signature_alg: string | null;
    key_id: string | null;
    payload_sha256: string | null;
    created_at: string;
  }>;
  deployments: DeploymentRecord[];
}

export interface SyncDiscoveryRecord {
  adapterId: string;
  scope: InstallScope;
  installedPath: string;
  skillId: string;
}

export class SkillVaultManager {
  readonly rootDir: string;
  readonly skillVaultDir: string;
  readonly dbPath: string;
  readonly vaultDir: string;
  readonly receiptsDir: string;
  readonly exportDir: string;
  readonly overridesPath: string;
  readonly db: SkillVaultDb;

  constructor(rootDir = process.cwd()) {
    this.rootDir = path.resolve(rootDir);
    this.skillVaultDir = path.join(this.rootDir, '.skillvault');
    this.dbPath = path.join(this.skillVaultDir, 'skillvault.db');
    this.vaultDir = path.join(this.skillVaultDir, 'vault');
    this.receiptsDir = path.join(this.skillVaultDir, 'receipts');
    this.exportDir = path.join(this.skillVaultDir, 'export');
    this.overridesPath = path.join(this.skillVaultDir, 'adapters-overrides.json');
    this.db = new SkillVaultDb(this.dbPath);
  }

  async init(): Promise<{ root: string; dbPath: string }> {
    await fs.mkdir(this.skillVaultDir, { recursive: true });
    await fs.mkdir(this.vaultDir, { recursive: true });
    await fs.mkdir(this.receiptsDir, { recursive: true });
    await fs.mkdir(this.exportDir, { recursive: true });
    await this.syncAdapterSnapshot();
    return { root: this.rootDir, dbPath: this.dbPath };
  }

  async close(): Promise<void> {
    this.db.close();
  }

  private nowIso(): string {
    return new Date().toISOString();
  }

  private normalizeSkillId(raw: string): string {
    const candidate = raw.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
    return candidate || `skill-${randomUUID().slice(0, 8)}`;
  }

  private riskToVerdict(riskTotal: number): TrustVerdict {
    if (riskTotal >= 60) return 'FAIL';
    if (riskTotal >= 30) return 'WARN';
    return 'PASS';
  }

  private async readAdapterOverrides(): Promise<AdapterSpec[]> {
    try {
      const raw = await fs.readFile(this.overridesPath, 'utf8');
      const parsed = JSON.parse(raw) as AdapterSpec[];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((item) => typeof item?.id === 'string');
    } catch {
      return [];
    }
  }

  private async writeAdapterOverrides(overrides: AdapterSpec[]): Promise<void> {
    await fs.mkdir(path.dirname(this.overridesPath), { recursive: true });
    await fs.writeFile(this.overridesPath, JSON.stringify(overrides, null, 2) + '\n', 'utf8');
  }

  private mergeAdapters(base: AdapterSpec[], overrides: AdapterSpec[]): AdapterSpec[] {
    const map = new Map(base.map((adapter) => [adapter.id, adapter]));
    for (const override of overrides) {
      map.set(override.id, { ...override });
    }
    return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  async syncAdapterSnapshot(): Promise<{ total: number }> {
    const overrides = await this.readAdapterOverrides();
    const adapters = this.mergeAdapters(BUILTIN_ADAPTERS, overrides);
    this.db.upsertAdapters(adapters, this.nowIso());
    return { total: adapters.length };
  }

  listAdapters(): Array<AdapterSpec & { isEnabled: boolean }> {
    return this.db.listAdapters().map((row) => {
      const meta = JSON.parse(row.metadata_json) as Record<string, unknown>;
      return {
        id: row.id,
        displayName: row.display_name,
        projectPath: row.project_path,
        globalPath: row.global_path,
        detectionPaths: Array.isArray(meta.detectionPaths) ? (meta.detectionPaths as string[]) : [],
        manifestFilenames: Array.isArray(meta.manifestFilenames) ? (meta.manifestFilenames as string[]) : [...MANIFEST_FILENAMES],
        supportsSymlink: Boolean(meta.supportsSymlink),
        supportsGlobal: Boolean(meta.supportsGlobal),
        notes: typeof meta.notes === 'string' ? meta.notes : undefined,
        isEnabled: row.is_enabled === 1
      };
    });
  }

  setAdapterEnabled(id: string, enabled: boolean): { id: string; enabled: boolean } {
    this.db.setAdapterEnabled(id, enabled, this.nowIso());
    return { id, enabled };
  }

  async addAdapterOverride(spec: AdapterSpec): Promise<{ id: string }> {
    const overrides = await this.readAdapterOverrides();
    const filtered = overrides.filter((entry) => entry.id !== spec.id);
    filtered.push(spec);
    await this.writeAdapterOverrides(filtered.sort((a, b) => a.id.localeCompare(b.id)));
    await this.syncAdapterSnapshot();
    return { id: spec.id };
  }

  private expandUserPath(inputPath: string): string {
    if (inputPath.startsWith('~/')) {
      return path.join(os.homedir(), inputPath.slice(2));
    }
    return inputPath;
  }

  validateAdapterPaths(): Array<{ adapterId: string; issue: string }> {
    const issues: Array<{ adapterId: string; issue: string }> = [];
    for (const adapter of this.listAdapters()) {
      if (!adapter.projectPath || adapter.projectPath.trim().length === 0) {
        issues.push({ adapterId: adapter.id, issue: 'projectPath is empty' });
      } else if (path.isAbsolute(adapter.projectPath)) {
        issues.push({ adapterId: adapter.id, issue: 'projectPath must be relative' });
      }

      if (!adapter.globalPath || adapter.globalPath.trim().length === 0) {
        issues.push({ adapterId: adapter.id, issue: 'globalPath is empty' });
      }

      if (!Array.isArray(adapter.detectionPaths) || adapter.detectionPaths.length === 0) {
        issues.push({ adapterId: adapter.id, issue: 'detectionPaths is empty' });
      }

      if (!adapter.manifestFilenames.some((name) => MANIFEST_FILENAMES.includes(name))) {
        issues.push({ adapterId: adapter.id, issue: 'manifestFilenames must include SKILL.md or skill.md' });
      }
    }
    return issues;
  }

  private ensureSafeRelativePath(entryPath: string): string {
    const normalized = entryPath.replace(/\\/g, '/').replace(/^\//, '');
    if (normalized.includes('\0')) {
      throw new Error(`Invalid entry path: ${entryPath}`);
    }
    const parts = normalized.split('/');
    if (parts.some((segment) => segment === '..' || segment === '')) {
      throw new Error(`Unsafe entry path: ${entryPath}`);
    }
    return normalized;
  }

  private async readBundleInput(bundlePathOrZip: string): Promise<BundleFile[]> {
    const stat = await fs.stat(bundlePathOrZip);
    if (stat.isDirectory()) {
      const out: BundleFile[] = [];
      await this.walkDirectory(bundlePathOrZip, bundlePathOrZip, out);
      return out.sort((a, b) => comparePathBytes(a.path, b.path));
    }

    if (!bundlePathOrZip.toLowerCase().endsWith('.zip')) {
      throw new Error(`Unsupported bundle input: ${bundlePathOrZip}`);
    }

    const zip = new AdmZip(bundlePathOrZip);
    return zip
      .getEntries()
      .filter((entry) => !entry.isDirectory)
      .map((entry) => ({
        path: this.ensureSafeRelativePath(entry.entryName),
        bytes: entry.getData()
      }))
      .sort((a, b) => comparePathBytes(a.path, b.path));
  }

  private async walkDirectory(root: string, dir: string, out: BundleFile[]): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.walkDirectory(root, full, out);
      } else if (entry.isFile()) {
        const rel = this.ensureSafeRelativePath(path.relative(root, full).split(path.sep).join('/'));
        out.push({ path: rel, bytes: await fs.readFile(full) });
      }
    }
  }

  private parseManifestFrontmatter(manifestText: string): { name?: string; description?: string } {
    const trimmed = manifestText.trimStart();
    if (!trimmed.startsWith('---')) {
      return {};
    }

    const lines = trimmed.split(/\r?\n/);
    if (lines[0] !== '---') {
      return {};
    }

    const frontmatter: Record<string, string> = {};
    for (let idx = 1; idx < lines.length; idx += 1) {
      const line = lines[idx];
      if (line === '---') break;
      const match = /^([a-zA-Z0-9_-]+):\s*(.*)$/.exec(line);
      if (match) {
        frontmatter[match[1]] = match[2];
      }
    }

    return {
      name: frontmatter.name,
      description: frontmatter.description
    };
  }

  async importSkill(bundlePathOrZip: string, opts?: { sourceType?: string; sourceLocator?: string }): Promise<ManagerImportResult> {
    const files = await this.readBundleInput(bundlePathOrZip);
    const fileHashes = files.map((file) => ({
      path: file.path,
      size: file.bytes.byteLength,
      sha256: sha256Hex(file.bytes)
    }));

    const manifestCandidates = fileHashes.filter((file) => MANIFEST_FILENAMES.includes(file.path));
    const findings: Array<{ code: string; severity: 'warn' | 'error'; message: string }> = [];
    if (manifestCandidates.length !== 1) {
      findings.push({
        code: 'CONSTRAINT_MANIFEST_COUNT',
        severity: 'error',
        message: `Expected exactly one manifest; found ${manifestCandidates.length}`
      });
    }

    const manifestPath = manifestCandidates[0]?.path;
    const manifestFile = manifestPath ? files.find((file) => file.path === manifestPath) : undefined;
    const manifestText = manifestFile ? Buffer.from(manifestFile.bytes).toString('utf8') : '';
    const parsedManifest = this.parseManifestFrontmatter(manifestText);
    const inferredName = parsedManifest.name || path.basename(bundlePathOrZip, path.extname(bundlePathOrZip));
    const skillId = this.normalizeSkillId(inferredName);

    const versionHash = computeBundleSha256(fileHashes.map((entry) => ({ path: entry.path, sha256: entry.sha256 })));
    const versionId = `${skillId}:${versionHash.slice(0, 16)}`;

    const riskTotal = findings.some((finding) => finding.severity === 'error') ? 100 : 0;
    const verdict = this.riskToVerdict(riskTotal);

    const skillVersionDir = path.join(this.vaultDir, skillId, versionHash);
    await fs.mkdir(skillVersionDir, { recursive: true });
    for (const file of files) {
      const fullPath = path.join(skillVersionDir, ...file.path.split('/'));
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, Buffer.from(file.bytes));
    }

    const now = this.nowIso();
    this.db.insertSkill({
      id: skillId,
      name: inferredName,
      description: parsedManifest.description ?? null,
      source_type: opts?.sourceType ?? 'path',
      source_locator: opts?.sourceLocator ?? bundlePathOrZip,
      created_at: now,
      updated_at: now
    });

    this.db.insertSkillVersion({
      id: versionId,
      skill_id: skillId,
      version_hash: versionHash,
      manifest_path: manifestPath ?? null,
      bundle_sha256: versionHash,
      created_at: now,
      is_current: 1
    });
    this.db.setCurrentVersion(skillId, versionId);

    this.db.insertScanRun({
      id: randomUUID(),
      skill_version_id: versionId,
      risk_total: riskTotal,
      verdict,
      findings_json: JSON.stringify(findings),
      scanner_version: 'manager-core.v0.2',
      created_at: now
    });

    const receiptId = randomUUID();
    const receiptPath = path.join(this.receiptsDir, `${receiptId}.json`);
    const receiptBody = {
      schema_version: 'skillvault.manager.receipt.v1',
      receipt_id: receiptId,
      created_at: now,
      skill_id: skillId,
      version_id: versionId,
      version_hash: versionHash,
      files: fileHashes,
      risk_total: riskTotal,
      verdict,
      findings
    };

    await fs.writeFile(receiptPath, JSON.stringify(receiptBody, null, 2) + '\n', 'utf8');
    this.db.insertReceipt({
      id: receiptId,
      skill_version_id: versionId,
      receipt_path: receiptPath,
      signature_alg: null,
      key_id: null,
      payload_sha256: null,
      created_at: now
    });

    this.db.insertAuditEvent({
      id: randomUUID(),
      event_type: 'skill.imported',
      subject_type: 'skill_version',
      subject_id: versionId,
      details_json: JSON.stringify({ source: opts?.sourceLocator ?? bundlePathOrZip }),
      created_at: now
    });

    return {
      skillId,
      versionId,
      versionHash,
      receiptPath,
      riskTotal,
      verdict
    };
  }

  inventory(query: InventoryQuery = {}): InventoryRecord[] {
    let rows = this.db.listCurrentSkills() as InventoryRecord[];
    if (query.risk) {
      rows = rows.filter((row) => row.verdict === query.risk);
    }
    if (query.search) {
      const q = query.search.toLowerCase();
      rows = rows.filter((row) => row.name.toLowerCase().includes(q)
        || row.id.toLowerCase().includes(q)
        || (row.description ?? '').toLowerCase().includes(q));
    }
    if (query.adapter) {
      const adapterFilter = query.adapter.toLowerCase();
      const deployments = this.db.listDeployments();
      const allowedSkillIds = new Set(
        deployments
          .filter((deployment) => deployment.adapterId.toLowerCase() === adapterFilter)
          .map((deployment) => deployment.skillId)
      );
      rows = rows.filter((row) => allowedSkillIds.has(row.id));
    }
    return rows;
  }

  getSkillDetail(skillId: string): SkillDetailRecord | undefined {
    const skill = this.db.getCurrentSkillInventory(skillId) as InventoryRecord | undefined;
    if (!skill) return undefined;

    const versions = this.db.listSkillVersions(skillId).map((row) => this.db.mapSkillVersionRow(row));
    const latestScanRow = this.db.getLatestScanForVersion(skill.skill_version_id);
    const latestScan = latestScanRow
      ? {
          id: latestScanRow.id,
          risk_total: latestScanRow.risk_total,
          verdict: latestScanRow.verdict,
          findings: JSON.parse(latestScanRow.findings_json) as Array<{ code: string; severity: 'warn' | 'error'; message: string }>,
          scanner_version: latestScanRow.scanner_version,
          created_at: latestScanRow.created_at
        }
      : null;
    const receipts = this.db.listReceiptsForVersion(skill.skill_version_id);
    const deployments = this.db.listDeploymentsForSkill(skillId);

    return {
      skill,
      versions,
      latestScan,
      receipts,
      deployments
    };
  }

  private resolveInstallBase(adapter: AdapterSpec & { isEnabled?: boolean }, scope: InstallScope): string {
    if (scope === 'project') {
      return path.join(this.rootDir, adapter.projectPath);
    }
    return this.expandUserPath(adapter.globalPath);
  }

  private async ensureCleanPath(targetPath: string): Promise<void> {
    const stat = await fs.lstat(targetPath).catch(() => null);
    if (!stat) return;
    await fs.rm(targetPath, { recursive: true, force: true });
  }

  private async copyDirectory(from: string, to: string): Promise<void> {
    await fs.mkdir(to, { recursive: true });
    const entries = await fs.readdir(from, { withFileTypes: true });
    for (const entry of entries) {
      const src = path.join(from, entry.name);
      const dst = path.join(to, entry.name);
      if (entry.isDirectory()) {
        await this.copyDirectory(src, dst);
      } else if (entry.isFile()) {
        await fs.copyFile(src, dst);
      }
    }
  }

  private getVersionDirectory(skillId: string, versionHash: string): string {
    return path.join(this.vaultDir, skillId, versionHash);
  }

  listDeployments(): Array<DeploymentRecord & { skillName: string; skillId: string; versionHash: string }> {
    return this.db.listDeployments();
  }

  private async hashDirectoryTree(rootDir: string): Promise<string> {
    const files: Array<{ path: string; sha256: string }> = [];
    const walk = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile()) {
          const relPath = path.relative(rootDir, fullPath).split(path.sep).join('/');
          const bytes = await fs.readFile(fullPath);
          files.push({ path: relPath, sha256: sha256Hex(bytes) });
        }
      }
    };

    await walk(rootDir);
    return computeBundleSha256(files.sort((a, b) => comparePathBytes(a.path, b.path)));
  }

  async deploy(skillId: string, opts: { adapter: string; scope: InstallScope; mode: InstallMode }): Promise<DeploymentResult[]> {
    const version = this.db.getCurrentSkillVersion(skillId);
    if (!version) {
      throw new Error(`Skill not found or has no current version: ${skillId}`);
    }

    const sourceDir = this.getVersionDirectory(skillId, version.version_hash);
    const sourceStat = await fs.stat(sourceDir).catch(() => null);
    if (!sourceStat?.isDirectory()) {
      throw new Error(`Version directory missing: ${sourceDir}`);
    }

    const adapters = this.listAdapters().filter((adapter) => adapter.isEnabled);
    const targets = opts.adapter === '*' ? adapters : adapters.filter((adapter) => adapter.id === opts.adapter);
    if (targets.length === 0) {
      throw new Error(`No enabled adapters matched: ${opts.adapter}`);
    }

    const results: DeploymentResult[] = [];
    const now = this.nowIso();

    for (const adapter of targets) {
      if (opts.scope === 'global' && !adapter.supportsGlobal) {
        results.push({
          adapterId: adapter.id,
          installedPath: '',
          installMode: opts.mode,
          scope: opts.scope,
          status: 'failed',
          message: 'Adapter does not support global scope.'
        });
        continue;
      }

      if (opts.mode === 'symlink' && !adapter.supportsSymlink) {
        results.push({
          adapterId: adapter.id,
          installedPath: '',
          installMode: opts.mode,
          scope: opts.scope,
          status: 'failed',
          message: 'Adapter does not support symlink installs.'
        });
        continue;
      }

      const installBase = this.resolveInstallBase(adapter, opts.scope);
      const installedPath = path.join(installBase, skillId);
      await fs.mkdir(installBase, { recursive: true });

      const current = await fs.lstat(installedPath).catch(() => null);
      if (current?.isSymbolicLink()) {
        const currentTarget = await fs.readlink(installedPath).catch(() => '');
        const resolvedTarget = path.resolve(path.dirname(installedPath), currentTarget);
        if (opts.mode === 'symlink' && resolvedTarget === sourceDir) {
          results.push({
            adapterId: adapter.id,
            installedPath,
            installMode: opts.mode,
            scope: opts.scope,
            status: 'skipped',
            message: 'Already deployed with matching symlink.'
          });
          continue;
        }
      }

      await this.ensureCleanPath(installedPath);
      if (opts.mode === 'symlink') {
        await fs.symlink(sourceDir, installedPath, 'dir');
      } else {
        await this.copyDirectory(sourceDir, installedPath);
      }

      this.db.insertDeployment({
        id: randomUUID(),
        skill_version_id: version.id,
        adapter_id: adapter.id,
        install_scope: opts.scope,
        installed_path: installedPath,
        install_mode: opts.mode,
        status: 'deployed',
        deployed_at: now,
        drift_status: 'in_sync'
      });

      this.db.insertAuditEvent({
        id: randomUUID(),
        event_type: 'skill.deployed',
        subject_type: 'skill_version',
        subject_id: version.id,
        details_json: JSON.stringify({ adapterId: adapter.id, scope: opts.scope, mode: opts.mode, installedPath }),
        created_at: now
      });

      results.push({
        adapterId: adapter.id,
        installedPath,
        installMode: opts.mode,
        scope: opts.scope,
        status: 'deployed'
      });
    }

    return results;
  }

  async undeploy(skillId: string, opts: { adapter: string; scope: InstallScope }): Promise<Array<{ adapterId: string; installedPath: string; removed: boolean }>> {
    const version = this.db.getCurrentSkillVersion(skillId);
    const adapters = this.listAdapters().filter((adapter) => adapter.isEnabled);
    const targets = opts.adapter === '*' ? adapters : adapters.filter((adapter) => adapter.id === opts.adapter);
    if (targets.length === 0) {
      throw new Error(`No enabled adapters matched: ${opts.adapter}`);
    }

    const results: Array<{ adapterId: string; installedPath: string; removed: boolean }> = [];
    const now = this.nowIso();

    for (const adapter of targets) {
      const installBase = this.resolveInstallBase(adapter, opts.scope);
      const installedPath = path.join(installBase, skillId);
      const exists = await fs.lstat(installedPath).catch(() => null);
      if (exists) {
        await fs.rm(installedPath, { recursive: true, force: true });
      }
      results.push({ adapterId: adapter.id, installedPath, removed: Boolean(exists) });

      if (version) {
        this.db.insertDeployment({
          id: randomUUID(),
          skill_version_id: version.id,
          adapter_id: adapter.id,
          install_scope: opts.scope,
          installed_path: installedPath,
          install_mode: 'copy',
          status: 'removed',
          deployed_at: now,
          drift_status: 'in_sync'
        });
      }

      this.db.insertAuditEvent({
        id: randomUUID(),
        event_type: 'skill.undeployed',
        subject_type: 'skill',
        subject_id: skillId,
        details_json: JSON.stringify({ adapterId: adapter.id, scope: opts.scope, removed: Boolean(exists) }),
        created_at: now
      });
    }

    return results;
  }

  async audit(staleDays = 14): Promise<AuditSummary> {
    const currentSkills = this.db.listCurrentSkills();
    const deployments = this.db.listDeployments();

    const staleCutoff = Date.now() - staleDays * 24 * 60 * 60 * 1000;
    const staleSkills = currentSkills
      .filter((row) => Date.parse(row.version_created_at) > 0 && Date.parse(row.version_created_at) < staleCutoff)
      .map((row) => ({
        id: row.skill_version_id,
        skillId: row.id,
        versionHash: row.version_hash,
        manifestPath: null,
        bundleSha256: row.bundle_sha256,
        createdAt: row.version_created_at,
        isCurrent: true
      }));

    const driftedDeployments: DeploymentRecord[] = [];
    for (const deployment of deployments) {
      const installedPath = deployment.installedPath;
      const exists = await fs.lstat(installedPath).catch(() => null);
      if (!exists) {
        this.db.updateDeploymentDrift(deployment.id, 'missing_path');
        driftedDeployments.push({ ...deployment, driftStatus: 'missing_path' });
        continue;
      }

      const expectedVersionDir = this.getVersionDirectory(deployment.skillId, deployment.versionHash);
      if (deployment.installMode === 'symlink') {
        const linkTarget = await fs.readlink(installedPath).catch(() => '');
        const resolved = path.resolve(path.dirname(installedPath), linkTarget);
        if (resolved !== expectedVersionDir) {
          this.db.updateDeploymentDrift(deployment.id, 'drifted');
          driftedDeployments.push({ ...deployment, driftStatus: 'drifted' });
          continue;
        }
      } else {
        const installedHash = await this.hashDirectoryTree(installedPath).catch(() => '');
        if (installedHash !== deployment.versionHash) {
          this.db.updateDeploymentDrift(deployment.id, 'drifted');
          driftedDeployments.push({ ...deployment, driftStatus: 'drifted' });
          continue;
        }
      }

      this.db.updateDeploymentDrift(deployment.id, 'in_sync');
    }

    return {
      totals: {
        skills: currentSkills.length,
        deployments: deployments.length,
        staleSkills: staleSkills.length,
        driftedDeployments: driftedDeployments.length
      },
      staleSkills,
      driftedDeployments
    };
  }

  async syncInstalledSkills(): Promise<{ discovered: SyncDiscoveryRecord[] }> {
    const discovered: SyncDiscoveryRecord[] = [];
    for (const adapter of this.listAdapters().filter((entry) => entry.isEnabled)) {
      const candidates: Array<{ scope: InstallScope; dir: string }> = [
        { scope: 'project', dir: path.join(this.rootDir, adapter.projectPath) },
        { scope: 'global', dir: this.expandUserPath(adapter.globalPath) }
      ];

      for (const candidate of candidates) {
        const stat = await fs.stat(candidate.dir).catch(() => null);
        if (!stat?.isDirectory()) continue;
        const children = await fs.readdir(candidate.dir, { withFileTypes: true });
        for (const child of children) {
          if (!child.isDirectory()) continue;
          const skillDir = path.join(candidate.dir, child.name);
          const manifestFound = await Promise.any(
            MANIFEST_FILENAMES.map((manifest) => fs.stat(path.join(skillDir, manifest)).then(() => true))
          ).catch(() => false);
          if (!manifestFound) continue;
          discovered.push({
            adapterId: adapter.id,
            scope: candidate.scope,
            installedPath: skillDir,
            skillId: child.name
          });
        }
      }
    }
    return { discovered };
  }

  async discover(query: string): Promise<DiscoveryResult[]> {
    const { stdout } = await execFileAsync('npx', ['skills', 'find', query], {
      maxBuffer: 10 * 1024 * 1024
    });
    const ansiStripped = stdout.replace(/\u001b\[[0-9;]*m/g, '');
    const lines = ansiStripped.split(/\r?\n/);
    const results: DiscoveryResult[] = [];

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim();
      if (!line) continue;

      const match = /^([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+@[a-zA-Z0-9_.-]+)(?:\s+(\d+)\s+installs?)?$/.exec(line);
      if (!match) continue;

      let url = '';
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j += 1) {
        const urlMatch = /https:\/\/skills\.sh\/\S+/.exec(lines[j]);
        if (urlMatch) {
          url = urlMatch[0];
          break;
        }
      }

      results.push({
        installRef: match[1],
        installs: match[2] ? Number(match[2]) : undefined,
        url
      });
    }

    return results;
  }
}
