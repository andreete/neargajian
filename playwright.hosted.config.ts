import { defineConfig } from '@playwright/test';

// Hosted demo mode: fresh database as on the hosted service, no admin key. No testnet writes.
export default defineConfig({
  testDir: './tests/hosted',
  outputDir: './.tmp/playwright-hosted',
  workers: 1,
  reporter: [['list']],
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:8092', viewport: { width: 1440, height: 900 } },
  webServer: { command: './scripts/e2e-server-hosted.sh', env: { HOSTED_READONLY: 'false' }, url: 'http://127.0.0.1:8092/api/health', reuseExistingServer: false, timeout: 90_000, stdout: 'ignore', stderr: 'pipe' },
});
