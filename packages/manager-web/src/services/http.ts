export const API_BASE = (import.meta.env.VITE_MANAGER_API_URL || 'http://127.0.0.1:4646').replace(/\/$/, '');
export const API_TOKEN_STORAGE_KEY = 'skillvault_manager_token';
let runtimeApiToken: string | null = null;

export interface ApiErrorPayload {
  code?: string;
  error?: string;
  message?: string;
  remediation?: string;
  details?: unknown;
  [key: string]: unknown;
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly path: string;
  readonly method: string;
  readonly payload: ApiErrorPayload | null;
  readonly responseText: string;

  constructor(input: {
    status: number;
    path: string;
    method: string;
    message: string;
    payload: ApiErrorPayload | null;
    responseText: string;
  }) {
    super(input.message);
    this.name = 'ApiRequestError';
    this.status = input.status;
    this.path = input.path;
    this.method = input.method;
    this.payload = input.payload;
    this.responseText = input.responseText;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseErrorMessage(payload: ApiErrorPayload | null, fallbackText: string): string {
  const candidate = payload?.message ?? payload?.error;
  if (typeof candidate === 'string' && candidate.trim().length > 0) {
    return candidate.trim();
  }
  return fallbackText.trim().length > 0 ? fallbackText.trim() : 'Request failed';
}

function readApiToken(): string | null {
  if (runtimeApiToken && runtimeApiToken.length > 0) {
    return runtimeApiToken;
  }
  const fromEnv = typeof import.meta.env.VITE_MANAGER_API_TOKEN === 'string'
    ? import.meta.env.VITE_MANAGER_API_TOKEN.trim()
    : '';
  const envToken = fromEnv.length > 0 ? fromEnv : null;
  if (typeof window === 'undefined') {
    return envToken;
  }
  try {
    return window.localStorage.getItem(API_TOKEN_STORAGE_KEY) || envToken;
  } catch {
    return envToken;
  }
}

export function setApiToken(token: string | null): void {
  runtimeApiToken = token && token.length > 0 ? token : null;
  if (typeof window === 'undefined') return;
  try {
    if (!token) {
      window.localStorage.removeItem(API_TOKEN_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(API_TOKEN_STORAGE_KEY, token);
  } catch {
    // Ignore storage errors.
  }
}

function buildApiUrl(inputPath: string): string {
  const base = new URL(API_BASE);
  const normalizedInputPath = inputPath.startsWith('/') ? inputPath : `/${inputPath}`;
  const basePath = base.pathname.replace(/\/+$/, '');

  let resolvedPath = normalizedInputPath;
  if (basePath && basePath !== '/') {
    if (normalizedInputPath !== basePath && !normalizedInputPath.startsWith(`${basePath}/`)) {
      resolvedPath = `${basePath}${normalizedInputPath}`;
    }
  }

  return `${base.origin}${resolvedPath}`;
}

async function request<T>(inputPath: string, init?: RequestInit): Promise<T> {
  const token = readApiToken();
  const method = (init?.method ?? 'GET').toUpperCase();
  const headers = new Headers(init?.headers ?? {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(buildApiUrl(inputPath), {
    ...init,
    headers
  });

  if (!response.ok) {
    const rawBody = await response.text();
    let payload: ApiErrorPayload | null = null;
    if (rawBody) {
      try {
        const parsed = JSON.parse(rawBody) as unknown;
        if (isRecord(parsed)) {
          payload = parsed as ApiErrorPayload;
        }
      } catch {
        payload = null;
      }
    }

    const message = parseErrorMessage(payload, rawBody);
    throw new ApiRequestError({
      status: response.status,
      path: inputPath,
      method,
      message: `API ${response.status}: ${message}`,
      payload,
      responseText: rawBody
    });
  }

  return (await response.json()) as T;
}

export async function apiGet<T>(inputPath: string): Promise<T> {
  return request<T>(inputPath, { method: 'GET' });
}

export async function apiPost<T = unknown>(inputPath: string, body?: unknown): Promise<T> {
  return request<T>(inputPath, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}
