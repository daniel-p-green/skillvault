import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SkillVaultManager } from '../src/services/manager.js';

describe('manager storage', () => {
  it('initializes sqlite database and seeds adapters', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skillvault-manager-'));
    const manager = new SkillVaultManager(root);
    try {
      const info = await manager.init();
      expect(info.dbPath.endsWith('skillvault.db')).toBe(true);
      const adapters = manager.listAdapters();
      expect(adapters.length).toBeGreaterThan(20);
    } finally {
      await manager.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
