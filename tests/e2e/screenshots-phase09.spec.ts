/**
 * Phase 09 review screenshots (1440x900): admin workflow editor in sequence and parallel
 * mode, manual builder with one invalid row, upload drop zone, rejected file with its error
 * panel, accepted 1,000-row file (first 50 rows + page controls), posting preview in both
 * modes. Output: docs/screenshots/phase-09/.
 */
import { mkdirSync } from 'node:fs';
import { test, type Page } from '@playwright/test';
import { brokenSample, newRun, sampleCsv, signIn } from './helpers';

const OUT = 'docs/screenshots/phase-09';
mkdirSync(OUT, { recursive: true });
test.use({ viewport: { width: 1440, height: 900 } });

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
}

test('admin workflow editor: sequence and parallel', async ({ page }) => {
  await signIn(page, 'admin@sentfund.my.id');
  await page.waitForURL('**/admin');
  await settle(page);
  await page.screenshot({ path: `${OUT}/01-workflow-editor-sequence.png` });
  await page.getByText('Two in parallel', { exact: true }).click();
  await page.getByText('Maker releases', { exact: true }).click();
  await settle(page);
  await page.screenshot({ path: `${OUT}/02-workflow-editor-parallel.png` });
});

test('manual builder with one invalid row', async ({ page }) => {
  await signIn(page, 'maker@sentfund.my.id');
  await page.waitForURL('**/maker');
  await newRun(page, 'January contractors', 'manual');
  const rows = [
    ['recipient1.sentfund-payroll.testnet', 'Emma Clark', '0.05', '+44 7700 900101', 'emma.clark@example.com'],
    ['recipient2.sentfund-payroll.testnet', 'Daniel Hall', '0,07', '+44 7700 900102', 'daniel.hall@example.com'],
    ['recipient3.sentfund-payroll.testnet', 'Grace Lewis', '0.03', '+44 7700 900103', 'grace.lewis@example.com'],
  ];
  for (const [i, values] of rows.entries()) {
    if (i > 0) await page.getByRole('button', { name: 'Add row' }).click();
    for (const [k, label] of ['NEAR account ID', 'Receiver name', 'Amount', 'Mobile phone', 'Email'].entries()) {
      await page.getByLabel(`Row ${i + 1} ${label}`).fill(values[k] ?? '');
    }
    await page.getByLabel(`Row ${i + 1} Email`).blur();
  }
  await settle(page);
  await page.screenshot({ path: `${OUT}/03-manual-builder-one-invalid-row.png` });
});

test('upload: drop zone, rejected file, accepted 1,000 rows, posting preview', async ({ page }) => {
  await signIn(page, 'maker@sentfund.my.id');
  await page.waitForURL('**/maker');
  await newRun(page, 'December payroll', 'upload', 'Consolidated');
  await settle(page);
  await page.screenshot({ path: `${OUT}/04-upload-drop-zone.png` });

  const input = page.getByLabel('Choose a payroll file');
  await input.setInputFiles({ name: 'payroll-with-errors.csv', mimeType: 'text/csv', buffer: brokenSample() });
  await page.getByTestId('error-panel').waitFor();
  await page.getByRole('heading', { name: 'Upload payroll file' }).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -16));
  await settle(page);
  await page.screenshot({ path: `${OUT}/05-rejected-file-error-panel.png` });

  await input.setInputFiles({ name: 'sentfund-payroll-sample-1000.csv', mimeType: 'text/csv', buffer: sampleCsv() });
  await page.getByTestId('review-table').waitFor();
  await page.getByRole('heading', { name: /^Review \(1,000 rows/ }).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -16));
  await settle(page);
  await page.screenshot({ path: `${OUT}/06-accepted-1000-rows-review.png` });
  // Full first page: let the review card grow (CSSOM change, allowed by the CSP) and capture it.
  await page.evaluate(() => { const el = document.querySelector<HTMLElement>('.review-scroll'); if (el) el.style.maxHeight = 'none'; });
  await page.locator('section[aria-labelledby="review-title"]').screenshot({ path: `${OUT}/06b-accepted-first-50-rows-and-page-controls.png` });

  await page.getByTestId('posting-preview-consolidated').scrollIntoViewIfNeeded();
  await page.getByRole('heading', { name: 'Company posting' }).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -16));
  await settle(page);
  await page.screenshot({ path: `${OUT}/07-posting-preview-consolidated.png` });
  await page.getByText('Detailed', { exact: true }).click();
  await page.getByTestId('posting-preview-detailed').waitFor();
  await settle(page);
  await page.screenshot({ path: `${OUT}/08-posting-preview-detailed.png` });
});
