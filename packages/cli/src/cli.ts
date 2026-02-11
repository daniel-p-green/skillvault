#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

import { generateReceipt } from './lib/receipt.js';

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
