import type { FileEntry, Finding, ManifestRef } from '../contracts.js';

export const MANIFEST_FILENAMES = ['SKILL.md', 'skill.md'] as const;

export function isManifestPath(p: string): boolean {
  return p === 'SKILL.md' || p === 'skill.md';
}

export function manifestCountFinding(count: number): Finding {
  return {
    code: 'CONSTRAINT_MANIFEST_COUNT',
    severity: 'error',
    message: `Expected exactly one manifest (SKILL.md or skill.md) in bundle root; found ${count}`
  };
}

export function detectManifestFromEntries(files: Array<Pick<FileEntry, 'path' | 'size'> & Partial<Pick<FileEntry, 'sha256'>>>): {
  manifest?: ManifestRef;
  findings: Finding[];
} {
  const candidates = files.filter((f) => isManifestPath(f.path));

  if (candidates.length !== 1) {
    return {
      manifest: undefined,
      findings: [manifestCountFinding(candidates.length)]
    };
  }

  const manifest = candidates[0];
  return {
    manifest: {
      path: manifest.path,
      size: manifest.size,
      sha256: manifest.sha256 ?? ''
    },
    findings: []
  };
}
