import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { SkillVaultManager } from '@skillvault/manager-core';
import { createServer } from '../src/server.js';

describe('manager api auth mode', () => {
  afterEach(() => {
    delete process.env.SKILLVAULT_AUTH_MODE;
  });

  it('enforces RBAC permissions when auth mode is required', async () => {
    process.env.SKILLVAULT_AUTH_MODE = 'required';

    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skillvault-manager-api-auth-'));
    const manager = new SkillVaultManager(root);
    await manager.init();
    const admin = await manager.authBootstrap();
    const viewer = await manager.createAuthToken({ principalId: 'viewer-user', roleName: 'viewer' });
    const operator = await manager.createAuthToken({ principalId: 'operator-user', roleName: 'operator' });
    await manager.close();

    const app = createServer({ rootDir: root });
    try {
      const bundleDir = path.join(root, 'bundle');
      await fs.mkdir(bundleDir, { recursive: true });
      await fs.writeFile(path.join(bundleDir, 'SKILL.md'), '---\nname: auth-skill\ndescription: auth\n---\n', 'utf8');
      await fs.writeFile(path.join(bundleDir, 'tool.js'), 'export const auth = true;\n', 'utf8');

      const health = await app.inject({ method: 'GET', url: '/health' });
      expect(health.statusCode).toBe(200);

      const unauthenticatedSkills = await app.inject({ method: 'GET', url: '/skills' });
      expect(unauthenticatedSkills.statusCode).toBe(401);

      const viewerSkills = await app.inject({
        method: 'GET',
        url: '/skills',
        headers: { authorization: `Bearer ${viewer.token}` }
      });
      expect(viewerSkills.statusCode).toBe(200);

      const viewerImport = await app.inject({
        method: 'POST',
        url: '/skills/import',
        headers: { authorization: `Bearer ${viewer.token}` },
        payload: { path: bundleDir }
      });
      expect(viewerImport.statusCode).toBe(403);

      const operatorImport = await app.inject({
        method: 'POST',
        url: '/skills/import',
        headers: { authorization: `Bearer ${operator.token}` },
        payload: { path: bundleDir }
      });
      expect(operatorImport.statusCode).toBe(200);

      const operatorCreateToken = await app.inject({
        method: 'POST',
        url: '/auth/tokens',
        headers: { authorization: `Bearer ${operator.token}` },
        payload: { principalId: 'new-user', roleName: 'viewer' }
      });
      expect(operatorCreateToken.statusCode).toBe(403);

      const adminCreateToken = await app.inject({
        method: 'POST',
        url: '/auth/tokens',
        headers: { authorization: `Bearer ${admin.token}` },
        payload: { principalId: 'new-user', roleName: 'viewer' }
      });
      expect(adminCreateToken.statusCode).toBe(200);
      const adminTokenBody = adminCreateToken.json() as { token: string };
      expect(adminTokenBody.token.startsWith('svtok_')).toBe(true);

      const me = await app.inject({
        method: 'GET',
        url: '/me',
        headers: { authorization: `Bearer ${admin.token}` }
      });
      expect(me.statusCode).toBe(200);
      const meBody = me.json() as { authMode: string; session: { roleName: string } };
      expect(meBody.authMode).toBe('required');
      expect(meBody.session.roleName).toBe('admin');
    } finally {
      await app.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

