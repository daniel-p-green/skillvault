#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

import { generateReceipt } from './lib/receipt.js';
import { scanBundle } from './lib/scan.js';
import { verifyBundle } from './lib/verify.js';
import { gateFromBundle, gateFromReceipt } from './lib/gate.js';
import { diffInputs } from './lib/diff.js';
import { exportBundleToZip } from './lib/export.js';

export async function main(argv = process.argv): Promise<number> {
  // `process.exitCode` persists across multiple `main()` calls in the same process (tests).
  // Reset it so one command's exit code doesn't leak into the next.
  process.exitCode = 0;

  const parser = yargs(hideBin(argv))
    .scriptName('skillvault')
    .strict()
    .help()
    // Shared options (accepted by all commands).
    .option('policy', {
      type: 'string',
      describe: 'Path to policy.yaml'
    })
    .option('format', {
      choices: ['json', 'table'] as const,
      default: 'json',
      describe: 'Output format'
    })
    .option('out', {
      type: 'string',
      describe: 'Write output to this file (default: stdout)'
    })
    .option('deterministic', {
      type: 'boolean',
      default: false,
      describe: 'Freeze timestamps and enforce stable ordering for golden outputs'
    })
    .command(
      'scan <bundle_dir_or_zip>',
      'Scan a bundle and emit a deterministic scan report',
      (cmd) =>
        cmd.positional('bundle_dir_or_zip', {
          type: 'string',
          describe: 'Path to bundle directory or bundle.zip',
          demandOption: true
        }),
      async (args) => {
        const report = await scanBundle(String(args.bundle_dir_or_zip), { deterministic: Boolean(args.deterministic) });

        if (args.format === 'table') {
          const lines: string[] = [];
          lines.push(`bundle_sha256: ${report.bundle_sha256}`);
          lines.push(`files: ${report.summary.file_count}`);
          lines.push(`total_bytes: ${report.summary.total_bytes}`);
          lines.push(`findings: ${report.findings.length}`);
          for (const f of report.findings) {
            lines.push(`- [${f.severity}] ${f.code}${f.path ? ` (${f.path})` : ''}: ${f.message}`);
          }
          const out = lines.join('\n') + '\n';
          if (args.out) {
            await fs.writeFile(String(args.out), out, 'utf8');
          } else {
            process.stdout.write(out);
          }
        } else {
          const json = JSON.stringify(report, null, 2) + '\n';
          if (args.out) {
            await fs.writeFile(String(args.out), json, 'utf8');
          } else {
            process.stdout.write(json);
          }
        }
      }
    )
    .command(
      'receipt <bundle>',
      'Generate an offline-verifiable signed receipt JSON for a bundle',
      (cmd) =>
        cmd
          .positional('bundle', {
            type: 'string',
            describe: 'Path to bundle directory or bundle.zip',
            demandOption: true
          })
          .option('signing-key', {
            type: 'string',
            demandOption: true,
            describe: 'Path to Ed25519 private key PEM (PKCS#8)'
          })
          .option('key-id', {
            type: 'string',
            describe: 'Optional key identifier embedded in receipt.signature.key_id'
          }),
      async (args) => {
        const receipt = await generateReceipt(String(args.bundle), {
          policyPath: args.policy ? String(args.policy) : undefined,
          signingKeyPath: String(args.signingKey),
          keyId: args.keyId ? String(args.keyId) : undefined,
          deterministic: Boolean(args.deterministic)
        });

        const json = JSON.stringify(receipt, null, 2) + '\n';

        if (args.out) {
          await fs.writeFile(String(args.out), json, 'utf8');
        } else {
          process.stdout.write(json);
        }
      }
    )
    .command(
      'verify <bundle>',
      'Verify a bundle matches a receipt and passes policy/constraints (offline-verifiable via hashing)',
      (cmd) =>
        cmd
          .positional('bundle', {
            type: 'string',
            describe: 'Path to bundle directory or bundle.zip',
            demandOption: true
          })
          .option('receipt', {
            type: 'string',
            demandOption: true,
            describe: 'Path to receipt.json'
          })
          .option('offline', {
            type: 'boolean',
            default: false,
            describe: 'Forbid URL inputs / network fetches'
          }),
      async (args) => {
        const bundlePath = String(args.bundle);
        const receiptPath = String(args.receipt);

        const offline = Boolean(args.offline);
        if (offline) {
          const looksLikeUrl = (s: string) => /^https?:\/\//i.test(s);
          if (looksLikeUrl(bundlePath) || looksLikeUrl(receiptPath) || (args.policy && looksLikeUrl(String(args.policy)))) {
            console.error('Offline mode forbids URL inputs');
            process.exitCode = 2;
            return;
          }
        }

        const { report, exitCode } = await verifyBundle(bundlePath, {
          receiptPath,
          policyPath: args.policy ? String(args.policy) : undefined,
          offline,
          deterministic: Boolean(args.deterministic)
        });

        if (args.format === 'table') {
          const lines: string[] = [];
          lines.push(`verified: ${report.verified ? 'YES' : 'NO'}`);
          lines.push(`bundle_sha256: ${report.bundle_sha256}`);
          lines.push(`receipt_bundle_sha256: ${report.receipt.bundle_sha256}`);
          lines.push(`verdict: ${report.policy.verdict}`);
          lines.push(`risk_score_total: ${report.policy.risk_score.total}`);
          lines.push(`findings: ${report.findings.length}`);
          for (const f of report.findings) {
            lines.push(`- [${f.severity}] ${f.code}${f.path ? ` (${f.path})` : ''}: ${f.message}`);
          }
          const out = lines.join('\n') + '\n';
          if (args.out) {
            await fs.writeFile(String(args.out), out, 'utf8');
          } else {
            process.stdout.write(out);
          }
        } else {
          const json = JSON.stringify(report, null, 2) + '\n';
          if (args.out) {
            await fs.writeFile(String(args.out), json, 'utf8');
          } else {
            process.stdout.write(json);
          }
        }

        process.exitCode = exitCode;
      }
    )
    .command(
      'gate [bundle]',
      'Apply a policy to either a previously generated receipt or a fresh bundle scan',
      (cmd) =>
        cmd
          .positional('bundle', {
            type: 'string',
            describe: 'Path to bundle directory or bundle.zip'
          })
          .option('receipt', {
            type: 'string',
            describe: 'Path to receipt.json (skip scanning and use receipt scan summary)'
          }),
      async (args) => {
        if (!args.policy) {
          console.error('gate requires --policy policy.yaml');
          process.exitCode = 2;
          return;
        }

        const receiptPath = args.receipt ? String(args.receipt) : undefined;
        const bundlePath = args.bundle ? String(args.bundle) : undefined;

        if (!receiptPath && !bundlePath) {
          console.error('gate requires either --receipt receipt.json or a <bundle> argument');
          process.exitCode = 2;
          return;
        }

        if (receiptPath && bundlePath) {
          console.error('gate expects exactly one input: either --receipt or <bundle> (not both)');
          process.exitCode = 2;
          return;
        }

        const deterministic = Boolean(args.deterministic);

        const { report, exitCode } = receiptPath
          ? await gateFromReceipt(receiptPath, { policyPath: String(args.policy), deterministic })
          : await gateFromBundle(String(bundlePath), { policyPath: String(args.policy), deterministic });

        if (args.format === 'table') {
          const lines: string[] = [];
          lines.push(`verdict: ${report.verdict}`);
          lines.push(`risk_score_total: ${report.risk_score.total}`);
          lines.push(`policy_verdict: ${report.policy.verdict}`);
          lines.push(`findings: ${report.findings.length}`);
          for (const f of report.findings) {
            lines.push(`- [${f.severity}] ${f.code}${f.path ? ` (${f.path})` : ''}: ${f.message}`);
          }
          const out = lines.join('\n') + '\n';
          if (args.out) {
            await fs.writeFile(String(args.out), out, 'utf8');
          } else {
            process.stdout.write(out);
          }
        } else {
          const json = JSON.stringify(report, null, 2) + '\n';
          if (args.out) {
            await fs.writeFile(String(args.out), json, 'utf8');
          } else {
            process.stdout.write(json);
          }
        }

        process.exitCode = exitCode;
      }
    )
    .command(
      'diff',
      'Compare two bundles and/or receipts and emit deterministic security-relevant deltas',
      (cmd) =>
        cmd
          .option('a', {
            type: 'string',
            demandOption: true,
            describe: 'Path to bundle directory / bundle.zip OR a receipt.json'
          })
          .option('b', {
            type: 'string',
            demandOption: true,
            describe: 'Path to bundle directory / bundle.zip OR a receipt.json'
          }),
      async (args) => {
        const report = await diffInputs(String(args.a), String(args.b), {
          policyPath: args.policy ? String(args.policy) : undefined,
          deterministic: Boolean(args.deterministic)
        });

        if (args.format === 'table') {
          const lines: string[] = [];
          lines.push(`a_bundle_sha256: ${report.a.bundle_sha256 ?? ''}`);
          lines.push(`b_bundle_sha256: ${report.b.bundle_sha256 ?? ''}`);
          lines.push(`files: +${report.summary.added} -${report.summary.removed} ~${report.summary.modified} =${report.summary.unchanged}`);
          lines.push(`capabilities_added: ${report.capability_deltas.added.join(', ') || '-'}`);
          lines.push(`capabilities_removed: ${report.capability_deltas.removed.join(', ') || '-'}`);
          lines.push(`findings_added: ${report.finding_deltas.added.join(', ') || '-'}`);
          lines.push(`findings_removed: ${report.finding_deltas.removed.join(', ') || '-'}`);
          const out = lines.join('\n') + '\n';
          if (args.out) {
            await fs.writeFile(String(args.out), out, 'utf8');
          } else {
            process.stdout.write(out);
          }
        } else {
          const json = JSON.stringify(report, null, 2) + '\n';
          if (args.out) {
            await fs.writeFile(String(args.out), json, 'utf8');
          } else {
            process.stdout.write(json);
          }
        }
      }
    )
    .command(
      'export <bundle_dir>',
      'Export a bundle directory to a strict_v0-compliant zip and validate it',
      (cmd) =>
        cmd
          .positional('bundle_dir', {
            type: 'string',
            describe: 'Path to bundle directory (not a zip)',
            demandOption: true
          })
          .option('out', {
            type: 'string',
            demandOption: true,
            describe: 'Path to write bundle.zip'
          })
          .option('profile', {
            type: 'string',
            default: 'strict_v0',
            describe: 'Export profile name (v0.1 supports strict_v0)'
          }),
      async (args) => {
        const report = await exportBundleToZip(String(args.bundle_dir), {
          outPath: String(args.out),
          policyPath: args.policy ? String(args.policy) : undefined,
          profile: String(args.profile),
          deterministic: Boolean(args.deterministic)
        });

        if (args.format === 'table') {
          const lines: string[] = [];
          lines.push(`validated: ${report.validated ? 'YES' : 'NO'}`);
          lines.push(`bundle_sha256: ${report.bundle_sha256}`);
          lines.push(`out_path: ${report.out_path}`);
          lines.push(`files: ${report.files.length}`);
          lines.push(`findings: ${report.findings.length}`);
          for (const f of report.findings) {
            lines.push(`- [${f.severity}] ${f.code}${f.path ? ` (${f.path})` : ''}: ${f.message}`);
          }
          const out = lines.join('\n') + '\n';
          if (args.out) {
            // NOTE: For export, --out is reserved for zip path; table/json always go to stdout.
            process.stdout.write(out);
          } else {
            process.stdout.write(out);
          }
        } else {
          const json = JSON.stringify(report, null, 2) + '\n';
          process.stdout.write(json);
        }

        process.exitCode = report.validated ? 0 : 1;
      }
    )
    .demandCommand(1, 'Provide a command');

  await parser.parse();
  return typeof process.exitCode === 'number' ? process.exitCode : 0;
}

// Only run if invoked as a binary, not imported by tests.
const isInvokedAsBin = (() => {
  try {
    const thisFile = fileURLToPath(import.meta.url);
    return process.argv[1] === thisFile;
  } catch {
    return false;
  }
})();

if (isInvokedAsBin) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
