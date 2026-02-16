import fs from 'node:fs/promises';
import YAML from 'yaml';

import type { ReasonCode, Verdict } from '../contracts.js';
import { POLICY_VERSION, type CapabilityName, type PolicyCapabilityRuleV1, type PolicyConstraintsV1, type PolicyProfileV1, type PolicyV1 } from '../policy-v1.js';

const ALL_VERDICTS: Verdict[] = ['PASS', 'WARN', 'FAIL'];
const CAPABILITIES: CapabilityName[] = ['network', 'exec', 'writes'];
const CAPABILITY_MODES: PolicyCapabilityRuleV1['mode'][] = ['allow', 'block', 'require_approval'];

export const DEFAULT_POLICY_V1: PolicyV1 = {
  policy_version: POLICY_VERSION,
  gates: {
    max_risk_score: 100,
    allow_verdicts: [...ALL_VERDICTS]
  },
  capabilities: {
    network: { mode: 'allow' },
    exec: { mode: 'allow' },
    writes: { mode: 'allow' }
  },
  constraints: {
    exactly_one_manifest: true
  },
  profiles: {}
};

export class PolicyLoadError extends Error {
  readonly reason: ReasonCode;
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'PolicyLoadError';
    this.reason = 'POLICY_PARSE_ERROR';
    this.details = details;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseVerdictList(value: unknown, field: string): Verdict[] {
  if (!Array.isArray(value)) {
    throw new PolicyLoadError(`${field} must be an array`, { field, kind: 'schema' });
  }

  const out: Verdict[] = [];
  for (const v of value) {
    if (v !== 'PASS' && v !== 'WARN' && v !== 'FAIL') {
      throw new PolicyLoadError(`${field} contains invalid verdict: ${String(v)}`, { field, kind: 'schema', verdict: v });
    }
    if (!out.includes(v)) out.push(v);
  }

  if (out.length === 0) {
    throw new PolicyLoadError(`${field} must contain at least one verdict`, { field, kind: 'schema' });
  }

  return out;
}

function parseInteger(value: unknown, field: string, opts: { min?: number; max?: number } = {}): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new PolicyLoadError(`${field} must be an integer`, { field, kind: 'schema', value });
  }

  if (opts.min !== undefined && value < opts.min) {
    throw new PolicyLoadError(`${field} must be >= ${opts.min}`, { field, kind: 'schema', value, min: opts.min });
  }

  if (opts.max !== undefined && value > opts.max) {
    throw new PolicyLoadError(`${field} must be <= ${opts.max}`, { field, kind: 'schema', value, max: opts.max });
  }

  return value;
}

function parseConstraints(value: unknown): PolicyConstraintsV1 {
  if (!isRecord(value)) throw new PolicyLoadError('constraints must be an object', { field: 'constraints', kind: 'schema' });

  const out: PolicyConstraintsV1 = {};

  if (value.exactly_one_manifest !== undefined) {
    if (typeof value.exactly_one_manifest !== 'boolean') {
      throw new PolicyLoadError('constraints.exactly_one_manifest must be boolean', {
        field: 'constraints.exactly_one_manifest',
        kind: 'schema',
        value: value.exactly_one_manifest
      });
    }
    out.exactly_one_manifest = value.exactly_one_manifest;
  }

  if (value.bundle_size_limit_bytes !== undefined) {
    out.bundle_size_limit_bytes = parseInteger(value.bundle_size_limit_bytes, 'constraints.bundle_size_limit_bytes', { min: 0 });
  }

  if (value.file_size_limit_bytes !== undefined) {
    out.file_size_limit_bytes = parseInteger(value.file_size_limit_bytes, 'constraints.file_size_limit_bytes', { min: 0 });
  }

  if (value.max_manifest_tokens_warn !== undefined) {
    out.max_manifest_tokens_warn = parseInteger(value.max_manifest_tokens_warn, 'constraints.max_manifest_tokens_warn', { min: 0 });
  }

  if (value.max_manifest_tokens_fail !== undefined) {
    out.max_manifest_tokens_fail = parseInteger(value.max_manifest_tokens_fail, 'constraints.max_manifest_tokens_fail', { min: 0 });
  }

  if (
    out.max_manifest_tokens_warn !== undefined &&
    out.max_manifest_tokens_fail !== undefined &&
    out.max_manifest_tokens_warn > out.max_manifest_tokens_fail
  ) {
    throw new PolicyLoadError('constraints.max_manifest_tokens_warn must be <= constraints.max_manifest_tokens_fail', {
      field: 'constraints',
      kind: 'schema'
    });
  }

  return out;
}

function parseCapabilities(value: unknown): PolicyProfileV1['capabilities'] {
  if (!isRecord(value)) throw new PolicyLoadError('capabilities must be an object', { field: 'capabilities', kind: 'schema' });

  const out: NonNullable<PolicyProfileV1['capabilities']> = {};
  for (const capability of CAPABILITIES) {
    const rawRule = value[capability];
    if (rawRule === undefined) continue;
    if (!isRecord(rawRule)) {
      throw new PolicyLoadError(`capabilities.${capability} must be an object`, {
        field: `capabilities.${capability}`,
        kind: 'schema'
      });
    }

    const mode = rawRule.mode;
    if (!CAPABILITY_MODES.includes(mode as PolicyCapabilityRuleV1['mode'])) {
      throw new PolicyLoadError(`capabilities.${capability}.mode must be one of ${CAPABILITY_MODES.join(', ')}`, {
        field: `capabilities.${capability}.mode`,
        kind: 'schema',
        value: mode
      });
    }

    out[capability] = {
      mode: mode as PolicyCapabilityRuleV1['mode'],
      note: typeof rawRule.note === 'string' ? rawRule.note : undefined
    };
  }

  return out;
}

function parseProfile(value: unknown, fieldPrefix = ''): PolicyProfileV1 {
  if (!isRecord(value)) {
    throw new PolicyLoadError(`${fieldPrefix || 'profile'} must be an object`, {
      field: fieldPrefix || 'profile',
      kind: 'schema'
    });
  }

  const out: PolicyProfileV1 = {};

  if (value.gates !== undefined) {
    if (!isRecord(value.gates)) throw new PolicyLoadError(`${fieldPrefix}gates must be an object`, { field: `${fieldPrefix}gates`, kind: 'schema' });
    const gates: NonNullable<PolicyProfileV1['gates']> = {};
    if (value.gates.max_risk_score !== undefined) {
      gates.max_risk_score = parseInteger(value.gates.max_risk_score, `${fieldPrefix}gates.max_risk_score`, { min: 0, max: 100 });
    }
    if (value.gates.allow_verdicts !== undefined) {
      gates.allow_verdicts = parseVerdictList(value.gates.allow_verdicts, `${fieldPrefix}gates.allow_verdicts`);
    }
    out.gates = gates;
  }

  if (value.capabilities !== undefined) {
    out.capabilities = parseCapabilities(value.capabilities);
  }

  if (value.constraints !== undefined) {
    out.constraints = parseConstraints(value.constraints);
  }

  return out;
}

function mergeProfile(base: PolicyProfileV1, overlay?: PolicyProfileV1): PolicyProfileV1 {
  if (!overlay) return base;
  return {
    gates: { ...base.gates, ...overlay.gates },
    capabilities: { ...base.capabilities, ...overlay.capabilities },
    constraints: { ...base.constraints, ...overlay.constraints }
  };
}

export function parsePolicyV1(rawYaml: string): PolicyV1 {
  let parsed: unknown;
  try {
    parsed = YAML.parse(rawYaml) as unknown;
  } catch (err) {
    throw new PolicyLoadError('Failed to parse policy YAML', {
      kind: 'yaml',
      error: err instanceof Error ? err.message : String(err)
    });
  }

  if (!isRecord(parsed)) {
    throw new PolicyLoadError('Policy YAML must be an object', { kind: 'schema', field: 'root' });
  }

  const version = parsed.policy_version;
  if (version !== undefined && version !== POLICY_VERSION) {
    throw new PolicyLoadError('policy_version must be v1', {
      field: 'policy_version',
      kind: 'schema',
      value: version
    });
  }

  const parsedTop = parseProfile(parsed);

  let parsedProfiles: Record<string, PolicyProfileV1> = {};
  if (parsed.profiles !== undefined) {
    if (!isRecord(parsed.profiles)) {
      throw new PolicyLoadError('profiles must be an object mapping profile name to profile object', {
        field: 'profiles',
        kind: 'schema'
      });
    }
    parsedProfiles = {};
    for (const [name, profileRaw] of Object.entries(parsed.profiles)) {
      parsedProfiles[name] = parseProfile(profileRaw, `profiles.${name}.`);
    }
  }

  const mergedTop = mergeProfile(DEFAULT_POLICY_V1, parsedTop);

  return {
    policy_version: POLICY_VERSION,
    gates: mergedTop.gates,
    capabilities: mergedTop.capabilities,
    constraints: mergedTop.constraints,
    profiles: parsedProfiles
  };
}

export async function loadPolicyV1(policyPath?: string): Promise<PolicyV1> {
  if (!policyPath) {
    return JSON.parse(JSON.stringify(DEFAULT_POLICY_V1)) as PolicyV1;
  }

  let raw: string;
  try {
    raw = await fs.readFile(policyPath, 'utf8');
  } catch (err) {
    throw new PolicyLoadError(`Failed to read policy file: ${policyPath}`, {
      kind: 'io',
      path: policyPath,
      error: err instanceof Error ? err.message : String(err)
    });
  }

  return parsePolicyV1(raw);
}
