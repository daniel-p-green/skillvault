import { describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';

import { generateReceipt } from '../src/lib/receipt.js';
import { main } from '../src/cli.js';
import { DETERMINISTIC_CREATED_AT_ISO } from '../src/lib/time.js';

const FIXTURES = path.resolve(process.cwd(), 'test', 'fixtures');

describe('skillvault receipt', () => {
  it('generates a receipt with bundle hash, per-file hashes, scan summary, and policy decision', async () => {
    const bundleDir = path.join(FIXTURES, 'benign-skill');
    const policyPath = path.join(FIXTURES, 'policy-pass.yaml');

    const receipt = await generateReceipt(bundleDir, { policyPath, deterministic: true });

    expect(receipt.contract_version).toBe('0.1');
    expect(receipt.created_at).toBe(DETERMINISTIC_CREATED_AT_ISO);
    expect(receipt.scanner.name).toBe('skillvault');
    expect(typeof receipt.scanner.version).toBe('string');

    expect(receipt.bundle_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.files.length).toBeGreaterThanOrEqual(2);
    expect(receipt.files[0].path).toBe('SKILL.md');

    for (const f of receipt.files) {
      expect(f.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(f.size).toBeGreaterThanOrEqual(0);
    }

    expect(receipt.scan.summary.file_count).toBe(receipt.files.length);
    expect(receipt.scan.summary.deterministic).toBe(true);

    expect(receipt.policy.verdict).toBe('PASS');
    expect(receipt.policy.risk_score.total).toBe(0);
  });

  it('is deterministic under --deterministic', async () => {
    const bundleDir = path.join(FIXTURES, 'benign-skill');
    const policyPath = path.join(FIXTURES, 'policy-pass.yaml');

    const a = await generateReceipt(bundleDir, { policyPath, deterministic: true });
    const b = await generateReceipt(bundleDir, { policyPath, deterministic: true });

    expect(a).toEqual(b);
  });

  it('CLI writes receipt JSON to --out', async () => {
    const bundleDir = path.join(FIXTURES, 'benign-skill');
    const policyPath = path.join(FIXTURES, 'policy-pass.yaml');

    const tmpDir = await fs.mkdtemp(path.join(process.cwd(), 'test-tmp-'));
    const outPath = path.join(tmpDir, 'receipt.json');

    const code = await main([
      'node',
      'skillvault',
      'receipt',
      bundleDir,
      '--policy',
      policyPath,
      '--deterministic',
      '--out',
      outPath
    ]);

    expect(code).toBe(0);

    const raw = await fs.readFile(outPath, 'utf8');
    const parsed = JSON.parse(raw) as { bundle_sha256: string; created_at: string };

    expect(parsed.created_at).toBe(DETERMINISTIC_CREATED_AT_ISO);
    expect(parsed.bundle_sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
