import { expect, test } from '@playwright/test';

async function signInLocal(page: import('@playwright/test').Page, email: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Sign in to GAJIAN' });
  await dialog.getByLabel('Email').fill(email);
  await dialog.getByLabel('Password').fill('12345678');
  await dialog.getByRole('button', { name: 'Sign in' }).click();
}

test('maker builds a manual run, sees inline errors and keeps only the valid rows after confirming', async ({ page }) => {
  await signInLocal(page, 'maker@gajian.my.id');
  await page.waitForURL('**/maker');
  await page.getByRole('link', { name: 'New run' }).first().click();
  await page.getByLabel('Run title').fill('E2E manual run');
  await page.getByText('Enter rows manually').click();
  await page.getByText('Detailed', { exact: true }).click();
  await page.getByRole('button', { name: 'Create draft run' }).click();
  await page.waitForURL(/\/maker\/runs\/(?!new$)[^/]+$/);

  const fill = async (row: number, values: string[]) => {
    const labels = ['NEAR account ID', 'Receiver name', 'Amount', 'Mobile phone', 'Email'];
    for (const [i, label] of labels.entries()) await page.getByLabel(`Row ${row} ${label}`).fill(values[i] ?? '');
    await page.getByLabel(`Row ${row} Email`).blur();
  };
  await fill(1, ['recipient1.gajian-payroll.testnet', 'Emma Clark', '0.05', '+44 7700 900101', 'emma@example.com']);
  await page.getByRole('button', { name: 'Add row' }).click();
  await fill(2, ['Not A Wallet', 'Daniel Hall', '0.07', '+44 7700 900102', 'daniel@example.com']);
  await expect(page.getByTestId('row-2').getByText('Invalid NEAR account ID.')).toBeVisible();
  await expect(page.locator('.summary-bar .facts')).toContainText('1 valid');
  await expect(page.locator('.summary-bar .facts')).toContainText('1 with errors');
  await expect(page.getByTestId('posting-preview-detailed')).toContainText('1 company entry for 1 recipient');

  await page.getByRole('button', { name: 'Continue with 1 valid row' }).click();
  const dialog = page.getByRole('dialog', { name: 'Keep only the valid rows?' });
  await expect(dialog).toContainText('Rows to remove: 2');
  await dialog.getByRole('button', { name: 'Remove 1 row and keep 1' }).click();
  await expect(page.getByText('Removed 1 invalid row')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Row 1 Amount')).toHaveValue('0.05');
  await expect(page.getByLabel('Row 2 Amount')).toHaveCount(0);
});

test('builder fits the container at 1280x720 and 1440x900: full account IDs, remove buttons inside', async ({ page }) => {
  await signInLocal(page, 'maker@gajian.my.id');
  await page.waitForURL('**/maker');
  await page.goto('/maker/runs/new');
  await page.getByLabel('Run title').fill('Fit check');
  await page.getByText('Enter rows manually').click();
  await page.getByRole('button', { name: 'Create draft run' }).click();
  await page.waitForURL(/\/maker\/runs\/(?!new$)[^/]+$/);
  await page.getByLabel('Row 1 NEAR account ID').fill('recipient1.gajian-payroll.testnet');
  await page.getByLabel('Row 1 Email').fill('emma.clark@example.com');
  for (const [width, height] of [[1280, 720], [1440, 900]] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.fonts.ready);
    const account = page.getByLabel('Row 1 NEAR account ID');
    const fits = await account.evaluate((el: HTMLInputElement) => el.scrollWidth <= el.clientWidth);
    expect(fits, `${width}: account ID fully visible`).toBe(true);
    const card = await page.locator('section[aria-labelledby="rows-title"]').boundingBox();
    const remove = await page.getByRole('button', { name: 'Remove row 1' }).boundingBox();
    expect(card && remove, `${width}`).toBeTruthy();
    expect(remove!.x + remove!.width, `${width}: remove button inside the card`).toBeLessThanOrEqual(card!.x + card!.width);
    expect(card!.x + card!.width, `${width}: card inside the viewport gutter`).toBeLessThanOrEqual(width - 48);
    const noScroll = await page.locator('section[aria-labelledby="rows-title"] .table-wrap').evaluate((el) => el.scrollWidth <= el.clientWidth);
    expect(noScroll, `${width}: table needs no horizontal scroll`).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
