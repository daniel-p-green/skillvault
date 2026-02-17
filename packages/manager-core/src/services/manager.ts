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
  ApiTokenRecord,
  AuditSummary,
  BenchConfigEntry,
  BenchRunListEntry,
  BenchRunServiceResult,
  DeployBlockedByTrustErrorShape,
  DeploymentRecord,
  DeploymentResult,
  DiscoveryResult,
  DiscoverySource,
  EvalCase,
  EvalDataset,
  EvalResult,
  EvalRun,
  FilesystemInventory,
  FilesystemInstallationRecord,
  FilesystemSkillRecord,
  InstallMode,
  InstallScope,
  Role,
  SkillVersionRecord,
  TrustVerdict
} from '../adapters/types.js';
import type { BenchReportOutput, BenchRunOutput } from '../bench/index.js';
import { SkillVaultDb } from '../storage/db.js';
import { comparePathBytes, computeBundleSha256, sha256Hex } from '../utils/hash.js';
import { TelemetryService } from './telemetryService.js';
import { WeaveExporter, weaveConfigFromEnv } from './weaveExporter.js';
import { AuthService, type AuthSession } from './authService.js';
import { BenchService } from './benchService.js';

const execFileAsync = promisify(execFile);
const MANIFEST_FILENAMES = ['SKILL.md', 'skill.md'];
const MAX_REMOTE_IMPORT_BYTES = 25 * 1024 * 1024;
const ALLOWED_REMOTE_HOSTS = new Set([
  'skills.sh',
  'www.skills.sh',
  'github.com',
  'codeload.github.com',
  'raw.githubusercontent.com',
  'gist.githubusercontent.com'
]);
const DISCOVERY_SOURCES: DiscoverySource[] = [
  {
    id: 'skills-sh',
    label: 'skills.sh',
    url: 'https://skills.sh',
    description: 'Cross-agent skill directory with install popularity and compatibility context.',
    importHint: 'Paste a skills.sh entry URL, then import and deploy.'
  },
  {
    id: 'github',
    label: 'GitHub',
    url: 'https://github.com',
    description: 'Public skill repositories and release artifacts.',
    importHint: 'Paste a GitHub repo URL or a direct .zip URL.'
  },
  {
    id: 'raw-github',
    label: 'Raw GitHub',
    url: 'https://raw.githubusercontent.com',
    description: 'Raw-hosted archives and manifest references.',
    importHint: 'Use direct archive URLs for deterministic import.'
  }
];
const DEFAULT_EVAL_DATASET_ID = 'default-manager-regression';
const DEFAULT_EVAL_CASES: Array<{
  key: string;
  input: Record<string, unknown>;
  expected: Record<string, unknown>;
  weight: number;
}> = [
  {
    key: 'inventory_non_negative',
    input: { metric: 'skills.count' },
    expected: { min: 0 },
    weight: 1
  },
  {
    key: 'adapters_available',
    input: { metric: 'adapters.count' },
    expected: { min: 1 },
    weight: 1
  },
  {
    key: 'telemetry_accessible',
    input: { metric: 'telemetry.total' },
    expected: { min: 0 },
    weight: 1
  }
];

interface BundleFile {
  path: string;
  bytes: Uint8Array;
}

interface ResolvedImportInput {
  localPath: string;
  sourceType: string;
  sourceLocator: string;
  cleanup: () => Promise<void>;
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

export interface EvalSeedResult {
  datasetId: string;
  caseCount: number;
}

export interface EvalRunReport {
  run: EvalRun;
  results: EvalResult[];
  comparison?: {
    baselineRunId: string;
    baselineScore: number;
    delta: number;
    regressed: boolean;
  };
  regressionFailed: boolean;
}

export class DeployBlockedByTrustError extends Error implements DeployBlockedByTrustErrorShape {
  readonly code = 'DEPLOY_BLOCKED_BY_TRUST' as const;
  readonly skillId: string;
  readonly verdict = 'FAIL' as const;
  readonly riskTotal: number;
  readonly overrideAllowed: boolean;
  readonly remediation: string;

  constructor(input: {
    skillId: string;
    riskTotal: number;
    overrideAllowed: boolean;
    remediation?: string;
    message?: string;
  }) {
    super(
      input.message ??
      `Deployment blocked for ${input.skillId}: latest trust verdict is FAIL (${input.riskTotal}).`
    );
    this.name = 'DeployBlockedByTrustError';
    this.skillId = input.skillId;
    this.riskTotal = input.riskTotal;
    this.overrideAllowed = input.overrideAllowed;
    this.remediation = input.remediation ?? 'Review scan findings and receipt metadata before deploying.';
  }
}

export class SkillVaultManager {
  readonly rootDir: string;
  readonly skillVaultDir: string;
  readonly dbPath: string;
  readonly vaultDir: string;
  readonly receiptsDir: string;
  readonly exportDir: string;
  readonly telemetryOutboxDir: string;
  readonly overridesPath: string;
  readonly db: SkillVaultDb;
  readonly telemetry: TelemetryService;
  readonly auth: AuthService;
  readonly bench: BenchService;

  constructor(rootDir = process.cwd()) {
    this.rootDir = path.resolve(rootDir);
    this.skillVaultDir = path.join(this.rootDir, '.skillvault');
    this.dbPath = path.join(this.skillVaultDir, 'skillvault.db');
    this.vaultDir = path.join(this.skillVaultDir, 'vault');
    this.receiptsDir = path.join(this.skillVaultDir, 'receipts');
    this.exportDir = path.join(this.skillVaultDir, 'export');
    this.telemetryOutboxDir = path.join(this.exportDir, 'telemetry-outbox');
    this.overridesPath = path.join(this.skillVaultDir, 'adapters-overrides.json');
    this.db = new SkillVaultDb(this.dbPath);
    this.telemetry = new TelemetryService(this.db, this.telemetryOutboxDir, () => this.nowIso());
    this.auth = new AuthService(this.db, () => this.nowIso());
    this.bench = new BenchService(this.rootDir, this.exportDir, () => this.nowIso());
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

  private async recordTelemetry(input: {
    eventType: string;
    subjectType: string;
    subjectId?: string | null;
    details?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.telemetry.record({
        eventType: input.eventType,
        source: 'manager-core',
        subjectType: input.subjectType,
        subjectId: input.subjectId ?? null,
        details: input.details ?? {}
      });
    } catch {
      // Telemetry should never interrupt manager operations.
    }
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
    const exists = this.listAdapters().some((adapter) => adapter.id === id);
    if (!exists) {
      throw new Error(`Adapter not found: ${id}`);
    }
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

  listDiscoverySources(): DiscoverySource[] {
    return DISCOVERY_SOURCES.map((source) => ({ ...source }));
  }

  private expandUserPath(inputPath: string): string {
    if (inputPath.startsWith('~/')) {
      return path.join(os.homedir(), inputPath.slice(2));
    }
    return inputPath;
  }

  private parseRemoteUrl(input: string): URL | null {
    try {
      const parsed = new URL(input);
      if (parsed.protocol !== 'https:') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private ensureAllowedRemoteUrl(remoteUrl: URL): void {
    if (!ALLOWED_REMOTE_HOSTS.has(remoteUrl.hostname)) {
      throw new Error(`Remote host is not allowlisted: ${remoteUrl.hostname}`);
    }
  }

  private inferSkillNameFromLocator(locator: string): string {
    const parsed = this.parseRemoteUrl(locator);
    if (!parsed) {
      return path.basename(locator, path.extname(locator));
    }

    const segments = parsed.pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1] ?? 'skill';
    return decodeURIComponent(last).replace(/\.zip$/i, '');
  }

  private async downloadRemoteZip(remoteUrl: URL): Promise<{ localPath: string; cleanup: () => Promise<void> }> {
    this.ensureAllowedRemoteUrl(remoteUrl);
    const response = await fetch(remoteUrl.toString());
    if (!response.ok) {
      throw new Error(`Remote download failed (${response.status}) for ${remoteUrl.toString()}`);
    }
    const finalUrl = this.parseRemoteUrl(response.url || remoteUrl.toString());
    if (!finalUrl) {
      throw new Error(`Remote download redirected to unsupported URL: ${response.url}`);
    }
    this.ensureAllowedRemoteUrl(finalUrl);

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_REMOTE_IMPORT_BYTES) {
      throw new Error(`Remote bundle exceeds ${MAX_REMOTE_IMPORT_BYTES} byte limit`);
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skillvault-import-url-'));
    const zipPath = path.join(tempDir, 'bundle.zip');
    await fs.writeFile(zipPath, bytes);
    return {
      localPath: zipPath,
      cleanup: async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    };
  }

  private async cloneGitHubRepo(remoteUrl: URL): Promise<{ localPath: string; cleanup: () => Promise<void> }> {
    this.ensureAllowedRemoteUrl(remoteUrl);
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skillvault-import-github-'));
    const repoDir = path.join(tempDir, 'repo');

    const parts = remoteUrl.pathname.split('/').filter(Boolean);
    const owner = parts[0];
    const repo = parts[1];
    if (!owner || !repo) {
      throw new Error(`Unsupported GitHub URL: ${remoteUrl.toString()}`);
    }

    let branch: string | undefined;
    let subPath = '';
    if ((parts[2] === 'tree' || parts[2] === 'blob') && parts[3]) {
      branch = parts[3];
      subPath = parts.slice(4).join('/');
    }

    const cloneUrl = `https://github.com/${owner}/${repo.replace(/\.git$/i, '')}.git`;
    const cloneArgs = ['clone', '--depth', '1'];
    if (branch) {
      cloneArgs.push('--branch', branch);
    }
    cloneArgs.push(cloneUrl, repoDir);
    await execFileAsync('git', cloneArgs, { maxBuffer: 10 * 1024 * 1024 });

    const localPath = subPath ? path.join(repoDir, subPath) : repoDir;
    return {
      localPath,
      cleanup: async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    };
  }

  private async resolveSkillsShUrl(remoteUrl: URL): Promise<URL | null> {
    this.ensureAllowedRemoteUrl(remoteUrl);
    const response = await fetch(remoteUrl.toString());
    if (!response.ok) return null;
    const html = await response.text();
    const githubMatch = html.match(/https:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(?:\/tree\/[a-zA-Z0-9_.-]+(?:\/[^\s"'<>]+)?)?/);
    if (!githubMatch) return null;
    const parsed = this.parseRemoteUrl(githubMatch[0]);
    return parsed ?? null;
  }

  private async resolveImportInput(bundlePathOrZip: string): Promise<ResolvedImportInput> {
    const remoteUrl = this.parseRemoteUrl(bundlePathOrZip);
    if (!remoteUrl) {
      const expanded = this.expandUserPath(bundlePathOrZip);
      return {
        localPath: path.resolve(expanded),
        sourceType: 'path',
        sourceLocator: path.resolve(expanded),
        cleanup: async () => {}
      };
    }

    this.ensureAllowedRemoteUrl(remoteUrl);
    const isZipLike = remoteUrl.pathname.toLowerCase().endsWith('.zip');
    if (isZipLike) {
      const downloaded = await this.downloadRemoteZip(remoteUrl);
      return {
        localPath: downloaded.localPath,
        sourceType: 'url',
        sourceLocator: remoteUrl.toString(),
        cleanup: downloaded.cleanup
      };
    }

    if (remoteUrl.hostname === 'skills.sh' || remoteUrl.hostname === 'www.skills.sh') {
      const githubUrl = await this.resolveSkillsShUrl(remoteUrl);
      if (!githubUrl) {
        throw new Error(`Could not resolve a GitHub source from skills.sh URL: ${remoteUrl.toString()}`);
      }
      const cloned = await this.cloneGitHubRepo(githubUrl);
      return {
        localPath: cloned.localPath,
        sourceType: 'url',
        sourceLocator: remoteUrl.toString(),
        cleanup: cloned.cleanup
      };
    }

    if (remoteUrl.hostname === 'github.com') {
      const cloned = await this.cloneGitHubRepo(remoteUrl);
      return {
        localPath: cloned.localPath,
        sourceType: 'url',
        sourceLocator: remoteUrl.toString(),
        cleanup: cloned.cleanup
      };
    }

    if (remoteUrl.hostname === 'codeload.github.com' || remoteUrl.hostname === 'raw.githubusercontent.com') {
      const downloaded = await this.downloadRemoteZip(remoteUrl);
      return {
        localPath: downloaded.localPath,
        sourceType: 'url',
        sourceLocator: remoteUrl.toString(),
        cleanup: downloaded.cleanup
      };
    }

    throw new Error(`Unsupported remote import URL: ${remoteUrl.toString()}`);
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
    const resolved = await this.resolveImportInput(bundlePathOrZip);
    try {
      const files = await this.readBundleInput(resolved.localPath);
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
      const inferredName = parsedManifest.name || this.inferSkillNameFromLocator(resolved.sourceLocator);
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
      const sourceType = opts?.sourceType ?? resolved.sourceType;
      const sourceLocator = opts?.sourceLocator ?? resolved.sourceLocator;
      this.db.insertSkill({
        id: skillId,
        name: inferredName,
        description: parsedManifest.description ?? null,
        source_type: sourceType,
        source_locator: sourceLocator,
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
        details_json: JSON.stringify({ source: sourceLocator }),
        created_at: now
      });
      await this.recordTelemetry({
        eventType: 'skill.imported',
        subjectType: 'skill_version',
        subjectId: versionId,
        details: { source: sourceLocator, skillId, versionHash, riskTotal, verdict }
      });

      return {
        skillId,
        versionId,
        versionHash,
        receiptPath,
        riskTotal,
        verdict
      };
    } finally {
      await resolved.cleanup();
    }
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

  async deploy(
    skillId: string,
    opts: { adapter: string; scope: InstallScope; mode: InstallMode; allowRiskOverride?: boolean }
  ): Promise<DeploymentResult[]> {
    const version = this.db.getCurrentSkillVersion(skillId);
    if (!version) {
      throw new Error(`Skill not found or has no current version: ${skillId}`);
    }
    const inventory = this.db.getCurrentSkillInventory(skillId);
    if (!inventory) {
      throw new Error(`Skill not found or has no inventory metadata: ${skillId}`);
    }

    const overrideAllowed = true;
    const riskTotal = inventory.risk_total ?? 0;
    if (inventory.verdict === 'FAIL' && !opts.allowRiskOverride) {
      const blockedError = new DeployBlockedByTrustError({
        skillId,
        riskTotal,
        overrideAllowed,
        remediation: 'Resolve scan findings or explicitly use override permissions for emergency rollout.'
      });
      const nowBlocked = this.nowIso();
      this.db.insertAuditEvent({
        id: randomUUID(),
        event_type: 'skill.deploy.blocked',
        subject_type: 'skill_version',
        subject_id: version.id,
        details_json: JSON.stringify({
          code: blockedError.code,
          skillId,
          verdict: blockedError.verdict,
          riskTotal,
          overrideAllowed
        }),
        created_at: nowBlocked
      });
      await this.recordTelemetry({
        eventType: 'skill.deploy.blocked',
        subjectType: 'skill_version',
        subjectId: version.id,
        details: {
          code: blockedError.code,
          skillId,
          verdict: blockedError.verdict,
          riskTotal,
          overrideAllowed
        }
      });
      throw blockedError;
    }

    if (inventory.verdict === 'FAIL' && opts.allowRiskOverride) {
      const nowOverride = this.nowIso();
      this.db.insertAuditEvent({
        id: randomUUID(),
        event_type: 'skill.deploy.override',
        subject_type: 'skill_version',
        subject_id: version.id,
        details_json: JSON.stringify({
          skillId,
          verdict: 'FAIL',
          riskTotal
        }),
        created_at: nowOverride
      });
      await this.recordTelemetry({
        eventType: 'skill.deploy.override',
        subjectType: 'skill_version',
        subjectId: version.id,
        details: { skillId, verdict: 'FAIL', riskTotal }
      });
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
      await this.recordTelemetry({
        eventType: 'skill.deployed',
        subjectType: 'skill_version',
        subjectId: version.id,
        details: { adapterId: adapter.id, scope: opts.scope, mode: opts.mode, installedPath, skillId }
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
      await this.recordTelemetry({
        eventType: 'skill.undeployed',
        subjectType: 'skill',
        subjectId: skillId,
        details: { adapterId: adapter.id, scope: opts.scope, removed: Boolean(exists) }
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

    const summary = {
      totals: {
        skills: currentSkills.length,
        deployments: deployments.length,
        staleSkills: staleSkills.length,
        driftedDeployments: driftedDeployments.length
      },
      staleSkills,
      driftedDeployments
    };
    await this.recordTelemetry({
      eventType: 'vault.audit.completed',
      subjectType: 'vault',
      details: {
        staleDays,
        totals: summary.totals
      }
    });
    return summary;
  }

  private async discoverInstalledSkills(): Promise<SyncDiscoveryRecord[]> {
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
          if (!child.isDirectory() && !child.isSymbolicLink()) continue;
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
    return discovered.sort((a, b) => {
      const skillCmp = a.skillId.localeCompare(b.skillId);
      if (skillCmp !== 0) return skillCmp;
      const adapterCmp = a.adapterId.localeCompare(b.adapterId);
      if (adapterCmp !== 0) return adapterCmp;
      const scopeCmp = a.scope.localeCompare(b.scope);
      if (scopeCmp !== 0) return scopeCmp;
      return a.installedPath.localeCompare(b.installedPath);
    });
  }

  private async readManifestFromInstalledSkill(skillDir: string): Promise<{ name?: string; description?: string }> {
    for (const manifestFilename of MANIFEST_FILENAMES) {
      const manifestPath = path.join(skillDir, manifestFilename);
      const manifestText = await fs.readFile(manifestPath, 'utf8').catch(() => null);
      if (!manifestText) continue;
      return this.parseManifestFrontmatter(manifestText);
    }
    return {};
  }

  private async inferUnmanagedFilesystemMetadata(
    skillId: string,
    installations: SyncDiscoveryRecord[]
  ): Promise<Pick<FilesystemSkillRecord, 'name' | 'sourceType' | 'sourceLocator' | 'versionHash'>> {
    const installPaths = [...new Set(installations.map((entry) => entry.installedPath))].sort((a, b) => a.localeCompare(b));
    if (installPaths.length === 0) {
      return {
        name: skillId,
        sourceType: 'filesystem',
        sourceLocator: null,
        versionHash: null
      };
    }

    const resolvedPaths: string[] = [];
    for (const installPath of installPaths) {
      const resolved = await fs.realpath(installPath).catch(() => installPath);
      resolvedPaths.push(path.resolve(resolved));
    }
    const uniqueResolvedPaths = [...new Set(resolvedPaths)].sort((a, b) => a.localeCompare(b));
    const sourceLocator = uniqueResolvedPaths.length > 1
      ? `${uniqueResolvedPaths[0]} (+${uniqueResolvedPaths.length - 1} more)`
      : uniqueResolvedPaths[0];
    const canonicalPath = uniqueResolvedPaths[0];

    const manifest = await this.readManifestFromInstalledSkill(canonicalPath);
    const inferredName = manifest.name?.trim() ? manifest.name.trim() : skillId;
    const versionHash = await this.hashDirectoryTree(canonicalPath).catch(() => null);

    return {
      name: inferredName,
      sourceType: 'filesystem',
      sourceLocator,
      versionHash
    };
  }

  async syncInstalledSkills(): Promise<{ discovered: SyncDiscoveryRecord[] }> {
    const discovered = await this.discoverInstalledSkills();
    await this.recordTelemetry({
      eventType: 'skills.sync.completed',
      subjectType: 'vault',
      details: { discovered: discovered.length }
    });
    return { discovered };
  }

  async filesystemInventory(): Promise<FilesystemInventory> {
    const discovered = await this.discoverInstalledSkills();
    const inventory = this.inventory();
    const inventoryBySkillId = new Map(inventory.map((item) => [item.id, item]));
    const discoveredBySkillId = new Map<string, SyncDiscoveryRecord[]>();
    for (const install of discovered) {
      const list = discoveredBySkillId.get(install.skillId) ?? [];
      list.push(install);
      discoveredBySkillId.set(install.skillId, list);
    }

    const deploymentRows = this.db.listDeployments()
      .filter((row) => row.status === 'deployed');
    const managedDeploymentKeys = new Set(
      deploymentRows.map((row) => `${row.skillId}|${row.adapterId}|${row.installScope}|${path.resolve(row.installedPath)}`)
    );

    const bySkillId = new Map<string, FilesystemSkillRecord>();
    for (const managedSkill of inventory) {
      bySkillId.set(managedSkill.id, {
        skillId: managedSkill.id,
        name: managedSkill.name,
        sourceType: managedSkill.source_type,
        sourceLocator: managedSkill.source_locator,
        versionHash: managedSkill.version_hash,
        riskTotal: managedSkill.risk_total,
        verdict: managedSkill.verdict,
        managed: true,
        installations: []
      });
    }

    for (const install of discovered) {
      const current = bySkillId.get(install.skillId);
      if (!current) {
        bySkillId.set(install.skillId, {
          skillId: install.skillId,
          name: install.skillId,
          sourceType: null,
          sourceLocator: null,
          versionHash: null,
          riskTotal: null,
          verdict: null,
          managed: false,
          installations: []
        });
      }
      const existing = bySkillId.get(install.skillId)!;
      const installation: FilesystemInstallationRecord = {
        adapterId: install.adapterId,
        scope: install.scope,
        installedPath: install.installedPath,
        managedDeployment: managedDeploymentKeys.has(
          `${install.skillId}|${install.adapterId}|${install.scope}|${path.resolve(install.installedPath)}`
        )
      };
      existing.installations.push(installation);

      if (inventoryBySkillId.has(install.skillId)) {
        existing.managed = true;
      }
    }

    for (const [skillId, skill] of bySkillId) {
      if (skill.managed) continue;
      const installs = discoveredBySkillId.get(skillId) ?? [];
      const inferred = await this.inferUnmanagedFilesystemMetadata(skillId, installs);
      skill.name = inferred.name;
      skill.sourceType = inferred.sourceType;
      skill.sourceLocator = inferred.sourceLocator;
      skill.versionHash = inferred.versionHash;
    }

    const skills = [...bySkillId.values()]
      .map((skill) => ({
        ...skill,
        installations: [...skill.installations].sort((a, b) => {
          const adapterCmp = a.adapterId.localeCompare(b.adapterId);
          if (adapterCmp !== 0) return adapterCmp;
          const scopeCmp = a.scope.localeCompare(b.scope);
          if (scopeCmp !== 0) return scopeCmp;
          return a.installedPath.localeCompare(b.installedPath);
        })
      }))
      .sort((a, b) => a.skillId.localeCompare(b.skillId));

    const totals = {
      managedSkills: skills.filter((skill) => skill.managed).length,
      unmanagedSkills: skills.filter((skill) => !skill.managed).length,
      installations: skills.reduce((sum, skill) => sum + skill.installations.length, 0),
      adaptersScanned: this.listAdapters().filter((entry) => entry.isEnabled).length
    };

    await this.recordTelemetry({
      eventType: 'skills.filesystem_inventory.completed',
      subjectType: 'vault',
      details: totals
    });

    return { totals, skills };
  }

  async discover(query: string): Promise<DiscoveryResult[]> {
    let stdout = '';
    try {
      const execResult = await execFileAsync('npx', ['skills', 'find', query], {
        maxBuffer: 10 * 1024 * 1024
      });
      stdout = execResult.stdout;
    } catch (error) {
      await this.recordTelemetry({
        eventType: 'skills.discover.failed',
        subjectType: 'discovery_query',
        subjectId: query,
        details: { query, message: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    }
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

    await this.recordTelemetry({
      eventType: 'skills.discover.completed',
      subjectType: 'discovery_query',
      subjectId: query,
      details: { query, resultCount: results.length }
    });
    return results;
  }

  private evaluateCase(
    evalCase: EvalCase,
    metrics: { skillsCount: number; adaptersCount: number; telemetryTotal: number }
  ): { passed: boolean; details: Record<string, unknown> } {
    const minValue = typeof evalCase.expected.min === 'number' ? evalCase.expected.min : 0;
    switch (evalCase.caseKey) {
      case 'inventory_non_negative': {
        const actual = metrics.skillsCount;
        return {
          passed: actual >= minValue,
          details: { actual, expected: evalCase.expected, metric: 'skills.count' }
        };
      }
      case 'adapters_available': {
        const actual = metrics.adaptersCount;
        return {
          passed: actual >= minValue,
          details: { actual, expected: evalCase.expected, metric: 'adapters.count' }
        };
      }
      case 'telemetry_accessible': {
        const actual = metrics.telemetryTotal;
        return {
          passed: Number.isFinite(actual) && actual >= minValue,
          details: { actual, expected: evalCase.expected, metric: 'telemetry.total' }
        };
      }
      default:
        return {
          passed: false,
          details: {
            message: `Unknown eval case key: ${evalCase.caseKey}`,
            expected: evalCase.expected
          }
        };
    }
  }

  private parseEvalCase(row: {
    id: string;
    dataset_id: string;
    case_key: string;
    input_json: string;
    expected_json: string;
    weight: number;
    created_at: string;
  }): EvalCase {
    return {
      id: row.id,
      datasetId: row.dataset_id,
      caseKey: row.case_key,
      input: JSON.parse(row.input_json) as Record<string, unknown>,
      expected: JSON.parse(row.expected_json) as Record<string, unknown>,
      weight: row.weight,
      createdAt: row.created_at
    };
  }

  private parseEvalRun(row: {
    id: string;
    dataset_id: string;
    baseline_run_id: string | null;
    status: 'running' | 'completed' | 'failed';
    score: number;
    summary_json: string;
    created_at: string;
    completed_at: string | null;
  }): EvalRun {
    return {
      id: row.id,
      datasetId: row.dataset_id,
      baselineRunId: row.baseline_run_id,
      status: row.status,
      score: row.score,
      summary: JSON.parse(row.summary_json) as Record<string, unknown>,
      createdAt: row.created_at,
      completedAt: row.completed_at
    };
  }

  private parseEvalResult(row: {
    id: string;
    run_id: string;
    case_id: string;
    status: 'pass' | 'fail';
    score: number;
    details_json: string;
    created_at: string;
  }): EvalResult {
    return {
      id: row.id,
      runId: row.run_id,
      caseId: row.case_id,
      status: row.status,
      score: row.score,
      details: JSON.parse(row.details_json) as Record<string, unknown>,
      createdAt: row.created_at
    };
  }

  async seedEvalDataset(datasetId = DEFAULT_EVAL_DATASET_ID): Promise<EvalSeedResult> {
    const now = this.nowIso();
    this.db.upsertEvalDataset({
      id: datasetId,
      name: 'Default Manager Regression Dataset',
      description: 'Deterministic manager health checks for v0.3',
      created_at: now,
      updated_at: now
    });

    for (const evalCase of DEFAULT_EVAL_CASES) {
      this.db.upsertEvalCase({
        id: `${datasetId}:${evalCase.key}`,
        dataset_id: datasetId,
        case_key: evalCase.key,
        input_json: JSON.stringify(evalCase.input),
        expected_json: JSON.stringify(evalCase.expected),
        weight: evalCase.weight,
        created_at: now
      });
    }

    await this.recordTelemetry({
      eventType: 'eval.dataset.seeded',
      subjectType: 'eval_dataset',
      subjectId: datasetId,
      details: { caseCount: DEFAULT_EVAL_CASES.length }
    });

    return { datasetId, caseCount: DEFAULT_EVAL_CASES.length };
  }

  listEvalDatasets(): EvalDataset[] {
    return this.db.listEvalDatasets().map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  getEvalRun(runId: string): EvalRunReport | undefined {
    const runRow = this.db.getEvalRunById(runId);
    if (!runRow) return undefined;
    const run = this.parseEvalRun(runRow);
    const results = this.db.listEvalResults(runId).map((row) => this.parseEvalResult(row));
    let comparison: EvalRunReport['comparison'];
    if (run.baselineRunId) {
      const baseline = this.db.getEvalRunById(run.baselineRunId);
      if (baseline) {
        const delta = run.score - baseline.score;
        comparison = {
          baselineRunId: baseline.id,
          baselineScore: baseline.score,
          delta,
          regressed: delta < 0
        };
      }
    }
    return {
      run,
      results,
      comparison,
      regressionFailed: Boolean(comparison?.regressed)
    };
  }

  async runEval(opts: { datasetId: string; baselineRunId?: string; failOnRegression?: boolean }): Promise<EvalRunReport> {
    const dataset = this.db.getEvalDatasetById(opts.datasetId);
    if (!dataset) {
      throw new Error(`Eval dataset not found: ${opts.datasetId}`);
    }
    const caseRows = this.db.listEvalCases(opts.datasetId);
    if (caseRows.length === 0) {
      throw new Error(`Eval dataset has no cases: ${opts.datasetId}`);
    }

    const runId = randomUUID();
    const now = this.nowIso();
    this.db.insertEvalRun({
      id: runId,
      dataset_id: opts.datasetId,
      baseline_run_id: opts.baselineRunId ?? null,
      status: 'running',
      score: 0,
      summary_json: JSON.stringify({ status: 'running' }),
      created_at: now,
      completed_at: null
    });

    const cases = caseRows.map((row) => this.parseEvalCase(row));
    const metrics = {
      skillsCount: this.inventory().length,
      adaptersCount: this.listAdapters().length,
      telemetryTotal: this.telemetryStatus().totals.total
    };

    let weightedPassScore = 0;
    let totalWeight = 0;
    let passed = 0;
    const results: EvalResult[] = [];
    for (const evalCase of cases) {
      const evaluation = this.evaluateCase(evalCase, metrics);
      const caseScore = evaluation.passed ? evalCase.weight : 0;
      weightedPassScore += caseScore;
      totalWeight += evalCase.weight;
      if (evaluation.passed) {
        passed += 1;
      }
      const result: EvalResult = {
        id: randomUUID(),
        runId,
        caseId: evalCase.id,
        status: evaluation.passed ? 'pass' : 'fail',
        score: caseScore,
        details: evaluation.details,
        createdAt: now
      };
      this.db.insertEvalResult({
        id: result.id,
        run_id: result.runId,
        case_id: result.caseId,
        status: result.status,
        score: result.score,
        details_json: JSON.stringify(result.details),
        created_at: result.createdAt
      });
      results.push(result);
    }

    const score = totalWeight > 0 ? Number((weightedPassScore / totalWeight).toFixed(4)) : 0;
    const summary = {
      totalCases: cases.length,
      passed,
      failed: cases.length - passed,
      metrics
    };
    this.db.updateEvalRun({
      id: runId,
      status: 'completed',
      score,
      summary_json: JSON.stringify(summary),
      completed_at: now
    });

    const run = this.parseEvalRun({
      id: runId,
      dataset_id: opts.datasetId,
      baseline_run_id: opts.baselineRunId ?? null,
      status: 'completed',
      score,
      summary_json: JSON.stringify(summary),
      created_at: now,
      completed_at: now
    });

    let comparison: EvalRunReport['comparison'];
    if (opts.baselineRunId) {
      const baseline = this.db.getEvalRunById(opts.baselineRunId);
      if (baseline) {
        const delta = run.score - baseline.score;
        comparison = {
          baselineRunId: baseline.id,
          baselineScore: baseline.score,
          delta,
          regressed: delta < 0
        };
      }
    }

    await this.recordTelemetry({
      eventType: 'eval.run.completed',
      subjectType: 'eval_run',
      subjectId: runId,
      details: {
        datasetId: opts.datasetId,
        score,
        baselineRunId: opts.baselineRunId ?? null,
        regression: comparison?.regressed ?? false
      }
    });

    const regressionFailed = Boolean(opts.failOnRegression && comparison?.regressed);
    return { run, results, comparison, regressionFailed };
  }

  async compareEvalRun(runId: string): Promise<{
    runId: string;
    baselineRunId: string;
    score: number;
    baselineScore: number;
    delta: number;
    regressed: boolean;
  }> {
    const run = this.db.getEvalRunById(runId);
    if (!run) {
      throw new Error(`Eval run not found: ${runId}`);
    }
    let baselineId = run.baseline_run_id;
    if (!baselineId) {
      const siblingRuns = this.db.listEvalRuns(run.dataset_id).filter((entry) => entry.id !== run.id);
      baselineId = siblingRuns[0]?.id ?? null;
    }
    if (!baselineId) {
      throw new Error(`No baseline run available for ${runId}`);
    }

    const baseline = this.db.getEvalRunById(baselineId);
    if (!baseline) {
      throw new Error(`Baseline run not found: ${baselineId}`);
    }
    const delta = run.score - baseline.score;
    const comparison = {
      runId: run.id,
      baselineRunId: baseline.id,
      score: run.score,
      baselineScore: baseline.score,
      delta,
      regressed: delta < 0
    };

    await this.recordTelemetry({
      eventType: 'eval.run.compared',
      subjectType: 'eval_run',
      subjectId: run.id,
      details: comparison
    });

    return comparison;
  }

  async listBenchConfigs(): Promise<BenchConfigEntry[]> {
    return this.bench.listBenchConfigs();
  }

  async runBench(opts: {
    configPath: string;
    deterministic?: boolean;
    save?: boolean;
    label?: string;
  }): Promise<BenchRunServiceResult> {
    const result = await this.bench.runBench(opts);
    await this.recordTelemetry({
      eventType: 'bench.run.completed',
      subjectType: 'bench_run',
      subjectId: result.runId,
      details: {
        configPath: result.run.run.config_path,
        deterministic: result.run.run.deterministic,
        saved: result.saved
      }
    });
    return result;
  }

  async listBenchRuns(limit = 25): Promise<BenchRunListEntry[]> {
    return this.bench.listBenchRuns(limit);
  }

  async getBenchRun(runId: string): Promise<BenchRunOutput> {
    return this.bench.getBenchRun(runId);
  }

  async getBenchReport(runId: string): Promise<BenchReportOutput> {
    return this.bench.getBenchReport(runId);
  }

  authMode(): 'off' | 'required' {
    return process.env.SKILLVAULT_AUTH_MODE === 'required' ? 'required' : 'off';
  }

  async authBootstrap(): Promise<{ principalId: string; roleName: string; token: string }> {
    const result = this.auth.bootstrap();
    await this.recordTelemetry({
      eventType: 'auth.bootstrap.completed',
      subjectType: 'principal',
      subjectId: result.principalId,
      details: { roleName: result.roleName }
    });
    return result;
  }

  listAuthRoles(): Role[] {
    return this.auth.listRoles();
  }

  async createAuthToken(opts: {
    principalId: string;
    roleName: 'admin' | 'operator' | 'viewer';
    label?: string;
    expiresAt?: string;
  }): Promise<{ token: string; record: ApiTokenRecord }> {
    this.auth.getOrCreatePrincipal({
      id: opts.principalId,
      name: opts.principalId,
      type: 'service'
    });
    const created = this.auth.createToken({
      principalId: opts.principalId,
      roleName: opts.roleName,
      label: opts.label,
      expiresAt: opts.expiresAt
    });
    await this.recordTelemetry({
      eventType: 'auth.token.created',
      subjectType: 'principal',
      subjectId: opts.principalId,
      details: {
        roleName: opts.roleName,
        label: opts.label ?? `${opts.roleName}-token`,
        tokenId: created.record.id
      }
    });
    return created;
  }

  authenticateToken(token: string): AuthSession | null {
    return this.auth.resolveSession(token);
  }

  authorizeToken(token: string, permission: string): AuthSession | null {
    return this.auth.authorize(token, permission);
  }

  telemetryStatus(limit = 25) {
    return this.telemetry.status(limit);
  }

  async flushTelemetry(opts: { target: 'jsonl' | 'weave'; maxEvents?: number }): Promise<{
    target: 'jsonl' | 'weave';
    processed: number;
    sent: number;
    retried: number;
    deadLetter: number;
    outputPath?: string;
  }> {
    if (opts.target === 'jsonl') {
      return this.telemetry.flushJsonl(opts.maxEvents ?? 100);
    }

    const events = this.telemetry.listOutbox(opts.maxEvents ?? 100);
    if (events.length === 0) {
      return { target: 'weave', processed: 0, sent: 0, retried: 0, deadLetter: 0 };
    }

    const config = weaveConfigFromEnv();
    if (!config) {
      return { target: 'weave', processed: 0, sent: 0, retried: 0, deadLetter: 0 };
    }

    const exporter = new WeaveExporter(config);
    try {
      await exporter.exportEvents(events);
      let sent = 0;
      for (const event of events) {
        if (this.telemetry.markSent(event.id, 'weave')) {
          sent += 1;
        }
      }
      return {
        target: 'weave',
        processed: events.length,
        sent,
        retried: 0,
        deadLetter: 0
      };
    } catch (error) {
      let retried = 0;
      let deadLetter = 0;
      for (const event of events) {
        const nextStatus = this.telemetry.markRetry(
          event.id,
          'weave',
          error instanceof Error ? error.message : String(error)
        );
        if (nextStatus === 'dead_letter') {
          deadLetter += 1;
        } else if (nextStatus === 'retry') {
          retried += 1;
        }
      }
      return {
        target: 'weave',
        processed: events.length,
        sent: 0,
        retried,
        deadLetter
      };
    }
  }
}
