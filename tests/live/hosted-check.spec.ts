/**
 * Phase 23b · READ-ONLY check of the public hosted demo after a release: NO NEAR transaction.
 *   npx playwright test -c playwright.hosted-live.config.ts tests/live/hosted-check.spec.ts
 * Health; the three employees sign in and see the Payroll Advance offer with the "25%", "50%" and
 * "Max" shortcuts and the "Estimated" months (a shortcut only fills the field; nothing is
 * requested); the admin's Payroll Advance settings are read-only; the payroll assistant previews
 * (no draft is created) and one specimen identity check runs as a dry run.
 */
import { mkdirSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { shot as shotIn } from './helpers';

const OUT = 'docs/screenshots/phase-23b';
mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => shotIn(page, name, OUT);

async function session(browser: Browser, email: string, home: RegExp) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Sign in to SentFund' });
  await dialog.getByLabel('Email').fill(email);
  await dialog.getByLabel('Password').fill('12345678');
  await dialog.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(home);
  return page;
}

test.describe.configure({ mode: 'serial' });

test('hosted (read-only): health', async ({ request }) => {
  const health = await (await request.get('/api/health')).json();
  expect(health).toMatchObject({ status: 'ok', service: 'sentfund', db: 'ok', hostedDemo: true, readOnly: false, faceModels: true });
});

for (const [email, name] of [['emma@sentfund.my.id', 'Emma Clark'], ['daniel@sentfund.my.id', 'Daniel Hall'], ['grace@sentfund.my.id', 'Grace Lewis']] as const) {
  test(`hosted (read-only): ${name} signs in and sees the offer with the shortcuts; nothing is requested`, async ({ browser }) => {
    const page = await session(browser, email, /\/employee$/);
    await expect(page.getByTestId('hosted-banner')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'My pay and Payroll Advance', level: 1 })).toBeVisible();
    await expect(page.getByText(name).first()).toBeVisible();
    await expect(page.getByTestId('advance-disclosure')).toContainText('Repaid like a loan');
    await expect(page.getByTestId('advance-available')).toContainText('0.30');
    const offer = page.getByTestId('advance-offer');
    const shortcuts = offer.getByRole('group', { name: 'Amount shortcuts' });
    await expect(shortcuts.getByRole('button')).toHaveText(['25%', '50%', 'Max']);
    await shortcuts.getByRole('button', { name: '25%' }).click(); // fills the field only
    await expect(offer.getByLabel('Amount (tUSDC)')).toHaveValue('0.07');
    await shortcuts.getByRole('button', { name: '50%' }).click();
    await expect(offer.getByLabel('Amount (tUSDC)')).toHaveValue('0.15');
    await shortcuts.getByRole('button', { name: 'Max' }).click();
    await expect(offer.getByLabel('Amount (tUSDC)')).toHaveValue('0.30');
    await expect(offer.getByTestId('advance-months').locator('li')).toHaveCount(6);
    await expect(offer.getByTestId('advance-months').locator('li').first()).toContainText('Estimated');
    await expect(offer.getByTestId('advance-months-note')).toContainText('which may still be this month');
    await expect(offer.getByRole('button', { name: 'Request 0.30 tUSDC' })).toBeDisabled(); // consent never ticked
    if (name === 'Emma Clark') {
      await shortcuts.getByRole('button', { name: '50%' }).click();
      await offer.scrollIntoViewIfNeeded();
      await shot(page, '01-hosted-employee-offer-shortcuts');
    }
    await page.context().close();
  });
}

test('hosted (read-only): the admin Payroll Advance settings are read-only', async ({ browser }) => {
  const admin = await session(browser, 'admin@sentfund.my.id', /\/admin$/);
  await admin.goto('/admin/payroll-advance');
  await expect(admin.getByTestId('advance-policy-read-only')).toBeVisible();
  await expect(admin.getByRole('button', { name: 'Save policy' })).toHaveCount(0);
  await expect(admin.getByRole('switch', { name: 'Offer Payroll Advance' })).toBeDisabled();
  await shot(admin, '02-hosted-admin-payroll-advance-read-only');
  await admin.context().close();
});

test('hosted (read-only): assistant preview (no draft created) and a specimen identity dry run', async ({ browser }) => {
  test.setTimeout(180_000);
  const maker = await session(browser, 'maker@sentfund.my.id', /\/maker$/);
  await maker.goto('/maker/runs/new');
  await expect(maker.getByTestId('assistant-off')).toHaveCount(0);
  const box = maker.getByTestId('payroll-assistant');
  await box.getByRole('textbox').fill('Create a disbursement for the Sales division, 0.03 tUSDC each, called November commissions');
  await box.getByRole('button', { name: /^(Send|Answer)$/ }).click();
  const preview = maker.getByTestId('assistant-preview');
  await expect(preview).toBeVisible({ timeout: 90_000 });
  await expect(preview).toContainText('Sales division, 2 recipients, 0.03 tUSDC each, total 0.06 tUSDC');
  await maker.context().close(); // "Create draft" is never clicked

  const admin = await session(browser, 'admin@sentfund.my.id', /\/admin$/);
  await admin.goto('/admin/identity');
  const demo = admin.getByTestId('specimen-demo');
  await demo.getByTestId('specimen-emma').click();
  const result = demo.getByTestId('identity-result');
  await expect(result).toHaveAttribute('data-outcome', /verified|needs_review|failed/, { timeout: 90_000 });
  await expect(result.getByTestId('identity-dry-run')).toBeVisible();
  await expect(result).toHaveAttribute('data-outcome', 'verified');
  await admin.context().close();
});
