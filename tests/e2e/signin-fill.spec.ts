import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 25: the sign-in dialog's "Demo accounts" box (demo mode) has one row per demo sign-in
 * with a "Fill" button. Fill puts the email and the demo password into the fields, never signs
 * in by itself, marks the row, clears an earlier error and moves the focus to "Sign in".
 * The box is absent with demo mode off: tests/e2e-nodemo/signin.spec.ts.
 */
const ACCOUNTS: ReadonlyArray<readonly [string, string]> = [
  ['maker@sentfund.my.id', 'Maker · Maya Maker'],
  ['app1@sentfund.my.id', 'Approver 1 · Alex Approver'],
  ['app2@sentfund.my.id', 'Approver 2 · Riley Reviewer'],
  ['admin@sentfund.my.id', 'Admin · Adam Admin'],
  ['emma@sentfund.my.id', 'Employee · Emma Clark'],
  ['daniel@sentfund.my.id', 'Employee · Daniel Hall'],
  ['grace@sentfund.my.id', 'Employee · Grace Lewis'],
];

function watchConsole(page: Page) {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /Content Security Policy|Refused to/i.test(msg.text())) problems.push(msg.text());
  });
  page.on('pageerror', (err) => problems.push(err.message));
  return problems;
}

async function openDialog(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Sign in to SentFund' });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Still signed out: the approver dashboard redirects to sign-in (same cookies as the page). */
async function expectSignedOut(page: Page) {
  const res = await page.request.get('/approver', { maxRedirects: 0 });
  expect(res.status()).toBeGreaterThanOrEqual(300);
  expect(res.status()).toBeLessThan(400);
  expect(res.headers().location ?? '').toContain('signin=required');
}

test('Fill on app1 fills both fields without signing in; Fill on app2 replaces them; Sign in lands on approver 2', async ({ page }) => {
  const problems = watchConsole(page);
  const dialog = await openDialog(page);
  const box = dialog.getByRole('region', { name: 'Demo accounts' });
  const email = dialog.getByLabel('Email');
  const password = dialog.getByLabel('Password');
  const signIn = dialog.getByRole('button', { name: 'Sign in', exact: true });

  // Seven rows in the agreed order, each with the role and the name and a labelled Fill button.
  const rows = box.getByRole('listitem');
  await expect(rows).toHaveCount(ACCOUNTS.length);
  for (const [i, [address, who]] of ACCOUNTS.entries()) {
    await expect(rows.nth(i)).toContainText(address);
    await expect(rows.nth(i)).toContainText(who);
    await expect(rows.nth(i).getByRole('button', { name: `Fill ${address}`, exact: true })).toBeVisible();
  }

  // An earlier error message is cleared by Fill.
  await email.fill('nobody@sentfund.my.id');
  await password.fill('not-the-password');
  await signIn.click();
  await expect(dialog.getByRole('alert')).toHaveText('Email or password is incorrect.');

  await dialog.getByRole('button', { name: 'Fill app1@sentfund.my.id' }).click();
  await expect(email).toHaveValue('app1@sentfund.my.id');
  await expect(password).toHaveValue('12345678');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(signIn).toBeFocused();
  await expect(rows.nth(1)).toHaveAttribute('aria-current', 'true');
  await expect(dialog.getByRole('button', { name: 'Fill app1@sentfund.my.id' })).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(500);
  await expect(dialog).toBeVisible(); // never signs in by itself
  expect(new URL(page.url()).pathname).toBe('/');
  await expectSignedOut(page);

  // Fill on another row replaces both values (even an edited password) and moves the selection.
  await password.fill('changed');
  await expect(rows.nth(1)).not.toHaveAttribute('aria-current', 'true');
  await dialog.getByRole('button', { name: 'Fill app2@sentfund.my.id' }).click();
  await expect(email).toHaveValue('app2@sentfund.my.id');
  await expect(password).toHaveValue('12345678');
  await expect(rows.nth(2)).toHaveAttribute('aria-current', 'true');
  await expect(box.locator('li[aria-current="true"]')).toHaveCount(1);
  await expect(signIn).toBeFocused();
  await expectSignedOut(page);

  // Enter on the focused "Sign in" button signs in as approver 2.
  await page.keyboard.press('Enter');
  await page.waitForURL('**/approver');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Review queue');
  await expect(page.getByRole('banner').getByText('Riley Reviewer')).toBeVisible();
  expect(problems).toEqual([]);
});

test('Fill works from the keyboard with a visible focus outline; every row fills its own account', async ({ page }) => {
  const problems = watchConsole(page);
  const dialog = await openDialog(page);
  const signIn = dialog.getByRole('button', { name: 'Sign in', exact: true });
  // From "Sign in", Tab reaches the first Fill button (maker).
  await signIn.focus();
  await page.keyboard.press('Tab');
  const makerFill = dialog.getByRole('button', { name: 'Fill maker@sentfund.my.id' });
  await expect(makerFill).toBeFocused();
  const outline = await makerFill.evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
  });
  expect(outline.style).not.toBe('none');
  expect(outline.width).toBeGreaterThanOrEqual(2);
  await page.keyboard.press('Space');
  await expect(dialog.getByLabel('Email')).toHaveValue('maker@sentfund.my.id');
  await expect(signIn).toBeFocused();

  for (const [address] of ACCOUNTS) {
    const fill = dialog.getByRole('button', { name: `Fill ${address}`, exact: true });
    await fill.focus();
    await page.keyboard.press('Enter');
    await expect(dialog.getByLabel('Email')).toHaveValue(address);
    await expect(dialog.getByLabel('Password')).toHaveValue('12345678');
    await expect(signIn).toBeFocused();
  }
  await expect(dialog).toBeVisible();
  await expectSignedOut(page);
  expect(problems).toEqual([]);
});

for (const size of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`sign-in dialog with the Fill rows is tidy at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    const dialog = await openDialog(page);
    const fit = await dialog.evaluate((d) => ({
      scrollW: d.scrollWidth, clientW: d.clientWidth, scrollH: d.scrollHeight, clientH: d.clientHeight,
      left: d.getBoundingClientRect().left, right: d.getBoundingClientRect().right, bottom: d.getBoundingClientRect().bottom,
    }));
    expect(fit.scrollW).toBeLessThanOrEqual(fit.clientW); // no sideways scroll inside the dialog
    expect(fit.right).toBeLessThanOrEqual(size.width);
    expect(fit.left).toBeGreaterThanOrEqual(0); // (the landing page behind it is a separate matter: NEXT-STEPS)
    if (size.width >= 1280) {
      expect(fit.scrollH).toBeLessThanOrEqual(fit.clientH); // whole dialog visible, no inner scroll
      expect(fit.bottom).toBeLessThanOrEqual(size.height);
    }
    // Every Fill button is inside the dialog's width and keeps its label on one line.
    for (const [address] of ACCOUNTS) {
      const b = await dialog.getByRole('button', { name: `Fill ${address}`, exact: true }).boundingBox();
      expect(b).not.toBeNull();
      expect((b?.x ?? 0) + (b?.width ?? 0)).toBeLessThanOrEqual(fit.right);
      expect(b?.height ?? 0).toBeLessThan(40);
    }
    if (process.env.SCREENSHOTS_P25 === '1') {
      await page.screenshot({ path: `docs/screenshots/phase-25/signin-${size.width}x${size.height}.png` });
      if (size.width === 1280) {
        await dialog.getByRole('button', { name: 'Fill app2@sentfund.my.id' }).click();
        await page.screenshot({ path: 'docs/screenshots/phase-25/signin-1280x720-filled-app2.png' });
      }
    }
  });
}
