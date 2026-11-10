/**
 * Phase 20 · hosted demo mode in the browser (HOSTED_DEMO=true, no admin key, database as the
 * hosted service creates it). Banner everywhere, testnet history with explorer links, workflow and
 * directory read-only, the 1,000-row sample uploads and previews but cannot be submitted.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page, email: string, home: RegExp) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Sign in to SentFund' });
  await dialog.getByLabel('Email').fill(email);
  await dialog.getByLabel('Password').fill('12345678');
  await dialog.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(home);
}
const BANNER = 'Public demo on NEAR testnet. tUSDC is a zero-value test token. The demo data is shared: everyone signs in with the same demo accounts and sees the same runs.';

test('banner on the landing page and on every app page; paid testnet runs with explorer links', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|Refused to/i.test(m.text())) problems.push(m.text()); });
  await page.goto('/');
  await expect(page.getByTestId('hosted-banner')).toHaveText(BANNER);
  await expect(page.getByTestId('readonly-banner')).toHaveCount(0);
  await signIn(page, 'maker@sentfund.my.id', /\/maker$/);
  await expect(page.getByTestId('hosted-banner')).toBeVisible();
  const testnetRun = page.getByRole('row').filter({ hasText: 'Testnet run' }).filter({ hasText: 'Paid' }).first();
  await expect(testnetRun).toBeVisible();
  await expect(testnetRun.locator('a[href^="https://testnet.nearblocks.io/txns/"]').first()).toBeVisible();
  await page.goto('/history?view=consolidated');
  await expect(page.getByTestId('hosted-banner')).toBeVisible();
  expect(problems).toEqual([]);
});

test('the 1,000-row sample uploads and previews; submitting it is refused with a clear message', async ({ page }) => {
  await signIn(page, 'maker@sentfund.my.id', /\/maker$/);
  await page.goto('/maker/runs/new');
  await page.getByLabel('Run title').fill('Hosted sample check');
  await page.getByText('Upload a file').click();
  await page.getByRole('button', { name: 'Create draft run' }).click();
  await page.waitForURL(/\/maker\/runs\/(?!new$)[^/]+$/);
  const runId = page.url().split('/').pop()!;
  await page.getByLabel('Choose a payroll file').setInputFiles({ name: 'sentfund-payroll-sample-1000.csv', mimeType: 'text/csv', buffer: readFileSync('public/templates/sentfund-payroll-sample-1000.csv') });
  await expect(page.getByText(/Accepted .*1,000 rows, exact total 56\.69086 tUSDC/)).toBeVisible();
  await page.getByRole('link', { name: 'Continue to review' }).click();
  await page.waitForURL(/\/review$/);
  await expect(page.getByTestId('hosted-submit-note')).toContainText('1,000 of 1,000 rows are not');
  await page.getByRole('button', { name: 'Submit for approval' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Submit .* tUSDC for approval$/ }).click();
  const alert = page.getByRole('dialog').getByRole('alert');
  await expect(alert).toContainText('Public demo: a run can only pay recipients that are in the directory and "Ready to receive tUSDC" on testnet');
  await expect(alert).toContainText('Nothing was sent.');
  await page.goto(`/runs/${runId}`);
  await expect(page.getByText('This run has no submitted version yet.')).toBeVisible();
});

test('without the admin key the workflow is read-only, and the directory is read-only for everyone', async ({ page }) => {
  await signIn(page, 'admin@sentfund.my.id', /\/admin$/);
  await expect(page.getByTestId('workflow-read-only')).toContainText('it has no admin signer key');
  await expect(page.getByRole('button', { name: 'Save workflow' })).toBeDisabled();
  await page.goto('/admin/recipients');
  await expect(page.getByTestId('hosted-directory-note')).toContainText('read-only in the public demo');
  await expect(page.getByRole('switch', { name: 'Pay registered recipients only' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Add recipient' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Edit / })).toHaveCount(0);
  await expect(page.getByLabel('Choose a recipient directory file')).toHaveCount(0);
  // The server refuses every change too: tests/integration/hosted.test.ts.
  // Three live recipients, checked "Ready" at the reset.
  await expect(page.getByRole('region', { name: 'Directory' }).getByRole('row').filter({ hasText: 'Ready' })).toHaveCount(3);
});

test('Payroll Advance: an employee signs in and requests (at most 0.30, nothing sent); the policy is read-only', async ({ page, browser }) => {
  await signIn(page, 'grace@sentfund.my.id', /\/employee$/);
  await expect(page.getByTestId('hosted-banner')).toBeVisible();
  await expect(page.getByTestId('advance-available')).toContainText('0.30');
  const offer = page.getByTestId('advance-offer');
  await offer.getByLabel('Amount (tUSDC)').fill('0.31');
  await expect(offer.getByText('Choose from 0.01 to 0.30 tUSDC.')).toBeVisible();
  await offer.getByLabel('Amount (tUSDC)').fill('0.10');
  await offer.getByLabel('I agree to these 6 salary deductions').check();
  await offer.getByRole('button', { name: 'Request 0.10 tUSDC' }).click();
  await expect(page.getByTestId('advance-current').getByTestId('advance-status')).toHaveText('Requested');
  const admin = await browser.newPage();
  await signIn(admin, 'admin@sentfund.my.id', /\/admin$/);
  await admin.goto('/admin/payroll-advance');
  await expect(admin.getByTestId('advance-policy-read-only')).toBeVisible();
  await expect(admin.getByRole('button', { name: 'Save policy' })).toHaveCount(0);
  await admin.close();
});
