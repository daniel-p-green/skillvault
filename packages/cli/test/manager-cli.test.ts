import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { main } from '../src/cli.js';

const FIXTURES = path.resolve(process.cwd(), 'test', 'fixtures');

async function readJsonFile<T>(inputPath: string): Promise<T> {
  const raw = await fs.readFile(inputPath, 'utf8');
  return JSON.parse(raw) as T;
}

describe('skillvault manager CLI', () => {
  it('supports init/import/deploy/inventory/audit flow', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skillvault-manager-cli-'));
    const initOut = path.join(root, 'init.json');
    const importOut = path.join(root, 'import.json');
    const deployOut = path.join(root, 'deploy.json');
    const inventoryOut = path.join(root, 'inventory.json');
    const auditOut = path.join(root, 'audit.json');

    try {
      const initCode = await main([
        'node', 'skillvault', 'manager', 'init',
        '--root', root,
        '--out', initOut
      ]);
      expect(initCode).toBe(0);

      const importCode = await main([
        'node', 'skillvault', 'manager', 'import',
        path.join(FIXTURES, 'benign-skill'),
        '--root', root,
        '--out', importOut
      ]);
      expect(importCode).toBe(0);

      const imported = await readJsonFile<{ skillId: string }>(importOut);
      const deployCode = await main([
        'node', 'skillvault', 'manager', 'deploy',
        imported.skillId,
        '--adapter', 'codex',
        '--scope', 'project',
        '--mode', 'symlink',
        '--root', root,
        '--out', deployOut
      ]);
      expect(deployCode).toBe(0);

      const inventoryCode = await main([
        'node', 'skillvault', 'manager', 'inventory',
        '--root', root,
        '--out', inventoryOut
      ]);
      expect(inventoryCode).toBe(0);
      const inventory = await readJsonFile<{ skills: Array<{ id: string }> }>(inventoryOut);
      expect(inventory.skills.some((skill) => skill.id === imported.skillId)).toBe(true);

      const auditCode = await main([
        'node', 'skillvault', 'manager', 'audit',
        '--root', root,
        '--out', auditOut
      ]);
      expect(auditCode).toBe(0);
      const audit = await readJsonFile<{ totals: { skills: number } }>(auditOut);
      expect(audit.totals.skills).toBeGreaterThanOrEqual(1);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('supports adapter enable/disable/override/validate flow', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skillvault-manager-adapters-cli-'));
    const disableOut = path.join(root, 'disable.json');
    const enableOut = path.join(root, 'enable.json');
    const overrideOut = path.join(root, 'override.json');
    const validateOut = path.join(root, 'validate.json');
    const validateBadOut = path.join(root, 'validate-bad.json');
    const listOut = path.join(root, 'list.json');
    const overridePath = path.join(root, 'adapter-override.json');
    const badOverridePath = path.join(root, 'adapter-override-bad.json');

    try {
      const initCode = await main([
        'node', 'skillvault', 'manager', 'init',
        '--root', root
      ]);
      expect(initCode).toBe(0);

      const disableCode = await main([
        'node', 'skillvault', 'manager', 'adapters', 'disable', 'codex',
        '--root', root,
        '--out', disableOut
      ]);
      expect(disableCode).toBe(0);
      const disabled = await readJsonFile<{ id: string; enabled: boolean }>(disableOut);
      expect(disabled).toEqual({ id: 'codex', enabled: false });

      const enableCode = await main([
        'node', 'skillvault', 'manager', 'adapters', 'enable', 'codex',
        '--root', root,
        '--out', enableOut
      ]);
      expect(enableCode).toBe(0);
      const enabled = await readJsonFile<{ id: string; enabled: boolean }>(enableOut);
      expect(enabled).toEqual({ id: 'codex', enabled: true });

      await fs.writeFile(
        overridePath,
        JSON.stringify({
          id: 'custom-tool',
          displayName: 'Custom Tool',
          projectPath: '.custom/skills',
          globalPath: '~/.custom/skills',
          detectionPaths: ['~/.custom/skills', '.custom/skills'],
          manifestFilenames: ['SKILL.md'],
          supportsSymlink: true,
          supportsGlobal: true
        }, null, 2),
        'utf8'
      );

      const overrideCode = await main([
        'node', 'skillvault', 'manager', 'adapters', 'override',
        '--file', overridePath,
        '--root', root,
        '--out', overrideOut
      ]);
      expect(overrideCode).toBe(0);
      const overrideResult = await readJsonFile<{ id: string }>(overrideOut);
      expect(overrideResult).toEqual({ id: 'custom-tool' });

      const listCode = await main([
        'node', 'skillvault', 'manager', 'adapters', 'list',
        '--root', root,
        '--out', listOut
      ]);
      expect(listCode).toBe(0);
      const listed = await readJsonFile<{ adapters: Array<{ id: string }> }>(listOut);
      expect(listed.adapters.some((adapter) => adapter.id === 'custom-tool')).toBe(true);

      const validateCode = await main([
        'node', 'skillvault', 'manager', 'adapters', 'validate',
        '--root', root,
        '--out', validateOut
      ]);
      expect(validateCode).toBe(0);
      const validateResult = await readJsonFile<{ issues: Array<{ adapterId: string; issue: string }> }>(validateOut);
      expect(validateResult.issues).toEqual([]);

      await fs.writeFile(
        badOverridePath,
        JSON.stringify({
          id: 'bad-tool',
          displayName: 'Bad Tool',
          projectPath: '/absolute/not-allowed',
          globalPath: '~/.bad/skills',
          detectionPaths: ['~/.bad/skills'],
          manifestFilenames: ['SKILL.md'],
          supportsSymlink: false,
          supportsGlobal: true
        }, null, 2),
        'utf8'
      );

      const badOverrideCode = await main([
        'node', 'skillvault', 'manager', 'adapters', 'override',
        '--file', badOverridePath,
        '--root', root
      ]);
      expect(badOverrideCode).toBe(0);

      const validateBadCode = await main([
        'node', 'skillvault', 'manager', 'adapters', 'validate',
        '--root', root,
        '--out', validateBadOut
      ]);
      expect(validateBadCode).toBe(1);
      const validateBadResult = await readJsonFile<{ issues: Array<{ adapterId: string; issue: string }> }>(validateBadOut);
      expect(validateBadResult.issues.some((issue) => issue.adapterId === 'bad-tool')).toBe(true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
