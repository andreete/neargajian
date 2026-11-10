import { defineConfig } from '@playwright/test';

// LIVE testnet flow through the app (Phase 13 proof). Runs against an already running
// production server + release worker on 127.0.0.1:8092 with the real demo database.
// Sends real testnet transactions: run only on purpose (npm run live:phase13).
export default defineConfig({
  testDir: './tests/live',
  testIgnore: 'hosted-smoke.spec.ts', // the public demo's smoke test: playwright.hosted-live.config.ts
  outputDir: './.tmp/playwright-live',
  workers: 1,
  timeout: 600_000,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:8092', viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure', acceptDownloads: true },
});
