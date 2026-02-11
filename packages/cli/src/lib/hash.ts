import { createHash } from 'node:crypto';

export function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Deterministic, platform-independent bundle hash.
 *
 * Spec v0.1:
 * - compute per-file sha256 over raw bytes
 * - bundle hash = sha256 over (path + '\0' + file_sha256 + '\0') for each file in sorted path order
 */
export function bundleSha256FromEntries(entries: { path: string; sha256: string }[]): string {
  const h = createHash('sha256');
  for (const e of entries) {
    h.update(e.path, 'utf8');
    h.update('\0', 'utf8');
    h.update(e.sha256, 'utf8');
    h.update('\0', 'utf8');
  }
  return h.digest('hex');
}
