import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { CONTRACT_VERSION } from '../contracts.js';
import { createdAtIso } from '../util/determinism.js';
import { aggregateBenchResults } from './aggregate.js';
import { BENCH_RUN_CONTRACT_V1 } from './types.js';
import type {
  BenchConditionConfig,
  BenchConditionRef,
  BenchErrorCategory,
  BenchRunOutput,
  BenchTaskConfig,
  BenchTaskResult,
  BenchTaskVerifierConfig,
  BenchTaskVerifierFunctionConfig,
  LoadedBenchConfig
} from './types.js';
import { BenchConfigError } from './config.js';

const execFileAsync = promisify(execFile);
const OUTPUT_EXCERPT_LIMIT = 300;

export interface RunBenchOptions {
  deterministicOverride?: boolean;
}

interface VerifierResult {
  passed: boolean;
  duration_ms: number;
  exit_code: number | null;
  error_category: BenchErrorCategory | string;
  error_message?: string;
  stdout_excerpt?: string;
  stderr_excerpt?: string;
}

function excerpt(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length <= OUTPUT_EXCERPT_LIMIT
    ? trimmed
    : `${trimmed.slice(0, OUTPUT_EXCERPT_LIMIT - 3)}...`;
}

function observedDurationMs(startNs: bigint): number {
  const elapsedNs = process.hrtime.bigint() - startNs;
  return Number(elapsedNs / 1_000_000n);
}

async function resolveGitCommit(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--short', 'HEAD'], { cwd });
    const out = stdout.trim();
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

async function ensurePathExists(inputPath: string, field: string): Promise<void> {
  try {
    await fs.access(inputPath);
  } catch (err) {
    throw new BenchConfigError('BENCH_CONFIG_INVALID', `${field} does not exist: ${inputPath}`, {
      field,
      path: inputPath,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}

function resolveBundlePath(condition: BenchConditionConfig, configDir: string): string | undefined {
  if (condition.bundle_path) {
    return path.resolve(configDir, condition.bundle_path);
  }

  if (condition.id === 'self_generated_skill' && condition.adapter?.id === 'stub') {
    const configured = condition.adapter.options?.bundle_path;
    if (typeof configured === 'string' && configured.trim().length > 0) {
      return path.resolve(configDir, configured);
    }
  }

  return undefined;
}

function verifierLabel(verifier: BenchTaskVerifierConfig): string {
  if (verifier.type === 'function') return verifier.function;
  return verifier.command;
}

function safeBundleFilePath(bundlePath: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    throw new Error('verifier path must be relative');
  }

  const bundleRoot = path.resolve(bundlePath);
  const target = path.resolve(bundleRoot, relativePath);
  if (target !== bundleRoot && !target.startsWith(`${bundleRoot}${path.sep}`)) {
    throw new Error('verifier path escapes bundle root');
  }

  return target;
}

function parseVerifierJson(stdout: string): { error_category?: string; message?: string } | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;

  const candidates = [trimmed, ...trimmed.split('\n').map((line) => line.trim()).filter(Boolean).reverse()];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      const obj = parsed as Record<string, unknown>;
      return {
        error_category: typeof obj.error_category === 'string' ? obj.error_category : undefined,
        message: typeof obj.message === 'string' ? obj.message : undefined
      };
    } catch {
      continue;
    }
  }

  return null;
}

function sanitizeErrorCategory(input: string | undefined, fallback: BenchErrorCategory): BenchErrorCategory | string {
  if (!input) return fallback;
  if (/^[a-z0-9_]+$/.test(input)) return input;
  return fallback;
}

async function runBuiltinVerifier(
  verifier: BenchTaskVerifierFunctionConfig,
  bundlePath: string | undefined,
  deterministic: boolean
): Promise<VerifierResult> {
  const startNs = process.hrtime.bigint();

  const resultFor = (
    passed: boolean,
    errorCategory: BenchErrorCategory,
    errorMessage?: string
  ): VerifierResult => {
    const duration = deterministic ? 0 : observedDurationMs(startNs);
    return {
      passed,
      duration_ms: duration,
      exit_code: passed ? 0 : 1,
      error_category: passed ? 'none' : errorCategory,
      error_message: errorMessage
    };
  };

  try {
    if (!bundlePath) {
      return resultFor(false, 'assertion_failed', 'bundle path is required for function verifiers');
    }

    if (verifier.function === 'bundle_file_exists') {
      const filePath = verifier.args?.path;
      if (typeof filePath !== 'string' || filePath.trim().length === 0) {
        return resultFor(false, 'execution_error', 'bundle_file_exists requires args.path');
      }
      const target = safeBundleFilePath(bundlePath, filePath.trim());
      try {
        await fs.access(target);
        return resultFor(true, 'none');
      } catch {
        return resultFor(false, 'assertion_failed', `expected file to exist: ${filePath}`);
      }
    }

    if (verifier.function === 'bundle_file_contains') {
      const filePath = verifier.args?.path;
      const needle = verifier.args?.contains;
      if (typeof filePath !== 'string' || filePath.trim().length === 0 || typeof needle !== 'string') {
        return resultFor(false, 'execution_error', 'bundle_file_contains requires args.path + args.contains');
      }

      const target = safeBundleFilePath(bundlePath, filePath.trim());
      let content: string;
      try {
        content = await fs.readFile(target, 'utf8');
      } catch {
        return resultFor(false, 'assertion_failed', `expected file to exist for content check: ${filePath}`);
      }

      if (content.includes(needle)) {
        return resultFor(true, 'none');
      }
      return resultFor(false, 'assertion_failed', `expected ${filePath} to contain "${needle}"`);
    }

    return resultFor(false, 'execution_error', `unsupported function verifier: ${verifier.function}`);
  } catch (err) {
    return resultFor(
      false,
      'execution_error',
      err instanceof Error ? err.message : String(err)
    );
  }
}

async function runCommandVerifier(
  command: string,
  task: BenchTaskConfig,
  conditionId: string,
  bundlePath: string | undefined,
  execution: { deterministic: boolean; seed: number; attempt: number; cwd: string }
): Promise<VerifierResult> {
  const startNs = process.hrtime.bigint();
  const env: Record<string, string> = {
    ...process.env,
    SKILLVAULT_BENCH_TASK_ID: task.id,
    SKILLVAULT_BENCH_TASK_DOMAIN: task.domain,
    SKILLVAULT_BENCH_CONDITION_ID: conditionId,
    SKILLVAULT_BENCH_BUNDLE_PATH: bundlePath ?? '',
    SKILLVAULT_BENCH_TIMEOUT_MS: String(task.timeout_ms),
    SKILLVAULT_BENCH_SEED: String(execution.seed),
    SKILLVAULT_BENCH_ATTEMPT: String(execution.attempt),
    SKILLVAULT_BENCH_DETERMINISTIC: execution.deterministic ? '1' : '0'
  };

  return new Promise<VerifierResult>((resolve) => {
    const child = spawn('sh', ['-lc', command], {
      cwd: execution.cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let timedOut = false;
    let stdout = '';
    let stderr = '';
    let settled = false;

    const settle = (result: Omit<VerifierResult, 'duration_ms'>) => {
      if (settled) return;
      settled = true;
      const duration = execution.deterministic ? 0 : observedDurationMs(startNs);
      resolve({
        ...result,
        duration_ms: duration
      });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, task.timeout_ms);

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length >= OUTPUT_EXCERPT_LIMIT) return;
      stdout += chunk.toString('utf8');
      if (stdout.length > OUTPUT_EXCERPT_LIMIT) {
        stdout = stdout.slice(0, OUTPUT_EXCERPT_LIMIT);
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length >= OUTPUT_EXCERPT_LIMIT) return;
      stderr += chunk.toString('utf8');
      if (stderr.length > OUTPUT_EXCERPT_LIMIT) {
        stderr = stderr.slice(0, OUTPUT_EXCERPT_LIMIT);
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      settle({
        passed: false,
        exit_code: null,
        error_category: 'execution_error',
        error_message: err.message,
        stdout_excerpt: excerpt(stdout),
        stderr_excerpt: excerpt(stderr)
      });
    });

    child.on('close', (code) => {
      clearTimeout(timer);

      if (timedOut) {
        settle({
          passed: false,
          exit_code: null,
          error_category: 'timeout',
          error_message: `verifier timed out after ${task.timeout_ms}ms`,
          stdout_excerpt: excerpt(stdout),
          stderr_excerpt: excerpt(stderr)
        });
        return;
      }

      const payload = parseVerifierJson(stdout);
      if (code === 0) {
        settle({
          passed: true,
          exit_code: 0,
          error_category: 'none',
          stdout_excerpt: excerpt(stdout),
          stderr_excerpt: excerpt(stderr)
        });
        return;
      }

      settle({
        passed: false,
        exit_code: typeof code === 'number' ? code : 1,
        error_category: sanitizeErrorCategory(payload?.error_category, 'verification_failed'),
        error_message: payload?.message ?? excerpt(stderr) ?? `verifier exited with code ${String(code)}`,
        stdout_excerpt: excerpt(stdout),
        stderr_excerpt: excerpt(stderr)
      });
    });
  });
}

async function runVerifierAttempt(
  task: BenchTaskConfig,
  conditionId: string,
  bundlePath: string | undefined,
  options: { deterministic: boolean; seed: number; attempt: number; cwd: string }
): Promise<VerifierResult> {
  if (task.verifier.type === 'function') {
    return runBuiltinVerifier(task.verifier, bundlePath, options.deterministic);
  }
  return runCommandVerifier(task.verifier.command, task, conditionId, bundlePath, options);
}

async function runTaskResult(
  task: BenchTaskConfig,
  conditionId: string,
  bundlePath: string | undefined,
  execution: { retries: number; deterministic: boolean; seed: number; cwd: string }
): Promise<BenchTaskResult> {
  const totalAttempts = execution.retries + 1;
  let lastResult: VerifierResult | null = null;

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    lastResult = await runVerifierAttempt(task, conditionId, bundlePath, {
      deterministic: execution.deterministic,
      seed: execution.seed,
      attempt,
      cwd: execution.cwd
    });
    if (lastResult.passed) {
      return {
        condition_id: conditionId,
        task_id: task.id,
        passed: true,
        duration_ms: lastResult.duration_ms,
        attempts: attempt,
        exit_code: lastResult.exit_code,
        error_category: 'none',
        stdout_excerpt: lastResult.stdout_excerpt,
        stderr_excerpt: lastResult.stderr_excerpt
      };
    }
  }

  const failed = lastResult ?? {
    passed: false,
    duration_ms: execution.deterministic ? 0 : 0,
    exit_code: null,
    error_category: 'execution_error',
    error_message: 'verifier did not execute'
  };

  return {
    condition_id: conditionId,
    task_id: task.id,
    passed: false,
    duration_ms: failed.duration_ms,
    attempts: totalAttempts,
    exit_code: failed.exit_code,
    error_category: failed.error_category,
    error_message: failed.error_message,
    stdout_excerpt: failed.stdout_excerpt,
    stderr_excerpt: failed.stderr_excerpt
  };
}

export async function runBenchSuite(
  loadedConfig: LoadedBenchConfig,
  options: RunBenchOptions = {}
): Promise<BenchRunOutput> {
  const config = loadedConfig.config;
  const deterministic = options.deterministicOverride ?? config.execution.deterministic;
  const seed = config.execution.seed;
  const retries = config.execution.retries;

  const conditions: BenchConditionRef[] = [];
  const bundleByCondition = new Map<string, string | undefined>();
  for (const condition of config.conditions) {
    const resolvedBundlePath = resolveBundlePath(condition, loadedConfig.config_dir);
    if (resolvedBundlePath) {
      await ensurePathExists(resolvedBundlePath, `conditions.${condition.id}.bundle_path`);
    }

    conditions.push({
      id: condition.id,
      bundle_path: resolvedBundlePath,
      adapter_id: condition.adapter?.id
    });
    bundleByCondition.set(condition.id, resolvedBundlePath);
  }

  const results: BenchTaskResult[] = [];
  for (const condition of config.conditions) {
    const bundlePath = bundleByCondition.get(condition.id);
    for (const task of config.tasks) {
      results.push(await runTaskResult(task, condition.id, bundlePath, {
        retries,
        deterministic,
        seed,
        cwd: loadedConfig.config_dir
      }));
    }
  }

  const summary = aggregateBenchResults(results, config.conditions.map((condition) => condition.id));
  const gitCommit = await resolveGitCommit(loadedConfig.config_dir);

  return {
    contract_version: CONTRACT_VERSION,
    contract_id: BENCH_RUN_CONTRACT_V1,
    created_at: createdAtIso(deterministic),
    run: {
      config_path: loadedConfig.config_path,
      git_commit: gitCommit,
      deterministic,
      seed,
      retries,
      metadata: config.metadata
    },
    conditions,
    tasks: config.tasks.map((task) => ({
      id: task.id,
      domain: task.domain,
      timeout_ms: task.timeout_ms,
      verifier: {
        type: task.verifier.type,
        label: verifierLabel(task.verifier)
      }
    })),
    results,
    aggregates: summary.aggregates,
    deltas: summary.deltas,
    error_breakdown: summary.error_breakdown
  };
}
