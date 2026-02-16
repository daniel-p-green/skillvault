import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createServer } from '../src/server.js';

describe('manager api', () => {
  it('responds on /health', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skillvault-manager-api-'));
    const app = createServer({ rootDir: root });
    try {
      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true });
    } finally {
      await app.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('exposes adapter validation results', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skillvault-manager-api-'));
    const app = createServer({ rootDir: root });
    try {
      const response = await app.inject({ method: 'GET', url: '/adapters/validate' });
      expect(response.statusCode).toBe(200);
      const body = response.json() as { issues: Array<{ adapterId: string; issue: string }> };
      expect(Array.isArray(body.issues)).toBe(true);
      expect(body.issues).toEqual([]);
    } finally {
      await app.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
