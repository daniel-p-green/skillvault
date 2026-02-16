import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SkillVaultManager } from '../src/services/manager.js';

describe('deployment mode behavior', () => {
  it('is idempotent for repeated symlink deploy to same target', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skillvault-deploy-'));
    const manager = new SkillVaultManager(root);
    try {
      await manager.init();
      const bundleDir = path.join(root, 'bundle');
      await fs.mkdir(bundleDir, { recursive: true });
      await fs.writeFile(path.join(bundleDir, 'SKILL.md'), '---\nname: test-skill\ndescription: test\n---\n', 'utf8');
      await fs.writeFile(path.join(bundleDir, 'tool.js'), 'export const x = 1;\n', 'utf8');

      const imported = await manager.importSkill(bundleDir, { sourceType: 'path', sourceLocator: bundleDir });
      const first = await manager.deploy(imported.skillId, { adapter: 'codex', scope: 'project', mode: 'symlink' });
      const second = await manager.deploy(imported.skillId, { adapter: 'codex', scope: 'project', mode: 'symlink' });

      expect(first[0]?.status).toBe('deployed');
      expect(second[0]?.status).toBe('skipped');
    } finally {
      await manager.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('detects drift after out-of-band mutation for copy deployments', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skillvault-drift-'));
    const manager = new SkillVaultManager(root);
    try {
      await manager.init();
      const bundleDir = path.join(root, 'bundle');
      await fs.mkdir(bundleDir, { recursive: true });
      await fs.writeFile(path.join(bundleDir, 'SKILL.md'), '---\nname: drift-skill\ndescription: drift test\n---\n', 'utf8');
      await fs.writeFile(path.join(bundleDir, 'tool.js'), 'export const x = 1;\n', 'utf8');

      const imported = await manager.importSkill(bundleDir, { sourceType: 'path', sourceLocator: bundleDir });
      const deployments = await manager.deploy(imported.skillId, { adapter: 'codex', scope: 'project', mode: 'copy' });
      expect(deployments[0]?.status).toBe('deployed');

      await fs.writeFile(path.join(root, '.agents', 'skills', imported.skillId, 'tool.js'), 'export const x = 2;\n', 'utf8');

      const summary = await manager.audit(365);
      expect(summary.totals.driftedDeployments).toBeGreaterThanOrEqual(1);
      expect(summary.driftedDeployments.some((deployment) => deployment.driftStatus === 'drifted')).toBe(true);
    } finally {
      await manager.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
