/** Phase 20 · kill switch HOSTED_READONLY=true: banner, sign-in works, nothing can be changed. */
import { expect, test } from '@playwright/test';

test('read-only banner everywhere; sign-in and browsing work; creating a run is refused', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('readonly-banner')).toContainText('the GAJIAN team has paused this demo');
  await expect(page.getByTestId('hosted-banner')).toBeVisible();
  await page.getByRole('button', { name: 'Try the demo' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Sign in to GAJIAN' });
  await dialog.getByLabel('Email').fill('maker@gajian.my.id');
  await dialog.getByLabel('Password').fill('12345678');
  await dialog.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/maker$/);
  await expect(page.getByTestId('readonly-banner')).toBeVisible();
  await page.goto('/history?view=detailed');
  await expect(page.getByTestId('readonly-banner')).toBeVisible();
  await page.goto('/maker/runs/new');
  await page.getByLabel('Run title').fill('Paused demo');
  await page.getByRole('button', { name: 'Create draft run' }).click();
  await expect(page.locator('form.new-run').getByRole('alert')).toContainText('The hosted demo is read-only right now');
  await expect(page).toHaveURL(/\/maker\/runs\/new$/);
  // Sign-out still works.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL((u) => u.pathname === '/');
});
