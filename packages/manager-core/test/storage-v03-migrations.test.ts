import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SkillVaultManager } from '../src/services/manager.js';

describe('manager storage v0.3 migrations', () => {
  it('creates telemetry, eval, and rbac tables', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skillvault-manager-v03-'));
    const manager = new SkillVaultManager(root);
    try {
      await manager.init();
      const rows = manager.db.db.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name IN (
            'telemetry_events',
            'eval_datasets',
            'eval_cases',
            'eval_runs',
            'eval_results',
            'principals',
            'roles',
            'principal_roles',
            'api_tokens'
          )
        ORDER BY name
      `).all() as Array<{ name: string }>;

      const found = rows.map((row) => row.name);
      expect(found).toEqual([
        'api_tokens',
        'eval_cases',
        'eval_datasets',
        'eval_results',
        'eval_runs',
        'principal_roles',
        'principals',
        'roles',
        'telemetry_events'
      ]);
    } finally {
      await manager.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
