import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SkillVaultManager } from '../src/services/manager.js';

async function seedManagerWithSkill(root: string): Promise<SkillVaultManager> {
  const manager = new SkillVaultManager(root);
  await manager.init();
  const bundleDir = path.join(root, 'bundle');
  await fs.mkdir(bundleDir, { recursive: true });
  await fs.writeFile(path.join(bundleDir, 'SKILL.md'), '---\nname: weave-skill\ndescription: weave\n---\n', 'utf8');
  await fs.writeFile(path.join(bundleDir, 'tool.js'), 'export const weave = true;\n', 'utf8');
  await manager.importSkill(bundleDir, { sourceType: 'path', sourceLocator: bundleDir });
  return manager;
}

describe('weave exporter integration', () => {
  afterEach(() => {
    delete process.env.SKILLVAULT_WEAVE_ENDPOINT;
    delete process.env.SKILLVAULT_WEAVE_BASE_URL;
    delete process.env.SKILLVAULT_WEAVE_ALLOWED_HOSTS;
    vi.unstubAllGlobals();
  });

  it('is a no-op when weave config is not set', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skillvault-weave-noop-'));
    const manager = await seedManagerWithSkill(root);
    try {
      const report = await manager.flushTelemetry({ target: 'weave', maxEvents: 20 });
      expect(report.processed).toBe(0);
      expect(report.sent).toBe(0);
      expect(manager.telemetryStatus().totals.pending).toBeGreaterThan(0);
    } finally {
      await manager.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('marks events as sent when weave export succeeds', async () => {
    process.env.SKILLVAULT_WEAVE_ENDPOINT = 'https://weave.example.test/ingest';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));

    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skillvault-weave-ok-'));
    const manager = await seedManagerWithSkill(root);
    try {
      const report = await manager.flushTelemetry({ target: 'weave', maxEvents: 20 });
      expect(report.processed).toBeGreaterThan(0);
      expect(report.sent).toBe(report.processed);
      expect(manager.telemetryStatus().totals.sent).toBeGreaterThan(0);
      expect(manager.telemetryStatus().totals.pending).toBe(0);
    } finally {
      await manager.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('moves events from retry to dead letter when weave export keeps failing', async () => {
    process.env.SKILLVAULT_WEAVE_ENDPOINT = 'https://weave.example.test/ingest';
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('weave unavailable');
    }));

    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skillvault-weave-fail-'));
    const manager = await seedManagerWithSkill(root);
    try {
      const first = await manager.flushTelemetry({ target: 'weave', maxEvents: 20 });
      expect(first.processed).toBeGreaterThan(0);
      expect(first.retried).toBeGreaterThan(0);

      for (let idx = 0; idx < 5; idx += 1) {
        await manager.flushTelemetry({ target: 'weave', maxEvents: 20 });
      }

      const totals = manager.telemetryStatus().totals;
      expect(totals.dead_letter).toBeGreaterThan(0);
      expect(totals.pending).toBe(0);
    } finally {
      await manager.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

