/** Shared helpers for the live specs (no tests here). */
import { mkdirSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

const OUT = 'docs/screenshots/phase-13';
mkdirSync(OUT, { recursive: true });

export const shot = async (page: Page, name: string, dir = OUT) => {
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `${dir}/${name}.png` });
};

/** Paid run: badge, counter and timeline must agree (3 of 3) before capturing 05 and 05b. */
export async function paidScreens(page: Page) {
  await expect(page.locator('.stat').filter({ hasText: /^Paid/ }).locator('.value')).toHaveText('3 of 3');
  await expect(page.getByText('Payouts: 3 of 3 paid')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, '05-paid-run-with-explorer-links');
  await page.locator('#rows-h').evaluate((el) => el.closest('section')?.scrollIntoView({ block: 'start' }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  await expect(page.locator('#rows-h')).toBeInViewport();
  await shot(page, '05b-paid-run-recipients-and-payout-links');
}
