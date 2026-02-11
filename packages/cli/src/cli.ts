#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

import { generateReceipt } from './lib/receipt.js';
import { verifyBundle } from './lib/verify.js';

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
      'scan <bundle>',
      'Scan a bundle for suspicious patterns (not implemented in this story)',
      (cmd) =>
        cmd.positional('bundle', {
          type: 'string',
          describe: 'Path to bundle directory or bundle.zip',
          demandOption: true
        }),
      async () => {
        console.error('scan is not implemented yet');
        process.exitCode = 2;
      }
    )
    .command(
      'receipt <bundle>',
      'Generate an offline-verifiable receipt JSON for a bundle',
      (cmd) =>
        cmd.positional('bundle', {
          type: 'string',
          describe: 'Path to bundle directory or bundle.zip',
          demandOption: true
        }),
      async (args) => {
        const receipt = await generateReceipt(String(args.bundle), {
          policyPath: args.policy ? String(args.policy) : undefined,
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
