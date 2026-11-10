import { defineConfig } from '@playwright/test';

// TEST-ONLY whole-flow browser tests with the in-memory stand-in vault (scripts/e2e-server-standin.sh):
// production build, fresh database under .tmp/, no signer keys, nothing sent to NEAR testnet.
export default defineConfig({
  testDir: './tests/e2e-standin',
  outputDir: './.tmp/playwright-standin',
  workers: 1,
  reporter: [['list']],
  timeout: 120_000,
  use: { baseURL: 'http://127.0.0.1:8092', viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure' },
  webServer: { command: './scripts/e2e-server-standin.sh', url: 'http://127.0.0.1:8092/api/health', reuseExistingServer: false, timeout: 90_000, stdout: 'ignore', stderr: 'pipe' },
});
