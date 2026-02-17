import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import {
  buildBenchReport,
  loadBenchConfig,
  parseBenchRunOutput,
  runBenchSuite,
  type BenchReportOutput,
  type BenchRunOutput
} from '../bench/index.js';
import type {
  BenchConfigEntry,
  BenchRunListEntry,
  BenchRunServiceResult
} from '../adapters/types.js';

const BENCH_INDEX_SCHEMA_V1 = 'skillvault.bench.index.v1' as const;
const BENCH_CONFIG_DISCOVERY_ROOTS = ['bench', 'benchmarks', path.join('packages', 'cli', 'examples', 'bench-v0')] as const;

type BenchServiceErrorCode =
  | 'BENCH_CONFIG_PATH_INVALID'
  | 'BENCH_CONFIG_NOT_FOUND'
  | 'BENCH_RUN_NOT_FOUND';

interface BenchRunIndexV1 {
  schema: typeof BENCH_INDEX_SCHEMA_V1;
  updated_at: string;
  runs: BenchRunListEntry[];
}

export class BenchServiceError extends Error {
  readonly code: BenchServiceErrorCode;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: BenchServiceErrorCode,
    message: string,
    statusCode: number,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'BenchServiceError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

function normalizeRelative(filePath: string, rootDir: string): string {
  return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function isUrlPath(input: string): boolean {
  return /^https?:\/\//i.test(input);
}

function parseRunIdFromPath(runPath: string): string {
  return path.basename(runPath, '.json');
}

export class BenchService {
  private readonly benchDir: string;
  private readonly benchRunsDir: string;
  private readonly benchIndexPath: string;

  constructor(
    private readonly rootDir: string,
    exportDir: string,
    private readonly nowIso: () => string
  ) {
    this.benchDir = path.join(exportDir, 'bench');
    this.benchRunsDir = path.join(this.benchDir, 'runs');
    this.benchIndexPath = path.join(this.benchDir, 'index.json');
  }

  private async ensureStorageDirs(): Promise<void> {
    await fs.mkdir(this.benchRunsDir, { recursive: true });
  }

  private async loadRunIndex(): Promise<BenchRunIndexV1> {
    let raw: string;
    try {
      raw = await fs.readFile(this.benchIndexPath, 'utf8');
    } catch {
      return {
        schema: BENCH_INDEX_SCHEMA_V1,
        updated_at: this.nowIso(),
        runs: []
      };
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('index is not an object');
      }
      const asRecord = parsed as Record<string, unknown>;
      if (asRecord.schema !== BENCH_INDEX_SCHEMA_V1 || !Array.isArray(asRecord.runs)) {
        throw new Error('index schema mismatch');
      }
      return {
        schema: BENCH_INDEX_SCHEMA_V1,
        updated_at: typeof asRecord.updated_at === 'string' ? asRecord.updated_at : this.nowIso(),
        runs: asRecord.runs as BenchRunListEntry[]
      };
    } catch {
      return {
        schema: BENCH_INDEX_SCHEMA_V1,
        updated_at: this.nowIso(),
        runs: []
      };
    }
  }

  private async saveRunIndex(index: BenchRunIndexV1): Promise<void> {
    await this.ensureStorageDirs();
    const payload = JSON.stringify(index, null, 2) + '\n';
    await fs.writeFile(this.benchIndexPath, payload, 'utf8');
  }

  private ensureWorkspacePath(inputPath: string, field: string): string {
    const absolute = path.isAbsolute(inputPath) ? path.resolve(inputPath) : path.resolve(this.rootDir, inputPath);
    const normalizedRoot = path.resolve(this.rootDir);
    const normalized = path.resolve(absolute);
    if (normalized !== normalizedRoot && !normalized.startsWith(`${normalizedRoot}${path.sep}`)) {
      throw new BenchServiceError(
        'BENCH_CONFIG_PATH_INVALID',
        `${field} must resolve inside workspace root`,
        400,
        { field, inputPath, rootDir: normalizedRoot }
      );
    }
    return normalized;
  }

  private async resolveConfigPath(configPathInput: string): Promise<string> {
    const trimmed = configPathInput.trim();
    if (!trimmed) {
      throw new BenchServiceError('BENCH_CONFIG_PATH_INVALID', 'configPath must be a non-empty string', 400, {
        field: 'configPath'
      });
    }
    if (isUrlPath(trimmed)) {
      throw new BenchServiceError('BENCH_CONFIG_PATH_INVALID', 'configPath must be a local file path', 400, {
        field: 'configPath',
        configPath: trimmed
      });
    }

    const absolutePath = this.ensureWorkspacePath(trimmed, 'configPath');
    const stat = await fs.stat(absolutePath).catch(() => null);
    if (!stat?.isFile()) {
      throw new BenchServiceError('BENCH_CONFIG_NOT_FOUND', `Benchmark config not found: ${absolutePath}`, 404, {
        configPath: absolutePath
      });
    }

    return absolutePath;
  }

  private async discoverConfigFiles(rootPath: string): Promise<string[]> {
    const out: string[] = [];

    const walk = async (dirPath: string): Promise<void> => {
      const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
          continue;
        }
        if (!entry.isFile()) continue;
        if (!/\.(ya?ml|json)$/i.test(entry.name)) continue;
        out.push(path.resolve(fullPath));
      }
    };

    await walk(rootPath);
    return out;
  }

  async listBenchConfigs(): Promise<BenchConfigEntry[]> {
    const discovered = new Map<string, BenchConfigEntry>();

    for (const root of BENCH_CONFIG_DISCOVERY_ROOTS) {
      const absoluteRoot = path.resolve(this.rootDir, root);
      const stat = await fs.stat(absoluteRoot).catch(() => null);
      if (!stat?.isDirectory()) continue;

      const files = await this.discoverConfigFiles(absoluteRoot);
      for (const filePath of files) {
        const relativePath = normalizeRelative(filePath, this.rootDir);
        discovered.set(relativePath, {
          id: relativePath,
          name: path.basename(filePath),
          path: filePath,
          source: 'workspace'
        });
      }
    }

    return [...discovered.values()].sort((a, b) => a.path.localeCompare(b.path));
  }

  async runBench(input: {
    configPath: string;
    deterministic?: boolean;
    save?: boolean;
    label?: string;
  }): Promise<BenchRunServiceResult> {
    const configPath = await this.resolveConfigPath(input.configPath);
    const loadedConfig = await loadBenchConfig(configPath);
    const run = await runBenchSuite(loadedConfig, {
      deterministicOverride: input.deterministic ?? true
    });
    const report = buildBenchReport(run);

    const runId = randomUUID();
    const runPath = path.join(this.benchRunsDir, `${runId}.json`);
    const shouldSave = input.save !== false;

    if (shouldSave) {
      await this.ensureStorageDirs();
      await fs.writeFile(runPath, JSON.stringify(run, null, 2) + '\n', 'utf8');

      const index = await this.loadRunIndex();
      const filtered = index.runs.filter((entry) => entry.runId !== runId);
      const label = input.label?.trim() || run.run.metadata.suite || null;
      filtered.unshift({
        runId,
        runPath,
        configPath: run.run.config_path,
        label,
        createdAt: run.created_at,
        deterministic: run.run.deterministic,
        gitCommit: run.run.git_commit,
        conditionPassRates: Object.fromEntries(
          Object.entries(run.aggregates).map(([conditionId, aggregate]) => [conditionId, aggregate.pass_rate])
        ),
        deltas: {
          curated_vs_no_skill: run.deltas.curated_vs_no_skill?.pass_rate_delta ?? null,
          self_generated_vs_no_skill: run.deltas.self_generated_vs_no_skill?.pass_rate_delta ?? null
        }
      });
      const sorted = filtered.sort((a, b) => {
        const byCreatedAt = b.createdAt.localeCompare(a.createdAt);
        if (byCreatedAt !== 0) return byCreatedAt;
        return a.runId.localeCompare(b.runId);
      });

      await this.saveRunIndex({
        schema: BENCH_INDEX_SCHEMA_V1,
        updated_at: this.nowIso(),
        runs: sorted
      });
    }

    return {
      runId,
      runPath,
      run,
      report,
      saved: shouldSave
    };
  }

  async listBenchRuns(limit = 25): Promise<BenchRunListEntry[]> {
    const index = await this.loadRunIndex();
    const boundedLimit = Number.isFinite(limit) && limit > 0 ? Math.trunc(limit) : 25;
    return index.runs.slice(0, boundedLimit);
  }

  private async resolveRunPath(runId: string): Promise<string> {
    const index = await this.loadRunIndex();
    const found = index.runs.find((entry) => entry.runId === runId);
    if (!found) {
      throw new BenchServiceError('BENCH_RUN_NOT_FOUND', `Benchmark run not found: ${runId}`, 404, {
        runId
      });
    }
    return found.runPath;
  }

  async getBenchRun(runId: string): Promise<BenchRunOutput> {
    const runPath = await this.resolveRunPath(runId);
    const raw = await fs.readFile(runPath, 'utf8').catch((err: unknown) => {
      throw new BenchServiceError('BENCH_RUN_NOT_FOUND', `Benchmark run file missing: ${runId}`, 404, {
        runId,
        runPath,
        error: err instanceof Error ? err.message : String(err)
      });
    });
    return parseBenchRunOutput(raw);
  }

  async getBenchReport(runId: string): Promise<BenchReportOutput> {
    const run = await this.getBenchRun(runId);
    return buildBenchReport(run);
  }

  async getBenchRunByPath(runPathInput: string): Promise<BenchRunOutput> {
    const absolutePath = this.ensureWorkspacePath(runPathInput, 'runPath');
    const raw = await fs.readFile(absolutePath, 'utf8').catch((err: unknown) => {
      throw new BenchServiceError('BENCH_RUN_NOT_FOUND', `Benchmark run file missing: ${absolutePath}`, 404, {
        runPath: absolutePath,
        error: err instanceof Error ? err.message : String(err)
      });
    });
    return parseBenchRunOutput(raw);
  }

  async importBenchRun(runPathInput: string): Promise<{ runId: string; runPath: string; run: BenchRunOutput; report: BenchReportOutput }> {
    const run = await this.getBenchRunByPath(runPathInput);
    const runId = parseRunIdFromPath(runPathInput).trim() || randomUUID();
    const runPath = this.ensureWorkspacePath(runPathInput, 'runPath');
    const report = buildBenchReport(run);
    return { runId, runPath, run, report };
  }
}
