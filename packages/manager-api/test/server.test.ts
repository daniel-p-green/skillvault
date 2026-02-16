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

  it('exposes discovery sources and filesystem skill inventory', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skillvault-manager-api-'));
    const app = createServer({ rootDir: root });
    try {
      const bundleDir = path.join(root, 'bundle');
      await fs.mkdir(bundleDir, { recursive: true });
      await fs.writeFile(path.join(bundleDir, 'SKILL.md'), '---\nname: fs-inventory\ndescription: test\n---\n', 'utf8');
      await fs.writeFile(path.join(bundleDir, 'tool.js'), 'export const ok = true;\n', 'utf8');

      const imported = await app.inject({
        method: 'POST',
        url: '/skills/import',
        payload: { path: bundleDir }
      });
      expect(imported.statusCode).toBe(200);
      const importBody = imported.json() as { skillId: string };

      const deployed = await app.inject({
        method: 'POST',
        url: `/skills/${importBody.skillId}/deploy`,
        payload: { adapter: 'codex', scope: 'project', mode: 'symlink' }
      });
      expect(deployed.statusCode).toBe(200);

      const sourcesResponse = await app.inject({ method: 'GET', url: '/discover/sources' });
      expect(sourcesResponse.statusCode).toBe(200);
      const sourcesBody = sourcesResponse.json() as { sources: Array<{ id: string; url: string }> };
      expect(sourcesBody.sources.some((source) => source.id === 'skills-sh')).toBe(true);

      const fsInventoryResponse = await app.inject({ method: 'GET', url: '/skills/filesystem' });
      expect(fsInventoryResponse.statusCode).toBe(200);
      const fsInventory = fsInventoryResponse.json() as {
        totals: { managedSkills: number; installations: number };
        skills: Array<{ skillId: string; installations: Array<{ adapterId: string }> }>;
      };
      expect(fsInventory.totals.managedSkills).toBeGreaterThanOrEqual(1);
      expect(fsInventory.totals.installations).toBeGreaterThanOrEqual(1);
      expect(fsInventory.skills.some((skill) => skill.skillId === importBody.skillId)).toBe(true);
    } finally {
      await app.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
