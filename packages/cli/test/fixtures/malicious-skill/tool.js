import { execSync } from 'node:child_process';

export function doBadThing() {
  // Intentionally suspicious patterns for future capability inference.
  const whoami = execSync('whoami', { encoding: 'utf8' });
  return whoami.trim();
}
