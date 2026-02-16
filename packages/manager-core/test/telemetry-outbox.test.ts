import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SkillVaultManager } from '../src/services/manager.js';

describe('telemetry outbox', () => {
  it('records manager workflow events and persists outbox files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skillvault-telemetry-'));
    const manager = new SkillVaultManager(root);

    try {
      await manager.init();
      const bundleDir = path.join(root, 'bundle');
      await fs.mkdir(bundleDir, { recursive: true });
      await fs.writeFile(path.join(bundleDir, 'SKILL.md'), '---\nname: telem-skill\ndescription: telemetry\n---\n', 'utf8');
      await fs.writeFile(path.join(bundleDir, 'tool.js'), 'export const ok = true;\n', 'utf8');

      const imported = await manager.importSkill(bundleDir, { sourceType: 'path', sourceLocator: bundleDir });
      await manager.deploy(imported.skillId, { adapter: 'codex', scope: 'project', mode: 'symlink' });
      await manager.undeploy(imported.skillId, { adapter: 'codex', scope: 'project' });
      await manager.audit(14);

      const status = manager.telemetryStatus();
      expect(status.totals.total).toBeGreaterThanOrEqual(4);
      expect(status.totals.pending).toBeGreaterThan(0);

      const outboxDir = path.join(root, '.skillvault', 'export', 'telemetry-outbox');
      const outboxFiles = await fs.readdir(outboxDir);
      expect(outboxFiles.length).toBeGreaterThanOrEqual(4);
      expect(status.latest.some((event) => event.eventType === 'skill.imported')).toBe(true);
      expect(status.latest.some((event) => event.eventType === 'skill.deployed')).toBe(true);
      expect(status.latest.some((event) => event.eventType === 'skill.undeployed')).toBe(true);
      expect(status.latest.some((event) => event.eventType === 'vault.audit.completed')).toBe(true);
    } finally {
      await manager.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

