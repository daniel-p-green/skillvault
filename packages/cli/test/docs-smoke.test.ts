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
      path.join(repoRoot, 'docs', 'product', 'JTBD.md'),
      path.join(repoRoot, 'docs', 'product', 'use-cases.md'),
      path.join(repoRoot, 'docs', 'product', 'user-stories.md'),
      path.join(repoRoot, 'docs', 'product', 'test-cases.md'),
      path.join(repoRoot, 'docs', 'product', 'acceptance-criteria.md')
    ];

    for (const filePath of required) {
      expect(fs.existsSync(filePath), `missing: ${filePath}`).toBe(true);
      readNonEmpty(filePath);
    }
  });

  it('README and CLI reference mention trust + manager command families', () => {
    const readme = readNonEmpty(path.join(repoRoot, 'README.md'));
    const cli = readNonEmpty(path.join(repoRoot, 'docs', 'cli.md'));

    for (const cmd of ['scan', 'receipt', 'verify', 'gate', 'diff', 'export']) {
      expect(readme).toContain(` ${cmd}`);
      expect(cli).toContain(`skillvault ${cmd}`);
    }

    for (const managerCmd of [
      'skillvault manager init',
      'skillvault manager import',
      'skillvault manager inventory',
      'skillvault manager deploy',
      'skillvault manager audit',
      'skillvault manager telemetry status',
      'skillvault manager eval run',
      'skillvault manager auth bootstrap',
      'skillvault manager serve'
    ]) {
      expect(readme).toContain(managerCmd);
      expect(cli).toContain(managerCmd);
    }
  });

  it('docs include required v0.3 product headings and security details', () => {
    const schemas = readNonEmpty(path.join(repoRoot, 'docs', 'schemas.md'));
    const cli = readNonEmpty(path.join(repoRoot, 'docs', 'cli.md'));
    const prd = readNonEmpty(path.join(repoRoot, 'docs', 'PRD.md'));
    const jtbd = readNonEmpty(path.join(repoRoot, 'docs', 'product', 'JTBD.md'));
    const useCases = readNonEmpty(path.join(repoRoot, 'docs', 'product', 'use-cases.md'));
    const stories = readNonEmpty(path.join(repoRoot, 'docs', 'product', 'user-stories.md'));
    const testCases = readNonEmpty(path.join(repoRoot, 'docs', 'product', 'test-cases.md'));
    const acceptance = readNonEmpty(path.join(repoRoot, 'docs', 'product', 'acceptance-criteria.md'));

    expect(cli).toContain('--pubkey');
    expect(cli).toContain('--keyring');
    expect(cli).toContain('--receipt receipt.json');
    expect(cli).toContain('manager telemetry status');
    expect(cli).toContain('manager eval run');
    expect(cli).toContain('manager auth bootstrap');

    expect(schemas).toContain('POLICY_SCAN_ERROR_FINDING');
    expect(schemas).toContain('AdapterSpec');
    expect(schemas).toContain('TelemetryEvent');
    expect(schemas).toContain('EvalDataset');
    expect(schemas).toContain('ApiTokenRecord');
    expect(schemas).toContain('002_telemetry.sql');
    expect(schemas).toContain('003_evals.sql');
    expect(schemas).toContain('004_rbac.sql');

    expect(prd).toContain('v0.3');
    expect(prd).toContain('telemetry outbox');
    expect(prd).toContain('RBAC');

    expect(jtbd).toContain('# JTBD');
    expect(jtbd).toContain('## Personas');
    expect(useCases).toContain('# Use Cases');
    expect(stories).toContain('# User Stories');
    expect(stories).toContain('As a');
    expect(testCases).toContain('# Test Cases');
    expect(testCases).toContain('Traceability Matrix');
    expect(acceptance).toContain('# Acceptance Criteria');
    expect(acceptance).toContain('Product-Level Exit Criteria');
  });
});
