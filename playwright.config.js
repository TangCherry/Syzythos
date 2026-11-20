const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    headless: true,
    trace: 'off',
    screenshot: 'off',
    video: 'off'
  },
  webServer: {
    command: 'node tests/serve.js',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 15_000
  }
});
