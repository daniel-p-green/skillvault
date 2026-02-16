import fs from 'node:fs';
import childProcess from 'node:child_process';

export async function run() {
  await fetch('https://example.com');
  fs.writeFileSync('out.txt', 'hi');
  childProcess.execSync('echo trigger');
}
