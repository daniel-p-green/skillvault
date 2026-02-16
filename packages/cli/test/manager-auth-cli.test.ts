import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SkillVaultManager } from '@skillvault/manager-core';
import { main } from '../src/cli.js';

async function readJsonFile<T>(inputPath: string): Promise<T> {
  const raw = await fs.readFile(inputPath, 'utf8');
  return JSON.parse(raw) as T;
}

describe('skillvault manager auth CLI', () => {
  it('bootstraps auth and creates scoped tokens', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skillvault-manager-auth-cli-'));
    const bootstrapOut = path.join(root, 'auth-bootstrap.json');
    const createOut = path.join(root, 'auth-create.json');

    try {
      const initCode = await main([
        'node', 'skillvault', 'manager', 'init',
        '--root', root
      ]);
      expect(initCode).toBe(0);

      const bootstrapCode = await main([
        'node', 'skillvault', 'manager', 'auth', 'bootstrap',
        '--root', root,
        '--out', bootstrapOut
      ]);
      expect(bootstrapCode).toBe(0);
      const bootstrap = await readJsonFile<{ principalId: string; token: string }>(bootstrapOut);
      expect(bootstrap.token.startsWith('svtok_')).toBe(true);

      const manager = new SkillVaultManager(root);
      await manager.init();
      try {
        const row = manager.db.db.prepare(`
          SELECT token_hash
          FROM api_tokens
          WHERE principal_id = ?
          ORDER BY created_at DESC
          LIMIT 1
        `).get(bootstrap.principalId) as { token_hash: string } | undefined;
        expect(row).toBeDefined();
        expect(row?.token_hash).not.toBe(bootstrap.token);
      } finally {
        await manager.close();
      }

      const createCode = await main([
        'node', 'skillvault', 'manager', 'auth', 'token', 'create',
        '--principal', 'service-ci',
        '--role', 'viewer',
        '--root', root,
        '--out', createOut
      ]);
      expect(createCode).toBe(0);
      const created = await readJsonFile<{ roleName: string; token: string }>(createOut);
      expect(created.roleName).toBe('viewer');
      expect(created.token.startsWith('svtok_')).toBe(true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

