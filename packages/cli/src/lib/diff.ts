import fs from 'node:fs/promises';

import type { Capability, DiffReport, FileDiff, Finding, Receipt } from '../contracts.js';
import { CONTRACT_VERSION } from '../contracts.js';
import { comparePathBytes } from '../bundle/hashing.js';
import { generateReceipt } from './receipt.js';
import { nowIso } from './time.js';

export interface DiffOptions {
  policyPath?: string;
  deterministic: boolean;
}

type ReceiptLike = Pick<Receipt, 'bundle_sha256' | 'files' | 'scan'>;

function isReceiptLike(x: any): x is ReceiptLike {
  return (
    x &&
    typeof x === 'object' &&
    typeof x.bundle_sha256 === 'string' &&
    Array.isArray(x.files) &&
    typeof x.scan === 'object' &&
    x.scan &&
    Array.isArray(x.scan.capabilities) &&
    Array.isArray(x.scan.findings)
  );
}

async function tryReadReceipt(pathOrJson: string): Promise<ReceiptLike | undefined> {
  let raw: string;
  try {
    raw = await fs.readFile(pathOrJson, 'utf8');
  } catch {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }

  if (!isReceiptLike(parsed)) return undefined;
  return parsed;
}

async function receiptFromInput(input: string, opts: DiffOptions): Promise<ReceiptLike> {
  const maybeReceipt = await tryReadReceipt(input);
  if (maybeReceipt) return maybeReceipt;

  // Treat as bundle directory/zip.
  const receipt = await generateReceipt(input, { policyPath: opts.policyPath, deterministic: opts.deterministic });
  return receipt;
}

function fileDiffs(aFiles: ReceiptLike['files'], bFiles: ReceiptLike['files']): { diffs: FileDiff[]; summary: DiffReport['summary'] } {
  const aByPath = new Map(aFiles.map((f) => [f.path, f] as const));
  const bByPath = new Map(bFiles.map((f) => [f.path, f] as const));

  const allPaths = Array.from(new Set([...aByPath.keys(), ...bByPath.keys()])).sort(comparePathBytes);

  const diffs: FileDiff[] = [];
  let added = 0;
  let removed = 0;
  let modified = 0;
  let unchanged = 0;

  for (const p of allPaths) {
    const a = aByPath.get(p);
    const b = bByPath.get(p);

    if (a && !b) {
      removed++;
      diffs.push({ path: p, change: 'removed', a: { sha256: a.sha256, size: a.size } });
      continue;
    }

    if (!a && b) {
      added++;
      diffs.push({ path: p, change: 'added', b: { sha256: b.sha256, size: b.size } });
      continue;
    }

    if (!a || !b) continue;

    if (a.sha256 !== b.sha256 || a.size !== b.size) {
      modified++;
      diffs.push({
        path: p,
        change: 'modified',
        a: { sha256: a.sha256, size: a.size },
        b: { sha256: b.sha256, size: b.size }
      });
    } else {
      unchanged++;
      diffs.push({
        path: p,
        change: 'unchanged',
        a: { sha256: a.sha256, size: a.size },
        b: { sha256: b.sha256, size: b.size }
      });
    }
  }

  return { diffs, summary: { added, removed, modified, unchanged } };
}

function capabilityDeltas(aCaps: Capability[], bCaps: Capability[]): { added: Capability[]; removed: Capability[] } {
  const aSet = new Set(aCaps);
  const bSet = new Set(bCaps);

  const added = Array.from(bSet)
    .filter((c) => !aSet.has(c))
    .sort(comparePathBytes);

  const removed = Array.from(aSet)
    .filter((c) => !bSet.has(c))
    .sort(comparePathBytes);

  return { added, removed };
}

function findingKey(f: Finding): string {
  const d: any = f.details;
  const ruleId = typeof d?.rule_id === 'string' ? d.rule_id : typeof d?.ruleId === 'string' ? d.ruleId : typeof d?.id === 'string' ? d.id : undefined;
  if (ruleId) return ruleId;

  // Fallback: stable composite key.
  return `${f.code}${f.path ? `:${f.path}` : ''}`;
}

function findingDeltas(aFindings: Finding[], bFindings: Finding[]): { added: string[]; removed: string[] } {
  const aSet = new Set(aFindings.map(findingKey));
  const bSet = new Set(bFindings.map(findingKey));

  const added = Array.from(bSet)
    .filter((k) => !aSet.has(k))
    .sort(comparePathBytes);

  const removed = Array.from(aSet)
    .filter((k) => !bSet.has(k))
    .sort(comparePathBytes);

  return { added, removed };
}

export async function diffInputs(
  aInput: string,
  bInput: string,
  opts: DiffOptions
): Promise<DiffReport & { capability_deltas: { added: Capability[]; removed: Capability[] }; finding_deltas: { added: string[]; removed: string[] } }> {
  const [a, b] = await Promise.all([receiptFromInput(aInput, opts), receiptFromInput(bInput, opts)]);

  const { diffs, summary } = fileDiffs(a.files, b.files);

  const aCaps = (a.scan.capabilities ?? []) as Capability[];
  const bCaps = (b.scan.capabilities ?? []) as Capability[];

  const aFindings = (a.scan.findings ?? []) as Finding[];
  const bFindings = (b.scan.findings ?? []) as Finding[];

  return {
    contract_version: CONTRACT_VERSION,
    created_at: nowIso(opts.deterministic),
    a: { bundle_sha256: a.bundle_sha256 },
    b: { bundle_sha256: b.bundle_sha256 },
    file_diffs: diffs,
    capability_deltas: capabilityDeltas(aCaps, bCaps),
    finding_deltas: findingDeltas(aFindings, bFindings),
    summary
  };
}
