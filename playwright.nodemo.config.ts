import { defineConfig } from '@playwright/test';

// Phase 25: the production build with DEMO_MODE off (scripts/e2e-server-nodemo.sh): no demo
// accounts box and no Fill buttons in the sign-in dialog. Fresh database under .tmp/.
export default defineConfig({
  testDir: './tests/e2e-nodemo',
  outputDir: './.tmp/playwright-nodemo',
  workers: 1,
  reporter: [['list']],
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:8092', viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure' },
  webServer: { command: './scripts/e2e-server-nodemo.sh', url: 'http://127.0.0.1:8092/api/health', reuseExistingServer: false, timeout: 90_000, stdout: 'ignore', stderr: 'pipe' },
});
