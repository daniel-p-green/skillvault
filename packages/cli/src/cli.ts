#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { fileURLToPath } from 'node:url';

export async function main(argv = process.argv): Promise<number> {
  const parser = yargs(hideBin(argv))
    .scriptName('skillvault')
    .strict()
    .help()
    .command(
      'scan <pathOrUrl>',
      'Scan a skill file for suspicious patterns (MVP scaffold: not implemented yet)',
      (cmd) =>
        cmd.positional('pathOrUrl', {
          type: 'string',
          describe: 'Path or URL to a skill file',
          demandOption: true
        }),
      async () => {
        // US-001 is scaffold only; scanning is implemented in a later story.
        // Keep deterministic behavior: always exit non-zero until implemented.
        console.error('scan is not implemented yet (scaffold)');
        process.exitCode = 2;
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
