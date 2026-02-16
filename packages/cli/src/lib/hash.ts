import type { FileEntry } from '../contracts.js';
import { computeBundleSha256, sha256Hex } from '../bundle/hashing.js';

export { sha256Hex };

/**
 * Backward-compatible wrapper used by existing scan/verify/export paths.
 */
export function bundleSha256FromEntries(entries: Array<Pick<FileEntry, 'path' | 'sha256'>>): string {
  return computeBundleSha256(entries.map((e) => ({ path: e.path, size: 0, sha256: e.sha256 })));
}
