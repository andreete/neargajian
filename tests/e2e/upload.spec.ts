import { expect, test } from '@playwright/test';
import { brokenSample, newRun, sampleCsv, signIn } from './helpers';

test('upload: rejected file shows every problem and keeps the previous version; accepted file shows 50 rows per page in file order', async ({ page }) => {
  await signIn(page, 'maker@sentfund.my.id');
  await page.waitForURL('**/maker');
  await newRun(page, 'E2E upload run', 'upload');
  await expect(page.getByTestId('active-file')).toHaveText('No file accepted yet');
  await expect(page.getByRole('link', { name: /Excel template with sample rows/ })).toHaveAttribute('href', '/templates/sentfund-payroll-template.xlsx');

  const input = page.getByLabel('Choose a payroll file');
  await input.setInputFiles({ name: 'sentfund-payroll-sample-1000.csv', mimeType: 'text/csv', buffer: sampleCsv() });
  await expect(page.getByText(/Accepted .*1,000 rows, exact total 56\.69086 tUSDC/)).toBeVisible();
  const review = page.getByTestId('review-table');
  await expect(review.locator('tbody tr')).toHaveCount(50);
  await expect(review.locator('tbody tr').first().locator('td').first()).toHaveText('2');
  await expect(page.getByText('rows 1–50 of 1,000')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(review.locator('tbody tr').first().locator('td').first()).toHaveText('52');
  await expect(page.getByText('rows 51–100 of 1,000')).toBeVisible();

  await input.setInputFiles({ name: 'payroll-with-errors.csv', mimeType: 'text/csv', buffer: brokenSample() });
  const panel = page.getByTestId('error-panel');
  await expect(panel).toContainText('File rejected: 2 problems');
  await expect(panel).toContainText('Row 61: invalid NEAR account ID. Fix the file and upload it again.');
  await expect(panel).toContainText('Use a dot as the decimal separator, e.g. 1500.50');
  await expect(panel).toContainText('the previous version (sentfund-payroll-sample-1000.csv) remains active');
  const download = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Download error report (CSV)' }).click();
  expect((await download).suggestedFilename()).toBe('payroll-with-errors-errors.csv');
  await page.reload();
  await expect(page.getByTestId('active-file')).toContainText('sentfund-payroll-sample-1000.csv');
  await expect(page.getByTestId('review-table').locator('tbody tr')).toHaveCount(50);
});
