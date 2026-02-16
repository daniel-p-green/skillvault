import { fileURLToPath } from 'node:url';

import { startServer } from './server.js';

export * from './server.js';

async function run(): Promise<void> {
  const port = process.env.SKILLVAULT_MANAGER_PORT ? Number(process.env.SKILLVAULT_MANAGER_PORT) : 4646;
  const rootDir = process.env.SKILLVAULT_ROOT;
  await startServer({ port: Number.isFinite(port) ? port : 4646, rootDir });
}

const isInvokedAsEntrypoint = (() => {
  try {
    return fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
})();

if (isInvokedAsEntrypoint) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
