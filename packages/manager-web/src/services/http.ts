const API_BASE = (import.meta.env.VITE_MANAGER_API_URL || 'http://127.0.0.1:4646').replace(/\/$/, '');

async function request<T>(inputPath: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${inputPath}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    },
    ...init
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
