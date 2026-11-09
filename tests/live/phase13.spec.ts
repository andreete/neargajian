/**
 * Phase 13 live proof on NEAR testnet, entirely through the app in a browser:
 * maker uploads 3 rows (detailed posting) and submits → approver 1 and approver 2 approve →
 * the release worker pays → Paid with explorer links → history in both views → both exports.
 * Screenshots: docs/screenshots/phase-13/. Downloads: .tmp/live-exports/.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Browser } from '@playwright/test';
import { paidScreens, shot } from './helpers';

mkdirSync('.tmp/live-exports', { recursive: true });

async function session(browser: Browser, email: string) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Sign in to GAJIAN' });
  await dialog.getByLabel('Email').fill(email);
  await dialog.getByLabel('Password').fill('12345678');
  await dialog.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(maker|approver|admin)$/);
  return page;
}

test('live testnet payroll through the app', async ({ browser }) => {
  // 1. Maker: upload, detailed posting, review, submit. (RESUME_RUN_ID resumes an already submitted run.)
  const maker = await session(browser, 'maker@gajian.my.id');
  let runId = process.env.RESUME_RUN_ID ?? '';
  if (!runId) {
  await maker.goto('/maker/runs/new');
  await maker.getByLabel('Run title').fill('November contractors (live testnet)');
  await maker.getByText('Upload a file').click();
  await maker.getByText('Detailed', { exact: true }).click();
  await maker.getByRole('button', { name: 'Create draft run' }).click();
  await maker.waitForURL(/\/maker\/runs\/(?!new$)[^/]+$/);
  runId = maker.url().split('/').pop()!;
  writeFileSync('.tmp/live-exports/run-id.txt', runId);
  await maker.getByLabel('Choose a payroll file').setInputFiles({ name: 'live-3-rows.csv', mimeType: 'text/csv', buffer: readFileSync('tests/live/live-3-rows.csv') });
  await expect(maker.getByText(/Accepted .*3 rows, exact total 0\.12 tUSDC/)).toBeVisible();
  await maker.getByRole('link', { name: 'Continue to review' }).click();
  await maker.waitForURL(/\/review$/);
  await maker.getByRole('button', { name: 'Submit for approval' }).click();
  const submitDialog = maker.getByRole('dialog', { name: /Submit version 1 for approval/ });
  await expect(submitDialog).toContainText('0.12 tUSDC');
  await shot(maker, '01-submit-confirmation-dialog');
  await submitDialog.getByRole('button', { name: /Submit 0\.12 tUSDC for approval/ }).click();
  await maker.waitForURL(`**/runs/${runId}`);
  await expect(maker.locator('.run-head .chip').first()).toHaveText(/Awaiting approval/, { timeout: 90_000 });
  }

  // HISTORY_ONLY=1 resumes after payment (history, exports) for an already paid run.
  if (!process.env.HISTORY_ONLY) {
  // 2. Approver 1: review detail, approve, waiting for chain confirmation.
  const app1 = await session(browser, 'app1@gajian.my.id');
  await app1.goto(`/runs/${runId}`);
  await expect(app1.getByRole('heading', { name: 'Your decision (step 1)' })).toBeVisible();
  await shot(app1, '02-approver-review-detail');
  await app1.getByRole('button', { name: 'Approve version 1' }).click();
  await app1.getByRole('dialog', { name: 'Approve version 1?' }).getByRole('button', { name: /Approve 0\.12 tUSDC/ }).click();
  await expect(app1.getByText('Waiting for NEAR').first()).toBeVisible({ timeout: 30_000 });
  await shot(app1, '03-approval-waiting-for-chain-confirmation');
  await expect(app1.locator('.timeline-list')).toContainText('Confirmed on NEAR', { timeout: 90_000 });

  // 3. Approver 2 (after step 1 is confirmed).
  const app2 = await session(browser, 'app2@gajian.my.id');
  await app2.goto(`/runs/${runId}`);
  await expect(app2.getByRole('heading', { name: 'Your decision (step 2)' })).toBeVisible({ timeout: 60_000 });
  await app2.getByRole('button', { name: 'Approve version 1' }).click();
  await app2.getByRole('dialog', { name: 'Approve version 1?' }).getByRole('button', { name: /Approve 0\.12 tUSDC/ }).click();

  // 4. Automatic release by the worker: Releasing, then Paid.
  await maker.goto(`/runs/${runId}`);
  await expect(maker.locator('.run-head .chip').first()).toHaveText(/Releasing/, { timeout: 180_000 });
  await shot(maker, '04-run-releasing');
  await expect(maker.locator('.run-head .chip').first()).toHaveText(/^Paid$/, { timeout: 300_000 });
  await paidScreens(maker);
  }

  // 5. History in both views, exports.
  // History lists a run once every payout is confirmed by the worker as well (may lag the vault by a tick).
  await expect(async () => {
    await maker.goto('/history?view=consolidated');
    await expect(maker.getByTestId('history')).toContainText('November contractors (live testnet)', { timeout: 2000 });
  }).toPass({ timeout: 60_000 });
  await shot(maker, '06-history-consolidated');
  await maker.goto('/history?view=detailed');
  await expect(maker.getByTestId('history')).toContainText('Emma Clark');
  await shot(maker, '07-history-detailed');
  await maker.getByTestId('export-area').scrollIntoViewIfNeeded();
  await shot(maker, '08-export-area');
  for (const [name, link] of [['company', /Company entries/], ['recipients', /Recipient detail/]] as const) {
    const download = maker.waitForEvent('download');
    await maker.getByTestId('export-area').getByRole('link', { name: link }).click();
    await (await download).saveAs(`.tmp/live-exports/${name}.csv`);
  }
});
