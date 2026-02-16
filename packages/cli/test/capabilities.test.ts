import { describe, expect, it } from 'vitest';

import type { BundleFile } from '../src/lib/bundle.js';
import { inferCapabilities } from '../src/scan/capabilities.js';

function file(path: string, text: string): BundleFile {
  return { path, bytes: Buffer.from(text, 'utf8') };
}

describe('inferCapabilities', () => {
  it('returns sorted, deduped capabilities inferred from path/content rules', () => {
    const files: BundleFile[] = [
      file('scripts/run.sh', 'echo deploy'),
      file('src/agent.ts', "import { exec } from 'node:child_process';\nfetch('https://api.example.com')\n"),
      file('src/io.ts', "await fs.promises.readFile('a');\nawait fs.promises.writeFile('b','c')\n"),
      file('secrets/.env.example', 'API_KEY=abc123'),
      file('src/dyn.js', 'const fn = new Function("return 1")')
    ];

    expect(inferCapabilities(files)).toEqual([
      'dynamic_code',
      'exec',
      'network',
      'reads',
      'secrets',
      'writes'
    ]);
  });

  it('is deterministic across runs for identical bytes regardless of file order', () => {
    const filesA: BundleFile[] = [
      file('b.ts', 'eval("1+1")'),
      file('a.ts', "await fs.promises.writeFile('a', 'b')")
    ];

    const filesB: BundleFile[] = [...filesA].reverse();

    expect(inferCapabilities(filesA)).toEqual(inferCapabilities(filesB));
    expect(inferCapabilities(filesA)).toEqual(['dynamic_code', 'writes']);
  });

  it('matches using normalized text (NFC + newlines)', () => {
    const files: BundleFile[] = [
      file('notes.md', 'Cafe\u0301\r\nline2\rPRIVATE_KEY=xyz')
    ];

    expect(inferCapabilities(files)).toEqual(['secrets']);
  });
});
