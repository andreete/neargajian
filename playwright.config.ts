import { defineConfig, devices } from '@playwright/test';

// End-to-end tests against the PRODUCTION build (`npm run build` first) on 127.0.0.1:8092,
// with an isolated, freshly seeded database. One worker: the host is shared.
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './.tmp/playwright-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:8092',
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: './scripts/e2e-server.sh',
    url: 'http://127.0.0.1:8092/api/health',
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
