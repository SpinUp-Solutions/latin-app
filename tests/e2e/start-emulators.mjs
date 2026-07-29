import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const workspace = process.cwd();
const runtimeDirectory = resolve(tmpdir(), 'latin-app-playwright-emulators');
const firebaseCli = resolve(workspace, 'node_modules/firebase-tools/lib/bin/firebase.js');
mkdirSync(runtimeDirectory, { recursive: true });

const child = spawn(
  process.execPath,
  [
    firebaseCli,
    'emulators:start',
    '--only',
    'auth,firestore',
    '--project',
    'demo-latin-app',
    '--config',
    resolve(workspace, 'firebase.json'),
  ],
  {
    cwd: runtimeDirectory,
    env: process.env,
    stdio: 'inherit',
  }
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('error', error => {
  console.error(error);
  process.exitCode = 1;
});
child.on('exit', code => {
  process.exit(code ?? 1);
});
