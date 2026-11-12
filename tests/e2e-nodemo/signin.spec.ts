import { expect, test } from '@playwright/test';

/** Phase 25: with DEMO_MODE off there is no "Demo accounts" box and no Fill button; typing still signs in. */
test('demo mode off: the sign-in dialog has no demo accounts box and no Fill buttons', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /Content Security Policy|Refused to/i.test(msg.text())) problems.push(msg.text());
  });
  page.on('pageerror', (err) => problems.push(err.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Sign in to SentFund' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Email')).toBeFocused();
  await expect(dialog.getByText('Demo accounts')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /^Fill / })).toHaveCount(0);
  await expect(dialog.locator('.demo-accounts')).toHaveCount(0);
  await expect(dialog).not.toContainText('12345678');
  await expect(dialog).not.toContainText('@sentfund.my.id');
  expect(await page.content()).not.toContain('app1@sentfund.my.id');
  // The ordinary sign-in still works (the user types the credentials).
  await dialog.getByLabel('Email').fill('app2@sentfund.my.id');
  await dialog.getByLabel('Password').fill('12345678');
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/approver');
  await expect(page.getByRole('banner').getByText('Riley Reviewer')).toBeVisible();
  expect(problems).toEqual([]);
});
