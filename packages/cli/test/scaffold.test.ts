import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('scaffold', () => {
  it('exports a skillvault bin entry', () => {
    const pkgPath = resolve(here, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      bin?: Record<string, string>;
      type?: string;
    };

    expect(pkg.type).toBe('module');
    expect(pkg.bin?.skillvault).toBe('./dist/cli.js');
  });

  it('extends the repo tsconfig base', () => {
    const tsconfigPath = resolve(here, '..', 'tsconfig.json');
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8')) as {
      extends?: string;
    };

    expect(tsconfig.extends).toBe('../../tsconfig.base.json');
  });
});
