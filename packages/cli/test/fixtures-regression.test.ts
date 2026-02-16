import { describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';

import { FIXTURES_DIR, runCliToFile, writeTmpFile } from './helpers/goldens.js';

function codesOf(report: any): string[] {
  return (report.findings ?? []).map((f: any) => f.code).sort();
}

describe('fixture bundles regression coverage', () => {
  it('missing-manifest fixture yields stable manifest-count code', async () => {
    const bundle = path.join(FIXTURES_DIR, 'missing-manifest');
    const out = await writeTmpFile('scan.json');

    const code = await runCliToFile(['scan', bundle, '--deterministic', '--format', 'json'], out);
    expect(code).toBe(0);

    const parsed = JSON.parse(await fs.readFile(out, 'utf8')) as any;
    expect(codesOf(parsed)).toContain('CONSTRAINT_MANIFEST_COUNT');
  });

  it('multiple-manifest zip fixture yields stable manifest-count code', async () => {
    const bundle = path.join(FIXTURES_DIR, 'multiple-manifest.zip');
    const out = await writeTmpFile('scan.json');

    const code = await runCliToFile(['scan', bundle, '--deterministic', '--format', 'json'], out);
    expect(code).toBe(0);

    const parsed = JSON.parse(await fs.readFile(out, 'utf8')) as any;
    expect(codesOf(parsed)).toContain('CONSTRAINT_MANIFEST_COUNT');
  });

  it('oversized fixture fails verify with stable size-limit code under strict policy', async () => {
    const bundle = path.join(FIXTURES_DIR, 'oversized-skill');
    const policy = path.join(FIXTURES_DIR, 'policy-strict-limits.yaml');
    const signingKey = path.join(FIXTURES_DIR, 'keys', 'ed25519-private.pem');
    const pubkey = path.join(FIXTURES_DIR, 'keys', 'ed25519-public.pem');

    const receiptOut = await writeTmpFile('receipt.json');
    const verifyOut = await writeTmpFile('verify.json');

    const receiptCode = await runCliToFile(
      ['receipt', bundle, '--policy', policy, '--signing-key', signingKey, '--deterministic', '--format', 'json'],
      receiptOut
    );
    expect(receiptCode).toBe(0);

    const verifyCode = await runCliToFile(
      ['verify', bundle, '--receipt', receiptOut, '--policy', policy, '--pubkey', pubkey, '--offline', '--deterministic', '--format', 'json'],
      verifyOut
    );
    expect(verifyCode).toBe(1);

    const parsed = JSON.parse(await fs.readFile(verifyOut, 'utf8')) as any;
    expect(codesOf(parsed)).toContain('CONSTRAINT_FILE_SIZE_LIMIT');
  });

  it('capability-triggers fixture infers expected capabilities deterministically', async () => {
    const bundle = path.join(FIXTURES_DIR, 'capability-triggers');
    const out = await writeTmpFile('scan.json');

    const code = await runCliToFile(['scan', bundle, '--deterministic', '--format', 'json'], out);
    expect(code).toBe(0);

    const parsed = JSON.parse(await fs.readFile(out, 'utf8')) as any;
    expect(parsed.capabilities).toEqual(expect.arrayContaining(['network', 'exec', 'writes']));
  });
});
