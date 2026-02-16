import { createHash } from 'node:crypto';

export function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

export function comparePathBytes(a: string, b: string): number {
  return Buffer.from(a, 'utf8').compare(Buffer.from(b, 'utf8'));
}

export function computeBundleSha256(entries: Array<{ path: string; sha256: string }>): string {
  const h = createHash('sha256');
  const sorted = [...entries].sort((a, b) => comparePathBytes(a.path, b.path));
  for (const entry of sorted) {
    h.update(entry.path, 'utf8');
    h.update('\n', 'utf8');
    h.update(entry.sha256, 'utf8');
    h.update('\n', 'utf8');
  }
  return h.digest('hex');
}
