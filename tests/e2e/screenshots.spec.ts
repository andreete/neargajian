/**
 * Design-review screenshots (Phase 06): 1440x900 landing, login modal and the four role
 * dashboards, plus the landing page at 768 px wide. Output: docs/screenshots/phase-06/.
 */
import { mkdirSync } from 'node:fs';
import { test, type Page } from '@playwright/test';

const OUT = 'docs/screenshots/phase-06';
mkdirSync(OUT, { recursive: true });

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
}

async function signInAs(page: Page, role: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Sign in to GAJIAN' });
  await dialog.getByText(role, { exact: true }).click();
  await dialog.getByRole('button', { name: 'Sign in' }).click();
}

test.describe('desktop 1440x900', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('landing', async ({ page }) => {
    await page.goto('/');
    await settle(page);
    await page.screenshot({ path: `${OUT}/01-landing-1440x900.png` });
    await page.screenshot({ path: `${OUT}/01b-landing-1440-fullpage.png`, fullPage: true });
  });

  test('login modal', async ({ page }) => {
    await page.goto('/');
    await settle(page);
    await page.getByRole('button', { name: 'Try the demo' }).first().click();
    await page.getByRole('dialog').getByText('Maker', { exact: true }).click();
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `${OUT}/02-login-modal-1440x900.png` });
  });

  for (const [role, file, url] of [
    ['Maker', '03-maker-dashboard', '/maker'],
    ['Approver 1', '04-approver1-dashboard', '/approver'],
    ['Approver 2', '05-approver2-dashboard', '/approver'],
    ['Admin', '06-admin-dashboard', '/admin'],
  ] as const) {
    test(`${role} dashboard`, async ({ page }) => {
      await signInAs(page, role);
      await page.waitForURL(`**${url}`);
      await settle(page);
      await page.screenshot({ path: `${OUT}/${file}-1440x900.png` });
    });
  }
});

test.describe('tablet 768 wide', () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test('landing at 768', async ({ page }) => {
    await page.goto('/');
    await settle(page);
    await page.screenshot({ path: `${OUT}/07-landing-768x1024.png` });
    await page.screenshot({ path: `${OUT}/07b-landing-768-fullpage.png`, fullPage: true });
  });
});
