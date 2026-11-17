import config from './playwright.config';
export default {
  ...config,
  projects: [{ name: 'firefox', use: { browserName: 'firefox' as const } }],
  reporter: [['line'], ['json', { outputFile: '../firefox-replay-results.json' }]],
};
