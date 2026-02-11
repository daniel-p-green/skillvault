import fs from 'node:fs/promises';
import path from 'node:path';
import AdmZip, { type IZipEntry } from 'adm-zip';

export interface BundleFile {
  path: string;
  bytes: Uint8Array;
}

export interface BundleInput {
  kind: 'directory' | 'zip';
  sourcePath: string;
  files: BundleFile[];
}

function toPosixPath(p: string): string {
  return p.split(path.sep).join('/');
}

async function walkDir(rootDir: string, dir: string, out: string[]): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      await walkDir(rootDir, full, out);
    } else if (ent.isFile()) {
      const rel = path.relative(rootDir, full);
      out.push(toPosixPath(rel));
    }
  }
}

async function readDirectoryBundle(dirPath: string): Promise<BundleInput> {
  const relPaths: string[] = [];
  await walkDir(dirPath, dirPath, relPaths);
  relPaths.sort();

  const files: BundleFile[] = [];
  for (const rel of relPaths) {
    const full = path.join(dirPath, ...rel.split('/'));
    const bytes = await fs.readFile(full);
    files.push({ path: rel, bytes });
  }

  return { kind: 'directory', sourcePath: dirPath, files };
}

async function readZipBundle(zipPath: string): Promise<BundleInput> {
  const zip = new AdmZip(zipPath);
  const entries: Array<{ path: string; entry: IZipEntry }> = zip
    .getEntries()
    .filter((e: IZipEntry) => !e.isDirectory)
    .map((e: IZipEntry) => ({ path: e.entryName.replace(/\\/g, '/'), entry: e }))
    .filter((e) => e.path.length > 0 && !e.path.startsWith('/'));

  entries.sort((a, b) => a.path.localeCompare(b.path));

  const files: BundleFile[] = entries.map((e) => ({
    path: e.path,
    bytes: e.entry.getData()
  }));

  return { kind: 'zip', sourcePath: zipPath, files };
}

export async function readBundle(pathOrZip: string): Promise<BundleInput> {
  const stat = await fs.stat(pathOrZip).catch(() => null);
  if (!stat) throw new Error(`Bundle not found: ${pathOrZip}`);

  if (stat.isDirectory()) return readDirectoryBundle(pathOrZip);

  if (stat.isFile() && pathOrZip.toLowerCase().endsWith('.zip')) {
    return readZipBundle(pathOrZip);
  }

  throw new Error(`Unsupported bundle input (expected directory or .zip): ${pathOrZip}`);
}
