import fs from 'node:fs/promises';
import YAML from 'yaml';

import type { ReasonCode } from '../contracts.js';
import { POLICY_VERSION, type PolicyV1, type PolicyProfileV1 } from '../policy-v1.js';

export class PolicyLoadError extends Error {
  readonly reason: ReasonCode;
  readonly details?: Record<string, unknown>;

  constructor(message: string, opts: { reason: ReasonCode; details?: Record<string, unknown> }) {
    super(message);
    this.name = 'PolicyLoadError';
    this.reason = opts.reason;
    this.details = opts.details;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseVerdicts(value: unknown): PolicyProfileV1['gates'] extends { allow_verdicts?: infer T } ? T : never {
  if (!Array.isArray(value)) return undefined as never;
  const allowed = value.filter((v) => v === 'PASS' || v === 'WARN' || v === 'FAIL');
  return (allowed.length > 0 ? (allowed as any) : undefined) as never;
}

function parseProfileV1(value: unknown): PolicyProfileV1 {
  if (!isRecord(value)) return {};

  const gates = isRecord(value.gates) ? value.gates : undefined;
  const capabilities = isRecord(value.capabilities) ? value.capabilities : undefined;
  const constraints = isRecord(value.constraints) ? value.constraints : undefined;

  const profile: PolicyProfileV1 = {};

  if (gates) {
    const max = typeof gates.max_risk_score === 'number' ? gates.max_risk_score : undefined;
    const allow = parseVerdicts(gates.allow_verdicts);
    if (max !== undefined || allow !== undefined) {
      profile.gates = {
        max_risk_score: max,
        allow_verdicts: allow as any
      };
    }
  }

  if (capabilities) {
    const capRules: PolicyProfileV1['capabilities'] = {};
    for (const name of ['network', 'exec', 'writes'] as const) {
      const rule = capabilities[name];
      if (!isRecord(rule)) continue;
      const mode = rule.mode;
      if (mode === 'allow' || mode === 'block' || mode === 'require_approval') {
        capRules[name] = { mode, note: typeof rule.note === 'string' ? rule.note : undefined };
      }
    }
    if (Object.keys(capRules).length > 0) profile.capabilities = capRules;
  }

  if (constraints) {
    const c: PolicyProfileV1['constraints'] = {};
    if (typeof constraints.exactly_one_manifest === 'boolean') c.exactly_one_manifest = constraints.exactly_one_manifest;
    if (typeof constraints.bundle_size_limit_bytes === 'number') c.bundle_size_limit_bytes = constraints.bundle_size_limit_bytes;
    if (typeof constraints.file_size_limit_bytes === 'number') c.file_size_limit_bytes = constraints.file_size_limit_bytes;
    if (typeof constraints.max_manifest_tokens_warn === 'number') c.max_manifest_tokens_warn = constraints.max_manifest_tokens_warn;
    if (typeof constraints.max_manifest_tokens_fail === 'number') c.max_manifest_tokens_fail = constraints.max_manifest_tokens_fail;
    if (Object.keys(c).length > 0) profile.constraints = c;
  }

  return profile;
}

export function parsePolicyV1(rawYaml: string): PolicyV1 {
  let parsed: unknown;
  try {
    parsed = YAML.parse(rawYaml) as unknown;
  } catch (err) {
    throw new PolicyLoadError('Failed to parse policy YAML', {
      reason: 'POLICY_PARSE_ERROR',
      details: { error: err instanceof Error ? err.message : String(err) }
    });
  }

  if (!isRecord(parsed)) {
    throw new PolicyLoadError('Policy YAML must be a mapping/object', {
      reason: 'POLICY_SCHEMA_INVALID'
    });
  }

  const version = parsed.policy_version;
  if (version !== undefined && version !== POLICY_VERSION) {
    throw new PolicyLoadError(`Unsupported policy_version: ${String(version)}`, {
      reason: 'POLICY_SCHEMA_INVALID',
      details: { policy_version: version }
    });
  }

  const base = parseProfileV1(parsed);

  const profilesValue = parsed.profiles;
  let profiles: PolicyV1['profiles'];
  if (profilesValue !== undefined) {
    if (!isRecord(profilesValue)) {
      throw new PolicyLoadError('profiles must be an object mapping profileName -> profile', {
        reason: 'POLICY_SCHEMA_INVALID'
      });
    }

    profiles = {};
    for (const [name, profile] of Object.entries(profilesValue)) {
      profiles[name] = parseProfileV1(profile);
    }
  }

  return {
    policy_version: version === undefined ? undefined : POLICY_VERSION,
    ...base,
    profiles
  };
}

export async function loadPolicyV1(policyPath?: string): Promise<PolicyV1 | undefined> {
  if (!policyPath) return undefined;

  let raw: string;
  try {
    raw = await fs.readFile(policyPath, 'utf8');
  } catch (err) {
    throw new PolicyLoadError(`Failed to read policy file: ${policyPath}`, {
      reason: 'POLICY_PARSE_ERROR',
      details: { error: err instanceof Error ? err.message : String(err) }
    });
  }

  return parsePolicyV1(raw);
}
