import path from 'node:path';
import fs from 'node:fs/promises';
import AdmZip from 'adm-zip';
import { describe, expect, it } from 'vitest';

import { readBundle } from '../src/lib/bundle.js';
import { computeBundleSha256, hashBundleFiles } from '../src/bundle/hashing.js';

const FIXTURES = path.resolve(process.cwd(), 'test', 'fixtures');

describe('bundle hashing', () => {
  it('computes per-file sha256 from raw bytes', async () => {
    const bundle = await readBundle(path.join(FIXTURES, 'benign-skill'));
    const entries = hashBundleFiles(bundle.files);

    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0]).toMatchObject({
      path: 'SKILL.md',
      size: expect.any(Number),
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/)
    });

    for (const e of entries) {
      expect(e.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(e.size).toBeGreaterThanOrEqual(0);
    }
  });

  it('produces identical file hashes and bundle hash for equivalent directory vs zip bundle', async () => {
    const fixtureDir = path.join(FIXTURES, 'benign-skill');
    const tmpDir = await fs.mkdtemp(path.join(process.cwd(), 'test-tmp-'));

    try {
      const zipPath = path.join(tmpDir, 'benign-skill.zip');
      const zip = new AdmZip();
      zip.addLocalFolder(fixtureDir);
      zip.writeZip(zipPath);

      const dirBundle = await readBundle(fixtureDir);
      const zipBundle = await readBundle(zipPath);

      const dirEntries = hashBundleFiles(dirBundle.files);
      const zipEntries = hashBundleFiles(zipBundle.files);

      expect(zipEntries).toEqual(dirEntries);

      const dirHash = computeBundleSha256(dirEntries);
      const zipHash = computeBundleSha256(zipEntries);

      expect(zipHash).toBe(dirHash);
      expect(dirHash).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
