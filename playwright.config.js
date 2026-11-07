const { defineConfig } = require('@playwright/test');
const { PORT } = require('./e2e/paths');

module.exports = defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.js',
  outputDir: './e2e/results',
  workers: 1, // the specs share one throw-away project folder, in order
  timeout: 30_000,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: 'msedge', // the Edge already installed on this computer; no browser download
    viewport: { width: 1400, height: 900 },
    screenshot: 'only-on-failure',
  },
  webServer: { command: 'node e2e/start-server.js', url: `http://127.0.0.1:${PORT}/`, reuseExistingServer: false, timeout: 30_000 },
});
