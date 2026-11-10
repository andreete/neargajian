/**
 * Phase 19 · recipient directory in the browser: admin page, add / edit / deactivate with the
 * change log, bulk import errors, and "Pay registered recipients only" rejecting an upload row
 * with its file row and column. No testnet transactions (the add triggers one read-only RPC check).
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { newRun, signIn } from './helpers';

const fixture = () => JSON.parse(readFileSync('.tmp/e2e/fixture.json', 'utf8')) as Record<string, string>;

function watchCsp(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|CSP/i.test(m.text())) problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push(e.message));
  return problems;
}

test('admin manages the directory: setting on, add, edit, deactivate and reactivate, every change logged', async ({ page }) => {
  const problems = watchCsp(page);
  await signIn(page, 'admin@sentfund.my.id');
  await page.waitForURL(/\/admin$/);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Recipients' }).click();
  await page.waitForURL(/\/admin\/recipients$/);
  await expect(page.getByRole('switch', { name: 'Pay registered recipients only' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('enforced by the app and the approvers, not by the vault contract')).toBeVisible();
  const table = page.getByRole('region', { name: 'Directory' });
  await expect(table.getByRole('row', { name: /Emma Clark/ })).toContainText('Sales');
  await expect(table.getByRole('row', { name: /Grace Lewis.*Operations/ }).first()).toBeVisible();
  await expect(page.getByText('1,003 recipients')).toBeVisible();

  // Search and filter (server-side, GET form).
  const filters = page.getByRole('search', { name: 'Filter recipients' });
  await filters.getByLabel('Search').fill('daniel hall');
  await filters.getByLabel('Division').selectOption('Sales');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText(/^1 recipient$/)).toBeVisible();

  // Add: validated on the server, then checked on testnet (read-only; result depends on the network).
  await page.getByRole('link', { name: 'Clear' }).click();
  await page.getByRole('button', { name: 'Add recipient' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add recipient' });
  await dialog.getByLabel('Name').fill('Olivia Stone');
  await dialog.getByLabel('Division').fill('sales');
  await dialog.getByLabel('NEAR account').fill('sentfund-e2e-olivia.testnet');
  await dialog.getByLabel('Email').fill('olivia.stone@example.com');
  await dialog.getByLabel('Phone').fill('+44 7700 900777');
  await dialog.getByLabel('Maximum per payout (tUSDC)').fill('1.5');
  await dialog.getByRole('button', { name: 'Add and check on testnet' }).click();
  await expect(dialog.getByText("The maximum is above the workflow's per-row cap of 1.00 tUSDC.")).toBeVisible();
  await dialog.getByLabel('Maximum per payout (tUSDC)').fill('0.2');
  await dialog.getByRole('button', { name: 'Add and check on testnet' }).click();
  await expect(page.getByTestId('directory-notice')).toContainText(/Added Olivia Stone \(sentfund-e2e-olivia\.testnet\): (Account not found on NEAR testnet|Could not reach NEAR testnet|Ready to receive tUSDC)/);

  // Edit (existing division spelling kept) and deactivate / reactivate; the change log names who and what.
  await filters.getByLabel('Search').fill('olivia');
  await page.getByRole('button', { name: 'Apply' }).click();
  const row = page.getByRole('region', { name: 'Directory' }).getByRole('row', { name: /Olivia Stone/ });
  await expect(row).toContainText('Sales');
  await row.getByRole('button', { name: 'Edit Olivia Stone' }).click();
  await page.getByRole('dialog', { name: 'Edit Olivia Stone' }).getByLabel('Maximum per payout (tUSDC)').fill('0.3');
  await page.getByRole('dialog', { name: 'Edit Olivia Stone' }).getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByTestId('directory-notice')).toContainText('Saved Olivia Stone.');
  const edit = page.getByRole('dialog', { name: 'Edit Olivia Stone' });
  await row.getByRole('button', { name: 'Edit Olivia Stone' }).click();
  await edit.getByRole('button', { name: 'Deactivate' }).click();
  await expect(row).toContainText('Inactive');
  await row.getByRole('button', { name: 'Edit Olivia Stone' }).click();
  await edit.getByRole('button', { name: 'Reactivate' }).click();
  await expect(page.getByTestId('directory-notice')).toContainText('Olivia Stone is now active.');
  await expect(row).not.toContainText('Inactive');
  const log = page.getByRole('region', { name: 'Change log' });
  await expect(log).toContainText('Reactivated Olivia Stone');
  await expect(log).toContainText('Deactivated Olivia Stone');
  await expect(log).toContainText('maximum 0.20 tUSDC → 0.30 tUSDC');
  await expect(log).toContainText('Adam Admin');

  // Bulk import: all-or-nothing with row and column.
  await page.getByLabel('Choose a recipient directory file').setInputFiles({ name: 'directory.csv', mimeType: 'text/csv', buffer: Buffer.from('near_account_id,receiver_name,currency,amount,mobile_phone,email,division\r\nnew-one.testnet,New One,tUSDC,0.05,+44 7700 900600,n1@example.com,Sales\r\nnew-two.testnet,New Two,tUSDC,5,+44 7700 900601,n2@example.com,\r\n') });
  const errors = page.getByTestId('directory-import-errors');
  await expect(errors).toContainText('File rejected: 2 problems');
  await expect(errors.getByRole('row', { name: /3 Amount \(maximum\)/ })).toBeVisible();
  await expect(errors.getByRole('row', { name: /3 Division Division is required/ })).toBeVisible();
  // Leave the Sales division as seeded (Emma Clark and Daniel Hall) for the other specs.
  await row.getByRole('button', { name: 'Edit Olivia Stone' }).click();
  await edit.getByRole('button', { name: 'Deactivate' }).click();
  await expect(row).toContainText('Inactive');
  expect(problems).toEqual([]);
});

test('Pay registered recipients only: an upload row outside the directory or above its maximum is rejected with row and column', async ({ page }) => {
  const problems = watchCsp(page);
  await signIn(page, 'maker@sentfund.my.id');
  await page.waitForURL(/\/maker$/);
  await newRun(page, 'Directory check', 'upload');
  await expect(page.getByTestId('directory-rule')).toContainText('Pay registered recipients only is on');
  const csv = [
    'near_account_id,receiver_name,currency,amount,mobile_phone,email',
    'recipient1.sentfund-payroll.testnet,Emma Clark,tUSDC,0.05,+44 7700 900101,emma.clark@example.com',
    'stranger.testnet,Sam Stranger,tUSDC,0.05,+44 7700 900888,sam@example.com',
    'recipient2.sentfund-payroll.testnet,Daniel Hall,tUSDC,0.35,+44 7700 900102,daniel.hall@example.com',
  ].join('\r\n');
  await page.getByLabel('Choose a payroll file').setInputFiles({ name: 'with-stranger.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  const panel = page.getByTestId('error-panel');
  await expect(panel).toContainText('File rejected: 2 problems');
  await expect(panel).toContainText('Row 3: no active recipient with this NEAR account in the recipient directory');
  await expect(panel.getByRole('row', { name: /^3 NEAR account ID No active recipient/ })).toBeVisible();
  await expect(panel.getByRole('row', { name: /^4 Amount Amount is above this recipient's maximum of 0\.30 tUSDC per payout\./ })).toBeVisible();
  await expect(panel).toContainText('Nothing was imported.');
  expect(problems).toEqual([]);
});

test('approvers see that every row matched the directory, and the assistant origin of the run', async ({ page }) => {
  await signIn(page, 'app1@sentfund.my.id');
  await page.waitForURL(/\/approver$/);
  await page.goto(`/runs/${fixture().assistantPending}`);
  await expect(page.getByTestId('directory-check')).toContainText('Every row matched the recipient directory: 2 of 2 rows matched an active recipient');
  await expect(page.getByTestId('assistant-note')).toContainText('Drafted by the payroll assistant from:');
  await expect(page.getByTestId('assistant-note')).toContainText('Create a disbursement for the Sales division, 0.04 tUSDC each, called November commissions');
  await expect(page.getByRole('button', { name: 'Approve version 1' })).toBeVisible();
});
