const { resolve } = require('node:path');
const { spawn } = require('node:child_process');
const mode = process.argv[2];
const cwd =
  mode === 'before' ? process.env.QA117_BEFORE_DIR || '/tmp/latin-app-release117-before' : resolve(__dirname, '../..');
const env = {
  ...process.env,
  NEXT_PUBLIC_FIREBASE_API_KEY: 'fake-api-key',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'demo-latin-app.firebaseapp.com',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-latin-app',
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'demo-latin-app.appspot.com',
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
  NEXT_PUBLIC_FIREBASE_APP_ID: '1:000000000000:web:e2e',
  NEXT_PUBLIC_USE_FIREBASE_EMULATORS: 'true',
  NEXT_PUBLIC_DISABLE_PROGRESSION_LOCK: 'false',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
  GCLOUD_PROJECT: 'demo-latin-app',
  GOOGLE_CLOUD_PROJECT: 'demo-latin-app',
  NEXT_TELEMETRY_DISABLED: '1',
};
const args =
  mode === 'build'
    ? ['node_modules/next/dist/bin/next', 'build']
    : mode === 'start'
      ? ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3000']
      : mode === 'emulators'
        ? ['tests/e2e/start-emulators.mjs']
        : [
            'node_modules/next/dist/bin/next',
            'dev',
            '--hostname',
            '127.0.0.1',
            '--port',
            mode === 'before' ? '3001' : '3000',
          ];
const child = spawn(process.execPath, args, { cwd, env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code ?? 1));
