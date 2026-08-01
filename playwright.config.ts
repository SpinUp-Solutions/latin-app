import { PlaywrightTestConfig, devices } from '@playwright/test';

process.env.NEXT_PUBLIC_FIREBASE_API_KEY = 'fake-api-key';
process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = 'demo-latin-app.firebaseapp.com';
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'demo-latin-app';
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = 'demo-latin-app.appspot.com';
process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = '000000000000';
process.env.NEXT_PUBLIC_FIREBASE_APP_ID = '1:000000000000:web:e2e';
process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS = 'true';
process.env.NEXT_PUBLIC_DISABLE_PROGRESSION_LOCK = 'false';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.GCLOUD_PROJECT = 'demo-latin-app';

const config: PlaywrightTestConfig = {
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : [['html', { open: 'never' }]],
  use: {
    actionTimeout: 10000,
    navigationTimeout: 30000,
    trace: 'on-first-retry',
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000',
  },
  webServer: [
    {
      command: 'npm run firebase:emulators:e2e',
      url: 'http://127.0.0.1:8080',
      timeout: 120000,
      reuseExistingServer: false,
    },
    {
      command: 'npm run dev:e2e',
      url: 'http://127.0.0.1:3000',
      timeout: 120000,
      reuseExistingServer: false,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Uncomment these for multi-browser testing
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],
};

export default config;
