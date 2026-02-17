import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

import {
  BENCH_CONFIG_SCHEMA_V1,
  REQUIRED_BENCH_CONDITIONS,
  type BenchConditionConfig,
  type BenchConfigV1,
  type BenchExecutionConfig,
  type BenchMetadata,
  type BenchTaskConfig,
  type BenchTaskVerifierConfig,
  type BenchTaskVerifierFunctionName,
  type LoadedBenchConfig
} from './types.js';

type BenchConfigErrorReason = 'BENCH_CONFIG_PARSE_ERROR' | 'BENCH_CONFIG_INVALID';

const FUNCTION_VERIFIERS: BenchTaskVerifierFunctionName[] = ['bundle_file_exists', 'bundle_file_contains'];

export class BenchConfigError extends Error {
  readonly reason: BenchConfigErrorReason;
  readonly details?: Record<string, unknown>;

  constructor(reason: BenchConfigErrorReason, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'BenchConfigError';
    this.reason = reason;
    this.details = details;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BenchConfigError('BENCH_CONFIG_INVALID', `${field} must be a non-empty string`, { field, value });
  }
  return value.trim();
}

function readOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  return readString(value, field);
}

function readInteger(
  value: unknown,
  field: string,
  options: { min?: number; max?: number } = {}
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new BenchConfigError('BENCH_CONFIG_INVALID', `${field} must be an integer`, { field, value });
  }

  if (options.min !== undefined && value < options.min) {
    throw new BenchConfigError('BENCH_CONFIG_INVALID', `${field} must be >= ${options.min}`, { field, value });
  }

  if (options.max !== undefined && value > options.max) {
    throw new BenchConfigError('BENCH_CONFIG_INVALID', `${field} must be <= ${options.max}`, { field, value });
  }

  return value;
}

function parseMetadata(value: unknown): BenchMetadata {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    throw new BenchConfigError('BENCH_CONFIG_INVALID', 'metadata must be an object', { field: 'metadata' });
  }

  return {
    suite: readOptionalString(value.suite, 'metadata.suite'),
    model_label: readOptionalString(value.model_label, 'metadata.model_label'),
    environment_label: readOptionalString(value.environment_label, 'metadata.environment_label')
  };
}

function parseExecution(value: unknown): BenchExecutionConfig {
  if (value === undefined) {
    return {
      retries: 0,
      seed: 0,
      deterministic: false
    };
  }

  if (!isRecord(value)) {
    throw new BenchConfigError('BENCH_CONFIG_INVALID', 'execution must be an object', { field: 'execution' });
  }

  let deterministic = false;
  if (value.deterministic !== undefined) {
    if (typeof value.deterministic !== 'boolean') {
      throw new BenchConfigError('BENCH_CONFIG_INVALID', 'execution.deterministic must be boolean', {
        field: 'execution.deterministic',
        value: value.deterministic
      });
    }
    deterministic = value.deterministic;
  }

  return {
    retries: value.retries === undefined ? 0 : readInteger(value.retries, 'execution.retries', { min: 0, max: 10 }),
    seed: value.seed === undefined ? 0 : readInteger(value.seed, 'execution.seed'),
    deterministic
  };
}

function parseVerifier(value: unknown, fieldPrefix: string): BenchTaskVerifierConfig {
  if (!isRecord(value)) {
    throw new BenchConfigError('BENCH_CONFIG_INVALID', `${fieldPrefix} must be an object`, { field: fieldPrefix });
  }

  const type = typeof value.type === 'string' ? value.type : undefined;
  if (type !== undefined && type !== 'command' && type !== 'function') {
    throw new BenchConfigError('BENCH_CONFIG_INVALID', `${fieldPrefix}.type must be command|function`, {
      field: `${fieldPrefix}.type`,
      value: value.type
    });
  }

  if (type === 'command' || value.command !== undefined) {
    return {
      type: 'command',
      command: readString(value.command, `${fieldPrefix}.command`)
    };
  }

  if (type === 'function' || value.function !== undefined) {
    const fn = readString(value.function, `${fieldPrefix}.function`) as BenchTaskVerifierFunctionName;
    if (!FUNCTION_VERIFIERS.includes(fn)) {
      throw new BenchConfigError('BENCH_CONFIG_INVALID', `${fieldPrefix}.function must be one of ${FUNCTION_VERIFIERS.join(', ')}`, {
        field: `${fieldPrefix}.function`,
        value: fn
      });
    }

    const args = value.args;
    if (args !== undefined && !isRecord(args)) {
      throw new BenchConfigError('BENCH_CONFIG_INVALID', `${fieldPrefix}.args must be an object`, {
        field: `${fieldPrefix}.args`,
        value: args
      });
    }

    return {
      type: 'function',
      function: fn,
      args: args ? { ...args } : undefined
    };
  }

  throw new BenchConfigError('BENCH_CONFIG_INVALID', `${fieldPrefix} requires either a command or function verifier`, {
    field: fieldPrefix
  });
}

function parseTasks(value: unknown): BenchTaskConfig[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new BenchConfigError('BENCH_CONFIG_INVALID', 'tasks must be a non-empty array', {
      field: 'tasks',
      value
    });
  }

  const out: BenchTaskConfig[] = [];
  const ids = new Set<string>();

  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    const fieldPrefix = `tasks[${index}]`;
    if (!isRecord(item)) {
      throw new BenchConfigError('BENCH_CONFIG_INVALID', `${fieldPrefix} must be an object`, { field: fieldPrefix });
    }

    const id = readString(item.id, `${fieldPrefix}.id`);
    if (ids.has(id)) {
      throw new BenchConfigError('BENCH_CONFIG_INVALID', `duplicate task id: ${id}`, { field: `${fieldPrefix}.id`, id });
    }
    ids.add(id);

    out.push({
      id,
      domain: readString(item.domain, `${fieldPrefix}.domain`),
      timeout_ms: readInteger(item.timeout_ms, `${fieldPrefix}.timeout_ms`, { min: 1 }),
      verifier: parseVerifier(item.verifier, `${fieldPrefix}.verifier`)
    });
  }

  return out;
}

function parseConditions(value: unknown): BenchConditionConfig[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new BenchConfigError('BENCH_CONFIG_INVALID', 'conditions must be a non-empty array', {
      field: 'conditions',
      value
    });
  }

  const out: BenchConditionConfig[] = [];
  const ids = new Set<string>();

  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    const fieldPrefix = `conditions[${index}]`;
    if (!isRecord(item)) {
      throw new BenchConfigError('BENCH_CONFIG_INVALID', `${fieldPrefix} must be an object`, { field: fieldPrefix });
    }

    const id = readString(item.id, `${fieldPrefix}.id`);
    if (ids.has(id)) {
      throw new BenchConfigError('BENCH_CONFIG_INVALID', `duplicate condition id: ${id}`, {
        field: `${fieldPrefix}.id`,
        id
      });
    }
    ids.add(id);

    let adapter: BenchConditionConfig['adapter'];
    if (item.adapter !== undefined) {
      if (!isRecord(item.adapter)) {
        throw new BenchConfigError('BENCH_CONFIG_INVALID', `${fieldPrefix}.adapter must be an object`, {
          field: `${fieldPrefix}.adapter`,
          value: item.adapter
        });
      }

      if (item.adapter.options !== undefined && !isRecord(item.adapter.options)) {
        throw new BenchConfigError('BENCH_CONFIG_INVALID', `${fieldPrefix}.adapter.options must be an object`, {
          field: `${fieldPrefix}.adapter.options`,
          value: item.adapter.options
        });
      }

      adapter = {
        id: readString(item.adapter.id, `${fieldPrefix}.adapter.id`),
        options: isRecord(item.adapter.options) ? { ...item.adapter.options } : undefined
      };
    }

    const bundlePath = readOptionalString(item.bundle_path, `${fieldPrefix}.bundle_path`);
    if (id === 'self_generated_skill' && !bundlePath) {
      if (!adapter || adapter.id !== 'stub') {
        throw new BenchConfigError(
          'BENCH_CONFIG_INVALID',
          `${fieldPrefix} requires either bundle_path or adapter.id=stub`,
          { field: fieldPrefix, id }
        );
      }
      const adapterBundle = adapter.options?.bundle_path;
      if (typeof adapterBundle !== 'string' || adapterBundle.trim().length === 0) {
        throw new BenchConfigError(
          'BENCH_CONFIG_INVALID',
          `${fieldPrefix}.adapter.options.bundle_path must be a non-empty string when adapter.id=stub`,
          { field: `${fieldPrefix}.adapter.options.bundle_path` }
        );
      }
    }

    out.push({
      id,
      bundle_path: bundlePath,
      adapter
    });
  }

  for (const required of REQUIRED_BENCH_CONDITIONS) {
    if (!ids.has(required)) {
      throw new BenchConfigError('BENCH_CONFIG_INVALID', `missing required condition: ${required}`, {
        field: 'conditions',
        required_condition: required
      });
    }
  }

  return out;
}

export function parseBenchConfig(rawConfig: string): BenchConfigV1 {
  let parsed: unknown;
  try {
    parsed = YAML.parse(rawConfig);
  } catch (err) {
    throw new BenchConfigError('BENCH_CONFIG_PARSE_ERROR', 'Failed to parse benchmark config', {
      error: err instanceof Error ? err.message : String(err)
    });
  }

  if (!isRecord(parsed)) {
    throw new BenchConfigError('BENCH_CONFIG_INVALID', 'benchmark config must be an object', { field: 'root' });
  }

  const schema = parsed.schema === undefined ? BENCH_CONFIG_SCHEMA_V1 : readString(parsed.schema, 'schema');
  if (schema !== BENCH_CONFIG_SCHEMA_V1) {
    throw new BenchConfigError('BENCH_CONFIG_INVALID', `schema must be ${BENCH_CONFIG_SCHEMA_V1}`, {
      field: 'schema',
      value: schema
    });
  }

  return {
    schema: BENCH_CONFIG_SCHEMA_V1,
    metadata: parseMetadata(parsed.metadata),
    execution: parseExecution(parsed.execution),
    conditions: parseConditions(parsed.conditions),
    tasks: parseTasks(parsed.tasks)
  };
}

export async function loadBenchConfig(configPath: string): Promise<LoadedBenchConfig> {
  const absoluteConfigPath = path.resolve(configPath);

  let raw: string;
  try {
    raw = await fs.readFile(absoluteConfigPath, 'utf8');
  } catch (err) {
    throw new BenchConfigError('BENCH_CONFIG_PARSE_ERROR', `Failed to read benchmark config: ${absoluteConfigPath}`, {
      path: absoluteConfigPath,
      error: err instanceof Error ? err.message : String(err)
    });
  }

  return {
    config_path: absoluteConfigPath,
    config_dir: path.dirname(absoluteConfigPath),
    config: parseBenchConfig(raw)
  };
}
