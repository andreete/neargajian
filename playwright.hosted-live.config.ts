import { defineConfig } from '@playwright/test';

// LIVE smoke test of the public hosted demo (docs/HOSTING.md step 6). Sends real testnet
// transactions on the hosted site: run only on purpose. HOSTED_URL defaults to the demo.
export default defineConfig({
  testDir: './tests/live',
  testMatch: 'hosted-smoke.spec.ts',
  outputDir: './.tmp/playwright-hosted-live',
  workers: 1,
  timeout: 600_000,
  reporter: [['list']],
  use: { baseURL: process.env.HOSTED_URL ?? 'https://sentfund.my.id', viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure' },
});
