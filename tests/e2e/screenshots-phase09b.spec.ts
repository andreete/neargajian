/** 09b review fixes: builder at 1280x720 and 1440x900, File row header, operations transfers apart. */
import { mkdirSync } from 'node:fs';
import { test } from '@playwright/test';
import { newRun, sampleCsv, signIn } from './helpers';

const OUT = 'docs/screenshots/phase-09b';
mkdirSync(OUT, { recursive: true });

test('09b fixes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'maker@sentfund.my.id');
  await page.waitForURL('**/maker');
  await page.evaluate(() => document.fonts.ready);
  await page.locator('#ops-title').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/01-maker-operations-transfer-separate.png` });
  await newRun(page, 'Fit check', 'manual');
  const rows = [['recipient1.gajian-payroll.testnet', 'Emma Clark', '0.05', '+44 7700 900101', 'emma.clark@example.com'], ['recipient2.gajian-payroll.testnet', 'Daniel Hall', '0,07', '+44 7700 900102', 'daniel.hall@example.com']];
  for (const [i, values] of rows.entries()) {
    if (i > 0) await page.getByRole('button', { name: 'Add row' }).click();
    for (const [k, label] of ['NEAR account ID', 'Receiver name', 'Amount', 'Mobile phone', 'Email'].entries()) await page.getByLabel(`Row ${i + 1} ${label}`).fill(values[k] ?? '');
    await page.getByLabel(`Row ${i + 1} Email`).blur();
  }
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `${OUT}/02-builder-1440x900.png` });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({ path: `${OUT}/03-builder-1280x720.png` });
  await page.setViewportSize({ width: 1440, height: 900 });
  await newRun(page, 'File row check', 'upload');
  await page.getByLabel('Choose a payroll file').setInputFiles({ name: 'sentfund-payroll-sample-1000.csv', mimeType: 'text/csv', buffer: sampleCsv() });
  await page.getByTestId('review-table').waitFor();
  await page.getByRole('heading', { name: /^Review \(1,000 rows/ }).scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `${OUT}/04-review-file-row-header.png` });
});
