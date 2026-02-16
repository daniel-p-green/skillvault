import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function readNonEmpty(filePath: string) {
  const buf = fs.readFileSync(filePath);
  expect(buf.byteLength).toBeGreaterThan(0);
  return buf.toString('utf8');
}

describe('docs smoke', () => {
  const repoRoot = path.resolve(process.cwd(), '..', '..');

  it('required docs files exist and are non-empty', () => {
    const required = [
      path.join(repoRoot, 'README.md'),
      path.join(repoRoot, 'docs', 'cli.md'),
      path.join(repoRoot, 'docs', 'policy.md'),
      path.join(repoRoot, 'docs', 'scoring.md'),
      path.join(repoRoot, 'docs', 'PRD.md'),
      path.join(repoRoot, 'docs', 'schemas.md'),
      path.join(repoRoot, 'docs', 'signing.md'),
      path.join(repoRoot, 'docs', 'deterministic.md'),
    ];

    for (const p of required) {
      expect(fs.existsSync(p), `missing: ${p}`).toBe(true);
      readNonEmpty(p);
    }
  });

  it('README and CLI reference mention all v0.1 commands', () => {
    const readme = readNonEmpty(path.join(repoRoot, 'README.md'));
    const cli = readNonEmpty(path.join(repoRoot, 'docs', 'cli.md'));

    const mustShip = ['scan', 'receipt', 'verify', 'gate', 'diff', 'export'];

    for (const cmd of mustShip) {
      expect(readme).toContain(` ${cmd} `);
      expect(cli).toContain(`skillvault ${cmd}`);
    }
  });

  it('docs cover signature verification, deterministic mode, and keyring usage', () => {
    const cli = readNonEmpty(path.join(repoRoot, 'docs', 'cli.md'));
    const schemas = readNonEmpty(path.join(repoRoot, 'docs', 'schemas.md'));
    const signing = readNonEmpty(path.join(repoRoot, 'docs', 'signing.md'));
    const deterministic = readNonEmpty(path.join(repoRoot, 'docs', 'deterministic.md'));

    expect(cli).toContain('--pubkey');
    expect(cli).toContain('--keyring');
    expect(cli).toContain('Hard-fail');

    expect(schemas).toContain('signature');
    expect(schemas).toContain('ed25519');

    expect(signing).toContain('offline');
    expect(signing).toContain('keyring');

    expect(deterministic).toContain('--deterministic');
    expect(deterministic).toContain('test:goldens:check');
  });
});
