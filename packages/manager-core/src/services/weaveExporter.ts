import type { TelemetryEvent } from '../adapters/types.js';

export interface WeaveExporterConfig {
  endpoint: string;
  projectName?: string;
  apiKey?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  allowedHosts?: string[];
}

function parseAllowedHosts(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

export function isWeaveEndpointAllowed(endpoint: string, allowedHosts: string[] = []): boolean {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    return false;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return false;
  }

  if (allowedHosts.length > 0) {
    return allowedHosts.includes(parsed.hostname.toLowerCase());
  }

  if (parsed.protocol === 'http:') {
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  }

  return true;
}

export function weaveConfigFromEnv(): WeaveExporterConfig | null {
  const endpoint = process.env.SKILLVAULT_WEAVE_ENDPOINT || process.env.SKILLVAULT_WEAVE_BASE_URL;
  if (!endpoint) return null;

  const allowedHosts = parseAllowedHosts(process.env.SKILLVAULT_WEAVE_ALLOWED_HOSTS);
  if (!isWeaveEndpointAllowed(endpoint, allowedHosts)) {
    return null;
  }

  return {
    endpoint,
    projectName: process.env.SKILLVAULT_WEAVE_PROJECT || 'skillvault-v03',
    apiKey: process.env.SKILLVAULT_WEAVE_API_KEY,
    timeoutMs: Number(process.env.SKILLVAULT_WEAVE_TIMEOUT_MS || 5000),
    allowedHosts
  };
}

export class WeaveExporter {
  private readonly endpoint: string;
  private readonly projectName: string;
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly allowedHosts: string[];

  constructor(config: WeaveExporterConfig) {
    this.endpoint = config.endpoint;
    this.projectName = config.projectName ?? 'skillvault-v03';
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs ?? 5000;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.allowedHosts = config.allowedHosts ?? [];

    if (!isWeaveEndpointAllowed(this.endpoint, this.allowedHosts)) {
      throw new Error(`Weave endpoint not allowed: ${this.endpoint}`);
    }
  }

  async exportEvents(events: TelemetryEvent[]): Promise<void> {
    if (events.length === 0) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {})
        },
        body: JSON.stringify({
          project: this.projectName,
          source: 'skillvault',
          events
        }),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`Weave export failed with ${response.status}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}

