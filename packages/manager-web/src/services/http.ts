const API_BASE = (import.meta.env.VITE_MANAGER_API_URL || 'http://127.0.0.1:4646').replace(/\/$/, '');
export const API_TOKEN_STORAGE_KEY = 'skillvault_manager_token';
let runtimeApiToken: string | null = null;

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
    const body = await response.text();
    throw new Error(`API ${response.status}: ${body}`);
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
