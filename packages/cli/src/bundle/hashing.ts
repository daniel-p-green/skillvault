import { createHash } from 'node:crypto';

import type { FileEntry } from '../contracts.js';
import type { BundleFile } from '../lib/bundle.js';

function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

function comparePathBytes(a: string, b: string): number {
  return Buffer.from(a, 'utf8').compare(Buffer.from(b, 'utf8'));
}

export function hashBundleFiles(inputFiles: BundleFile[]): FileEntry[] {
  return inputFiles
    .map((f) => ({
      path: f.path,
      size: f.bytes.byteLength,
      sha256: sha256Hex(f.bytes)
    }))
    .sort((a, b) => comparePathBytes(a.path, b.path));
}

/**
 * Deterministic bundle hash for v0.1.
 *
 * bundle_sha256 = sha256(concat(sorted path + '\n' + file_sha256 + '\n'))
 */
export function computeBundleSha256(fileEntries: FileEntry[]): string {
  const h = createHash('sha256');
  const sorted = [...fileEntries].sort((a, b) => comparePathBytes(a.path, b.path));

  for (const entry of sorted) {
    h.update(entry.path, 'utf8');
    h.update('\n', 'utf8');
    h.update(entry.sha256, 'utf8');
    h.update('\n', 'utf8');
  }

  return h.digest('hex');
}

export { sha256Hex, comparePathBytes };
