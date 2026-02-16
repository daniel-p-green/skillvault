import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SkillVaultManager } from '../src/services/manager.js';

describe('rbac auth service', () => {
  it('bootstraps roles, hashes tokens, and enforces permissions', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skillvault-rbac-'));
    const manager = new SkillVaultManager(root);
    try {
      await manager.init();
      const bootstrap = await manager.authBootstrap();
      expect(bootstrap.token.startsWith('svtok_')).toBe(true);

      const tokenRow = manager.db.db.prepare(`
        SELECT token_hash
        FROM api_tokens
        WHERE principal_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(bootstrap.principalId) as { token_hash: string } | undefined;
      expect(tokenRow).toBeDefined();
      expect(tokenRow?.token_hash).not.toBe(bootstrap.token);

      const adminSession = manager.authenticateToken(bootstrap.token);
      expect(adminSession?.roleName).toBe('admin');
      expect(adminSession?.permissions.includes('*')).toBe(true);

      const viewerToken = await manager.createAuthToken({
        principalId: 'audit-user',
        roleName: 'viewer',
        label: 'audit-viewer'
      });

      const readSession = manager.authorizeToken(viewerToken.token, 'read:skills');
      expect(readSession?.roleName).toBe('viewer');

      const denied = manager.authorizeToken(viewerToken.token, 'write:skills');
      expect(denied).toBeNull();
    } finally {
      await manager.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

