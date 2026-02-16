import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SkillVaultManager } from '../src/services/manager.js';

describe('manager integration flows', () => {
  it('runs init -> import -> deploy -> inventory end-to-end', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skillvault-e2e-'));
    const manager = new SkillVaultManager(root);
    try {
      await manager.init();
      const bundleDir = path.join(root, 'bundle');
      await fs.mkdir(bundleDir, { recursive: true });
      await fs.writeFile(path.join(bundleDir, 'SKILL.md'), '---\nname: e2e-skill\ndescription: e2e\n---\n', 'utf8');
      await fs.writeFile(path.join(bundleDir, 'tool.js'), 'export const e2e = true;\n', 'utf8');

      const imported = await manager.importSkill(bundleDir, { sourceType: 'path', sourceLocator: bundleDir });
      const deployments = await manager.deploy(imported.skillId, {
        adapter: 'codex',
        scope: 'project',
        mode: 'symlink'
      });
      const inventory = manager.inventory({ search: 'e2e' });

      expect(imported.verdict).toBe('PASS');
      expect(deployments.some((deployment) => deployment.status === 'deployed')).toBe(true);
      expect(inventory.some((skill) => skill.id === imported.skillId)).toBe(true);
    } finally {
      await manager.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('deploys to parity milestone adapters including codex/windsurf/openclaw/cursor/claude-code', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skillvault-multi-adapter-'));
    const manager = new SkillVaultManager(root);
    try {
      await manager.init();
      const bundleDir = path.join(root, 'bundle');
      await fs.mkdir(bundleDir, { recursive: true });
      await fs.writeFile(path.join(bundleDir, 'SKILL.md'), '---\nname: matrix-skill\ndescription: matrix\n---\n', 'utf8');
      await fs.writeFile(path.join(bundleDir, 'tool.js'), 'export const matrix = true;\n', 'utf8');

      const imported = await manager.importSkill(bundleDir, { sourceType: 'path', sourceLocator: bundleDir });
      const results = await manager.deploy(imported.skillId, {
        adapter: '*',
        scope: 'project',
        mode: 'symlink'
      });
      const byId = new Map(results.map((result) => [result.adapterId, result]));

      for (const adapterId of ['codex', 'windsurf', 'openclaw', 'cursor', 'claude-code']) {
        const result = byId.get(adapterId);
        expect(result, `${adapterId} should be deployed`).toBeDefined();
        expect(['deployed', 'skipped']).toContain(result?.status);
      }
    } finally {
      await manager.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
