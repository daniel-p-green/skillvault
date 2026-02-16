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
});
