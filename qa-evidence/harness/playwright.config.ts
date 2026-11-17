import base from '../../playwright.config';
export default {
  ...base,
  webServer: undefined,
  globalSetup: [],
  globalTeardown: [],
  testDir: '.',
  testMatch: '**/release117-qa.spec.ts',
  timeout: 90000,
  reporter: [['line'], ['json', { outputFile: 'qa-evidence/results.json' }]],
  use: { ...base.use, baseURL: 'http://127.0.0.1:3000', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
};
