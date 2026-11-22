const { defineConfig } = require('@playwright/test');

const port = process.env.MUSCULES_TEST_PORT === undefined
  ? 4173
  : Number(process.env.MUSCULES_TEST_PORT);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('MUSCULES_TEST_PORT debe ser un puerto entero entre 1024 y 65535.');
}
const baseURL = `http://127.0.0.1:${port}`;

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL,
    browserName: 'chromium',
    headless: true,
    extraHTTPHeaders: {
      'x-muscules-playwright': '1'
    },
    trace: 'off',
    screenshot: 'off',
    video: 'off'
  },
  webServer: {
    command: `PORT=${port} node tests/serve.js`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 15_000
  }
});
