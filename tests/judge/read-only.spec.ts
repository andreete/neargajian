/**
 * README step 5 as a judge sees it: fresh demo database, no signer keys. The app says it is a
 * read-only copy, the upload and review work, and Submit refuses with a clear message without
 * recording anything (the run stays a draft, nothing is left "submitting").
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('judge mode: upload and review work; submit is refused clearly and nothing is recorded', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Sign in to GAJIAN' });
  await dialog.getByLabel('Email').fill('maker@gajian.my.id');
  await dialog.getByLabel('Password').fill('12345678');
  await dialog.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/maker$/);
  await expect(page.getByTestId('no-signer-note')).toContainText('Read-only copy');
  await expect(page.getByText('November contractors (demo)')).toHaveCount(0); // clean database: no demo draft
  await page.goto('/maker/runs/new');
  // No Anthropic key on a judge's copy: the payroll assistant says so; everything else works.
  await expect(page.getByTestId('assistant-off')).toHaveText('The payroll assistant is off on this copy (no API key). Everything else works: create the run below.');
  await page.getByLabel('Run title').fill('Judge check');
  await page.getByText('Upload a file').click();
  await page.getByText('Detailed', { exact: true }).click();
  await page.getByRole('button', { name: 'Create draft run' }).click();
  await page.waitForURL(/\/maker\/runs\/(?!new$)[^/]+$/);
  const runId = page.url().split('/').pop()!;
  await page.getByLabel('Choose a payroll file').setInputFiles({ name: 'gajian-payroll-sample-1000.csv', mimeType: 'text/csv', buffer: readFileSync('public/templates/gajian-payroll-sample-1000.csv') });
  await expect(page.getByText(/Accepted .*1,000 rows, exact total 56\.69086 tUSDC/)).toBeVisible();
  await page.getByRole('link', { name: 'Continue to review' }).click();
  await page.waitForURL(/\/review$/);
  await page.getByRole('button', { name: 'Submit for approval' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Submit .* tUSDC for approval$/ }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('This copy of GAJIAN has no signer keys');
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Nothing was recorded');
  await page.goto(`/runs/${runId}`);
  await expect(page.getByText('This run has no submitted version yet.')).toBeVisible();
});
