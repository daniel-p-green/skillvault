import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { exportBundleToZip } from '../src/lib/export.js';
import { readBundle } from '../src/lib/bundle.js';
import { scanBundle } from '../src/lib/scan.js';

const fixturesDir = path.resolve(process.cwd(), 'test', 'fixtures');

async function mkTmpDir(prefix = 'skillvault-test-export-'): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe('skillvault export', () => {
  it('writes a zip with normalized paths and deterministic ordering, and the zip can be scanned', async () => {
    const tmp = await mkTmpDir();
    const outZip = path.join(tmp, 'bundle.zip');

    const bundleDir = path.join(fixturesDir, 'benign-skill');

    const report = await exportBundleToZip(bundleDir, {
      outPath: outZip,
      profile: 'strict_v0',
      deterministic: true
    });

    expect(report.validated).toBe(true);
    expect(report.files.map((f) => f.path)).toEqual(['SKILL.md', 'tool.js']);

    const reopened = await readBundle(outZip);
    expect(reopened.kind).toBe('zip');
    expect(reopened.files.map((f) => f.path)).toEqual(['SKILL.md', 'tool.js']);

    const scan = await scanBundle(outZip, { deterministic: true });
    expect(scan.findings.filter((f) => f.severity === 'error')).toEqual([]);
  });

  it('fails export if a symlink exists in the bundle directory (strict_v0)', async () => {
    const tmp = await mkTmpDir();
    const bundleDir = path.join(tmp, 'bundle');
    await fs.mkdir(bundleDir, { recursive: true });

    await fs.writeFile(path.join(bundleDir, 'SKILL.md'), '# ok\n', 'utf8');
    await fs.writeFile(path.join(bundleDir, 'tool.js'), 'console.log(1)\n', 'utf8');

    // Symlink should be rejected.
    await fs.symlink(path.join(bundleDir, 'tool.js'), path.join(bundleDir, 'tool-link.js'));

    const outZip = path.join(tmp, 'bundle.zip');

    const report = await exportBundleToZip(bundleDir, {
      outPath: outZip,
      profile: 'strict_v0',
      deterministic: true
    });

    expect(report.validated).toBe(false);
    expect(report.findings.some((f) => f.code === 'CONSTRAINT_SYMLINK_FORBIDDEN' && f.severity === 'error')).toBe(true);
  });

  it('fails export if exactly-one-manifest constraint is violated (no manifest)', async () => {
    const tmp = await mkTmpDir();
    const bundleDir = path.join(tmp, 'bundle');
    await fs.mkdir(bundleDir, { recursive: true });

    // No SKILL.md/skill.md
    await fs.writeFile(path.join(bundleDir, 'tool.js'), 'console.log(1)\n', 'utf8');

    const outZip = path.join(tmp, 'bundle.zip');

    const report = await exportBundleToZip(bundleDir, {
      outPath: outZip,
      profile: 'strict_v0',
      deterministic: true
    });

    expect(report.validated).toBe(false);
    expect(report.findings.some((f) => f.code === 'CONSTRAINT_MANIFEST_COUNT' && f.severity === 'error')).toBe(true);
  });
});
