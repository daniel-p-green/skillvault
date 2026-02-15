import { describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import AdmZip from 'adm-zip';

import { main } from '../src/cli.js';
import { CONTRACT_VERSION } from '../src/contracts.js';

const FIXTURES = path.resolve(process.cwd(), 'test', 'fixtures');

describe('shared CLI options', () => {
  it('scan writes deterministic JSON via --out for directory input', async () => {
    const bundleDir = path.join(FIXTURES, 'benign-skill');
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skillvault-scan-'));
    const outPath = path.join(outDir, 'scan.json');

    const code = await main([
      'node',
      'skillvault',
      'scan',
      bundleDir,
      '--policy',
      path.join(FIXTURES, 'policy-pass.yaml'),
      '--format',
      'json',
      '--out',
      outPath,
      '--deterministic'
    ]);

    expect(code).toBe(0);

    const json = JSON.parse(await fs.readFile(outPath, 'utf8')) as {
      contract_version: string;
      summary: { deterministic: boolean; file_count: number };
      files: unknown[];
    };

    expect(json.contract_version).toBe(CONTRACT_VERSION);
    expect(json.summary.deterministic).toBe(true);
    expect(json.summary.file_count).toBe(json.files.length);
  });

  it('scan accepts .zip input and produces same bundle hash as directory (deterministic)', async () => {
    const bundleDir = path.join(FIXTURES, 'benign-skill');
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skillvault-zip-'));
    const zipPath = path.join(tmpDir, 'bundle.zip');
    const outDirPath = path.join(tmpDir, 'scan-dir.json');
    const outZipPath = path.join(tmpDir, 'scan-zip.json');

    const zip = new AdmZip();
    zip.addLocalFolder(bundleDir);
    zip.writeZip(zipPath);

    const codeDir = await main(['node', 'skillvault', 'scan', bundleDir, '--deterministic', '--out', outDirPath]);
    const codeZip = await main(['node', 'skillvault', 'scan', zipPath, '--deterministic', '--out', outZipPath]);

    expect(codeDir).toBe(0);
    expect(codeZip).toBe(0);

    const fromDir = JSON.parse(await fs.readFile(outDirPath, 'utf8')) as { bundle_sha256: string; files: unknown[] };
    const fromZip = JSON.parse(await fs.readFile(outZipPath, 'utf8')) as { bundle_sha256: string; files: unknown[] };

    expect(fromZip.bundle_sha256).toBe(fromDir.bundle_sha256);
    expect(fromZip.files).toEqual(fromDir.files);
  });

  it('scan supports stable table output with --out', async () => {
    const bundleDir = path.join(FIXTURES, 'benign-skill');
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skillvault-table-'));
    const outPath = path.join(outDir, 'scan-table.txt');

    const code = await main([
      'node',
      'skillvault',
      'scan',
      bundleDir,
      '--format',
      'table',
      '--out',
      outPath,
      '--deterministic'
    ]);

    expect(code).toBe(0);

    const table = await fs.readFile(outPath, 'utf8');
    expect(table).toContain('bundle_sha256: ');
    expect(table).toContain('files: ');
    expect(table).toContain('total_bytes: ');
    expect(table).toContain('findings: ');
  });

  it('accepts --format on receipt with --signing-key', async () => {
    const bundleDir = path.join(FIXTURES, 'benign-skill');
    const signingKey = path.join(FIXTURES, 'keys', 'ed25519-private.pem');

    const code = await main([
      'node',
      'skillvault',
      'receipt',
      bundleDir,
      '--format',
      'json',
      '--signing-key',
      signingKey,
      '--deterministic'
    ]);
    expect(code).toBe(0);
  });
});
