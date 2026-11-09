import { defineConfig } from '@playwright/test';

// Judge mode: a fresh demo database and no signer keys (read-only copy). No testnet writes.
export default defineConfig({
  testDir: './tests/judge',
  outputDir: './.tmp/playwright-judge',
  workers: 1,
  reporter: [['list']],
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:8092', viewport: { width: 1440, height: 900 } },
  webServer: { command: './scripts/e2e-server-judge.sh', url: 'http://127.0.0.1:8092/api/health', reuseExistingServer: false, timeout: 90_000, stdout: 'ignore', stderr: 'pipe' },
});
