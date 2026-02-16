import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { detectManifestFromEntries } from '../src/manifest/manifest.js';
import { scanBundle } from '../src/lib/scan.js';
import { sha256Hex } from '../src/bundle/hashing.js';
import { normalizeTextForAnalysis } from '../src/text/normalize.js';

describe('manifest detection', () => {
  it('emits CONSTRAINT_MANIFEST_COUNT when manifest count is zero', () => {
    const result = detectManifestFromEntries([{ path: 'tool.js', size: 1, sha256: 'a'.repeat(64) }]);

    expect(result.manifest).toBeUndefined();
    expect(result.findings).toEqual([
      {
        code: 'CONSTRAINT_MANIFEST_COUNT',
        severity: 'error',
        message: 'Expected exactly one manifest (SKILL.md or skill.md) in bundle root; found 0'
      }
    ]);
  });

  it('emits CONSTRAINT_MANIFEST_COUNT when manifest count is greater than one', () => {
    const result = detectManifestFromEntries([
      { path: 'SKILL.md', size: 10, sha256: '1'.repeat(64) },
      { path: 'skill.md', size: 20, sha256: '2'.repeat(64) }
    ]);

    expect(result.manifest).toBeUndefined();
    expect(result.findings[0]?.code).toBe('CONSTRAINT_MANIFEST_COUNT');
    expect(result.findings[0]?.message).toContain('found 2');
  });

  it('selects exactly one root manifest and ignores nested SKILL.md', () => {
    const result = detectManifestFromEntries([
      { path: 'docs/SKILL.md', size: 1, sha256: 'a'.repeat(64) },
      { path: 'SKILL.md', size: 2, sha256: 'b'.repeat(64) }
    ]);

    expect(result.findings).toEqual([]);
    expect(result.manifest).toEqual({
      path: 'SKILL.md',
      size: 2,
      sha256: 'b'.repeat(64)
    });
  });
});

describe('text normalization', () => {
  it('normalizes to NFC and LF newlines deterministically', () => {
    const decomposed = 'Cafe\u0301';
    const input = `${decomposed}\r\nline2\rline3`;

    expect(normalizeTextForAnalysis(input)).toBe('Café\nline2\nline3');
  });

  it('keeps manifest hash based on raw bytes (not normalized text)', async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skillvault-us004-'));

    try {
      const bundleDir = path.join(tmpRoot, 'bundle');
      await fs.mkdir(bundleDir, { recursive: true });

      const raw = Buffer.from('Cafe\u0301\r\nline2\r', 'utf8');
      await fs.writeFile(path.join(bundleDir, 'SKILL.md'), raw);
      await fs.writeFile(path.join(bundleDir, 'tool.js'), 'console.log("ok")\n', 'utf8');

      const report = await scanBundle(bundleDir, { deterministic: true });
      expect(report.findings).toEqual([]);
      expect(report.manifest.path).toBe('SKILL.md');
      expect(report.manifest.sha256).toBe(sha256Hex(raw));

      const normalized = normalizeTextForAnalysis(raw.toString('utf8'));
      expect(sha256Hex(Buffer.from(normalized, 'utf8'))).not.toBe(report.manifest.sha256);
    } finally {
      await fs.rm(tmpRoot, { recursive: true, force: true });
    }
  });
});
