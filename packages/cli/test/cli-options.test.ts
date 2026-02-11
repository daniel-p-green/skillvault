import { describe, expect, it } from 'vitest';
import path from 'node:path';

import { main } from '../src/cli.js';

const FIXTURES = path.resolve(process.cwd(), 'test', 'fixtures');

describe('shared CLI options', () => {
  it('accepts common flags on scan', async () => {
    const bundleDir = path.join(FIXTURES, 'benign-skill');

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
      '/tmp/skillvault-unused.json',
      '--deterministic'
    ]);

    expect(code).toBe(0);
  });

  it('accepts --format on receipt (even if currently unused)', async () => {
    const bundleDir = path.join(FIXTURES, 'benign-skill');

    const code = await main(['node', 'skillvault', 'receipt', bundleDir, '--format', 'json', '--deterministic']);
    expect(code).toBe(0);
  });
});
