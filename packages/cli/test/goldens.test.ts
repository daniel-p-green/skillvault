import { describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';

import { FIXTURES_DIR, GOLDENS_DIR, expectGolden, runCliToFile, writeTmpFile } from './helpers/goldens.js';
import { main } from '../src/cli.js';

const policyPass = path.join(FIXTURES_DIR, 'policy-pass.yaml');

describe('goldens (deterministic regression tests)', () => {
  it('scan/receipt/verify match goldens for benign fixture', async () => {
    const bundle = path.join(FIXTURES_DIR, 'benign-skill');

    const scanOut = await writeTmpFile('scan.json');
    const receiptOut = await writeTmpFile('receipt.json');
    const verifyOut = await writeTmpFile('verify.json');

    const codeScan = await runCliToFile(['scan', bundle, '--deterministic', '--format', 'json'], scanOut);
    expect(codeScan).toBe(0);
    await expectGolden(scanOut, path.join(GOLDENS_DIR, 'benign-skill', 'scan.json'));

    const codeReceipt = await runCliToFile(['receipt', bundle, '--policy', policyPass, '--deterministic', '--format', 'json'], receiptOut);
    expect(codeReceipt).toBe(0);
    await expectGolden(receiptOut, path.join(GOLDENS_DIR, 'benign-skill', 'receipt.json'));

    const codeVerify = await runCliToFile(
      ['verify', bundle, '--receipt', path.join(GOLDENS_DIR, 'benign-skill', 'receipt.json'), '--policy', policyPass, '--offline', '--deterministic', '--format', 'json'],
      verifyOut
    );
    expect(codeVerify).toBe(0);
    await expectGolden(verifyOut, path.join(GOLDENS_DIR, 'benign-skill', 'verify.json'));
  });

  it('scan/receipt match goldens for malicious fixture', async () => {
    const bundle = path.join(FIXTURES_DIR, 'malicious-skill');

    const scanOut = await writeTmpFile('scan.json');
    const receiptOut = await writeTmpFile('receipt.json');

    const codeScan = await runCliToFile(['scan', bundle, '--deterministic', '--format', 'json'], scanOut);
    expect(codeScan).toBe(0);
    await expectGolden(scanOut, path.join(GOLDENS_DIR, 'malicious-skill', 'scan.json'));

    const codeReceipt = await runCliToFile(['receipt', bundle, '--policy', policyPass, '--deterministic', '--format', 'json'], receiptOut);
    expect(codeReceipt).toBe(0);
    await expectGolden(receiptOut, path.join(GOLDENS_DIR, 'malicious-skill', 'receipt.json'));
  });

  it('diff matches golden (benign vs malicious)', async () => {
    const a = path.join(FIXTURES_DIR, 'benign-skill');
    const b = path.join(FIXTURES_DIR, 'malicious-skill');

    const diffOut = await writeTmpFile('diff.json');

    const code = await runCliToFile(['diff', '--a', a, '--b', b, '--deterministic', '--format', 'json'], diffOut);
    expect(code).toBe(0);
    await expectGolden(diffOut, path.join(GOLDENS_DIR, 'diff', 'benign-vs-malicious.json'));
  });

  it('tampering a file causes verify to fail with stable reason codes', async () => {
    const src = path.join(FIXTURES_DIR, 'benign-skill');
    const tmpDir = await fs.mkdtemp(path.join(process.cwd(), 'test-tmp-'));
    const bundle = path.join(tmpDir, 'benign-skill');
    await fs.mkdir(bundle, { recursive: true });

    try {
      // Copy the fixture.
      for (const e of await fs.readdir(src)) {
        await fs.copyFile(path.join(src, e), path.join(bundle, e));
      }

      // Generate a receipt for the *untampered* bundle.
      const receiptPath = path.join(tmpDir, 'receipt.json');
      const receiptCode = await main(['node', 'skillvault', 'receipt', bundle, '--policy', policyPass, '--deterministic', '--out', receiptPath]);
      expect(receiptCode).toBe(0);

      // Tamper with a file.
      await fs.writeFile(path.join(bundle, 'tool.js'), "export function hello() { return 'tampered'; }\n", 'utf8');

      const verifyOut = path.join(tmpDir, 'verify.json');
      const verifyCode = await main([
        'node',
        'skillvault',
        'verify',
        bundle,
        '--receipt',
        receiptPath,
        '--policy',
        policyPass,
        '--offline',
        '--deterministic',
        '--out',
        verifyOut
      ]);

      expect(verifyCode).toBe(1);

      const parsed = JSON.parse(await fs.readFile(verifyOut, 'utf8')) as any;
      const codes = (parsed.findings ?? []).map((f: any) => f.code).sort();
      expect(codes).toContain('FILE_HASH_MISMATCH');
      expect(codes).toContain('BUNDLE_HASH_MISMATCH');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
