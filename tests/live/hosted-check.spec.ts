/**
 * Phase 25 (from 23b, 24) · READ-ONLY check of the public hosted demo after a release: NO NEAR
 * transaction and no camera (headless browser without a camera device). Phase 25: "Fill" on each
 * of the seven demo accounts fills both sign-in fields without signing in; one sign-in (app2) works.
 * Phase 24: each employee
 * sees "Verify it's you" (no way to request without it); for Emma the camera panel opens with the
 * notice and, without a camera, explains how to allow one (no challenge is issued, nothing sent);
 * the camera is allowed only on the employee page (Permissions-Policy).
 *   npx playwright test -c playwright.hosted-live.config.ts tests/live/hosted-check.spec.ts
 * Health; the three employees sign in and see the Payroll Advance offer with the "25%", "50%" and
 * "Max" shortcuts and the "Estimated" months (a shortcut only fills the field; nothing is
 * requested); the admin's Payroll Advance settings are read-only; the payroll assistant previews
 * (no draft is created) and one specimen identity check runs as a dry run.
 */
import { mkdirSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { shot as shotIn } from './helpers';

const OUT = 'docs/screenshots/phase-25'; // Phase 24's shots stay in phase-24/
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

const DEMO_ACCOUNTS: ReadonlyArray<readonly [string, string]> = [
  ['maker@sentfund.my.id', 'Maker · Maya Maker'], ['app1@sentfund.my.id', 'Approver 1 · Alex Approver'],
  ['app2@sentfund.my.id', 'Approver 2 · Riley Reviewer'], ['admin@sentfund.my.id', 'Admin · Adam Admin'],
  ['emma@sentfund.my.id', 'Employee · Emma Clark'], ['daniel@sentfund.my.id', 'Employee · Daniel Hall'],
  ['grace@sentfund.my.id', 'Employee · Grace Lewis'],
];

test('hosted (read-only): Fill on each of the seven demo accounts fills both fields without signing in; Sign in as app2 works', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Sign in to SentFund' });
  const rows = dialog.getByRole('region', { name: 'Demo accounts' }).getByRole('listitem');
  await expect(rows).toHaveCount(DEMO_ACCOUNTS.length);
  const signIn = dialog.getByRole('button', { name: 'Sign in', exact: true });
  for (const [i, [email, who]] of DEMO_ACCOUNTS.entries()) {
    await expect(rows.nth(i)).toContainText(who);
    await dialog.getByRole('button', { name: `Fill ${email}`, exact: true }).click();
    await expect(dialog.getByLabel('Email')).toHaveValue(email);
    await expect(dialog.getByLabel('Password')).toHaveValue('12345678');
    await expect(rows.nth(i)).toHaveAttribute('aria-current', 'true');
    await expect(signIn).toBeFocused();
    expect(new URL(page.url()).pathname).toBe('/');
  }
  await expect(dialog).toBeVisible(); // Fill never signs in
  await dialog.getByRole('button', { name: 'Fill app2@sentfund.my.id' }).click();
  await shot(page, '00-signin-fill-app2');
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/approver$/);
  await expect(page.getByRole('banner').getByText('Riley Reviewer')).toBeVisible();
  await ctx.close();
});

const EMPLOYEES = [['emma@sentfund.my.id', 'Emma Clark'], ['daniel@sentfund.my.id', 'Daniel Hall'], ['grace@sentfund.my.id', 'Grace Lewis']] as const;
/** The first employee without an open request (found by the offer tests) gets the camera-notice check. */
let cameraEmployee: readonly [string, string] | null = null;

for (const [email, name] of EMPLOYEES) {
  test(`hosted (read-only): ${name} signs in; the offer with the shortcuts and "Verify it's you", or the open request; nothing is requested`, async ({ browser }) => {
    const page = await session(browser, email, /\/employee$/);
    await expect(page.getByTestId('hosted-banner')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'My pay and Payroll Advance', level: 1 })).toBeVisible();
    await expect(page.getByText(name).first()).toBeVisible();
    await expect(page.getByTestId('advance-disclosure')).toContainText('Repaid like a loan');
    // Shared demo data: a visitor may have an open request (one at a time). Then the request is shown instead of the offer.
    if (await page.getByTestId('advance-current').count()) {
      await expect(page.getByTestId('advance-offer')).toHaveCount(0);
      await expect(page.getByTestId('advance-current').getByTestId('advance-status')).toBeVisible();
      test.info().annotations.push({ type: 'note', description: `${name} has an open request (${await page.getByTestId('advance-current').getByTestId('advance-status').innerText()}): offer not shown` });
      await page.context().close();
      return;
    }
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
    // Phase 24: only "Verify it's you" (disabled until the consent is ticked), and a face template is on file.
    await expect(offer.getByRole('button', { name: "Verify it's you" })).toBeDisabled();
    await expect(offer.getByRole('button', { name: /^Request/ })).toHaveCount(0);
    await expect(offer.getByTestId('face-blocker')).toHaveCount(0);
    cameraEmployee ??= [email, name];
    await page.context().close();
  });
}

test('hosted (read-only): "Verify it\'s you" opens the camera panel with the notice; without a camera it explains how to allow it; nothing is sent', async ({ browser }) => {
  test.skip(!cameraEmployee, 'every demo employee has an open request right now');
  const [email] = cameraEmployee!;
  const page = await session(browser, email, /\/employee$/);
  const offer = page.getByTestId('advance-offer');
  await offer.getByRole('group', { name: 'Amount shortcuts' }).getByRole('button', { name: '50%' }).click();
  await offer.scrollIntoViewIfNeeded();
  await shot(page, '01-hosted-employee-offer-verify-button');
  const sent: string[] = [];
  page.on('request', (r) => { if (r.method() !== 'GET') sent.push(r.url()); });
  await offer.getByLabel('I agree to these 6 salary deductions').check();
  await offer.getByRole('button', { name: "Verify it's you" }).click();
  const fc = page.getByTestId('face-check');
  await expect(fc.getByTestId('face-notice')).toContainText('Camera images are processed in memory on the SentFund server and never stored');
  await expect(fc.getByTestId('face-notice')).toContainText('shown to the payroll maker and the approvers');
  await expect(fc.getByTestId('face-standin')).toHaveCount(0); // no stand-in online
  await expect(fc.getByTestId('face-camera-help')).toContainText('The request cannot be sent without the face check.');
  await fc.scrollIntoViewIfNeeded();
  await shot(page, '02-hosted-employee-verify-notice-no-camera');
  await fc.getByRole('button', { name: 'Cancel' }).click();
  expect(sent).toEqual([]); // no challenge, no frames, no request
  await page.context().close();
});

test('hosted (read-only): the maker sees the face check line on every open request (a request from before Phase 24 cannot be submitted)', async ({ browser }) => {
  const maker = await session(browser, 'maker@sentfund.my.id', /\/maker$/);
  await maker.goto('/maker/advances');
  const cards = maker.getByTestId('advance-request');
  const n = await cards.count();
  for (let i = 0; i < n; i++) {
    const note = cards.nth(i).getByTestId('face-check-note');
    await expect(note).toBeVisible();
    if ((await note.innerText()).startsWith('No face check')) await expect(cards.nth(i).getByRole('button', { name: 'Submit for approval' })).toBeDisabled();
  }
  if (n) { await cards.first().scrollIntoViewIfNeeded(); await shot(maker, '04-hosted-maker-request-face-line'); }
  test.info().annotations.push({ type: 'note', description: `${n} open request(s) in the maker's queue` });
  await maker.context().close();
});

test('hosted (read-only): the camera is allowed only on the employee page (Permissions-Policy)', async ({ request }) => {
  expect((await request.get('/employee', { maxRedirects: 0 })).headers()['permissions-policy']).toBe('camera=(self), microphone=(self), geolocation=(), payment=(), usb=()');
  for (const path of ['/', '/maker', '/approver', '/admin', '/admin/identity', '/history', '/api/health']) {
    expect((await request.get(path, { maxRedirects: 0 })).headers()['permissions-policy'], path).toBe('camera=(), microphone=(self), geolocation=(), payment=(), usb=()');
  }
});

test('hosted (read-only): the admin Payroll Advance settings are read-only', async ({ browser }) => {
  const admin = await session(browser, 'admin@sentfund.my.id', /\/admin$/);
  await admin.goto('/admin/payroll-advance');
  await expect(admin.getByTestId('advance-policy-read-only')).toBeVisible();
  await expect(admin.getByRole('button', { name: 'Save policy' })).toHaveCount(0);
  await expect(admin.getByRole('switch', { name: 'Offer Payroll Advance' })).toBeDisabled();
  await shot(admin, '03-hosted-admin-payroll-advance-read-only');
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
