#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

import { generateReceipt } from './lib/receipt.js';

export async function main(argv = process.argv): Promise<number> {
  const parser = yargs(hideBin(argv))
    .scriptName('skillvault')
    .strict()
    .help()
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
        cmd
          .positional('bundle', {
            type: 'string',
            describe: 'Path to bundle directory or bundle.zip',
            demandOption: true
          })
          .option('policy', {
            type: 'string',
            describe: 'Path to policy.yaml'
          })
          .option('out', {
            type: 'string',
            describe: 'Write receipt JSON to this file (default: stdout)'
          })
          .option('deterministic', {
            type: 'boolean',
            default: false,
            describe: 'Freeze timestamps and enforce stable ordering for golden outputs'
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
