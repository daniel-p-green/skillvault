import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createServer } from '../src/server.js';

describe('manager api telemetry routes', () => {
  it('returns telemetry status and flushes outbox events', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skillvault-manager-api-telemetry-'));
    const app = createServer({ rootDir: root });
    try {
      const bundleDir = path.join(root, 'bundle');
      await fs.mkdir(bundleDir, { recursive: true });
      await fs.writeFile(path.join(bundleDir, 'SKILL.md'), '---\nname: api-telem\ndescription: telemetry\n---\n', 'utf8');
      await fs.writeFile(path.join(bundleDir, 'tool.js'), 'export const telem = true;\n', 'utf8');

      const importResponse = await app.inject({
        method: 'POST',
        url: '/skills/import',
        payload: { path: bundleDir }
      });
      expect(importResponse.statusCode).toBe(200);

      const statusResponse = await app.inject({ method: 'GET', url: '/telemetry/status' });
      expect(statusResponse.statusCode).toBe(200);
      const status = statusResponse.json() as { totals: { pending: number; total: number } };
      expect(status.totals.total).toBeGreaterThan(0);
      expect(status.totals.pending).toBeGreaterThan(0);

      const flushResponse = await app.inject({
        method: 'POST',
        url: '/telemetry/flush',
        payload: { target: 'jsonl', maxEvents: 100 }
      });
      expect(flushResponse.statusCode).toBe(200);
      const flush = flushResponse.json() as { sent: number; outputPath?: string };
      expect(flush.sent).toBeGreaterThan(0);
      expect(typeof flush.outputPath).toBe('string');
      expect(await fs.stat(String(flush.outputPath))).toBeTruthy();
    } finally {
      await app.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

