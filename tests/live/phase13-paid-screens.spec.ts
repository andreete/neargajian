/**
 * Read-only recapture of the paid-run screenshots (05, 05b) of the Phase 13 live run, after
 * the Phase 13b paid-state fix. Sends no transactions. RUN_ID = the live run's app ID.
 */
import { expect, test } from '@playwright/test';
import { paidScreens } from './helpers';

test('paid run screenshots (read-only)', async ({ browser }) => {
  const runId = process.env.RUN_ID;
  test.skip(!runId, 'set RUN_ID');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Sign in to GAJIAN' });
  await dialog.getByLabel('Email').fill('maker@gajian.my.id');
  await dialog.getByLabel('Password').fill('12345678');
  await dialog.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/maker$/);
  await page.goto(`/runs/${runId}`);
  await expect(page.locator('.run-head .chip').first()).toHaveText(/^Paid$/);
  await paidScreens(page);
});
