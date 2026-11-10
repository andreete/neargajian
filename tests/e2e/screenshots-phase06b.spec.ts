/**
 * Design-review screenshots (Phase 06b): landing first screen at four desktop sizes, full
 * landing at 1440, landing at 768, the sign-in dialog and the four dashboards at 1440x900.
 * Output: docs/screenshots/phase-06b/.
 */
import { mkdirSync } from 'node:fs';
import { test, type Page } from '@playwright/test';

const OUT = 'docs/screenshots/phase-06b';
mkdirSync(OUT, { recursive: true });

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
}

async function signIn(page: Page, email: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Sign in to SentFund' });
  await dialog.getByLabel('Email').fill(email);
  await dialog.getByLabel('Password').fill('12345678');
  await dialog.getByRole('button', { name: 'Sign in' }).click();
}

for (const [w, h] of [[1280, 720], [1366, 768], [1440, 900], [1920, 1080]] as const) {
  test(`landing first screen ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/');
    await settle(page);
    await page.screenshot({ path: `${OUT}/01-landing-${w}x${h}.png` });
  });
}

test('landing full page 1440', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await settle(page);
  await page.screenshot({ path: `${OUT}/02-landing-1440-fullpage.png`, fullPage: true });
});

test('landing 768', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/');
  await settle(page);
  await page.screenshot({ path: `${OUT}/03-landing-768x1024.png` });
  await page.screenshot({ path: `${OUT}/03b-landing-768-fullpage.png`, fullPage: true });
});

test('sign-in dialog', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await settle(page);
  await page.getByRole('button', { name: 'Try the demo' }).first().click();
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `${OUT}/04-sign-in-1440x900.png` });
});

for (const [email, file, url] of [
  ['maker@sentfund.my.id', '05-maker', '/maker'],
  ['app1@sentfund.my.id', '06-approver1', '/approver'],
  ['app2@sentfund.my.id', '07-approver2', '/approver'],
  ['admin@sentfund.my.id', '08-admin', '/admin'],
] as const) {
  test(`dashboard ${file}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, email);
    await page.waitForURL(`**${url}`);
    await settle(page);
    await page.screenshot({ path: `${OUT}/${file}-dashboard-1440x900.png` });
  });
}
