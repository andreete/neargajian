/**
 * Phase 23 · Payroll Advance in the browser, whole flow, against the TEST-ONLY stand-in vault
 * (playwright.standin.config.ts; nothing is sent to NEAR testnet): the employee requests with
 * consent → the maker submits → both approvers approve → paid → the next payroll shows the
 * instalment (gross 0.10, instalment 0.05, net 0.05) → paid → balance 0.25 with 5 left.
 * Phase 23b: the "25%", "50%" and "Max" shortcuts, the "Estimated" month tiles everywhere, and
 * withdrawing a request (possible while "Requested", refused once the maker has submitted it).
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { sweep, watch } from '../e2e/layout';

async function session(browser: Browser, email: string) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Sign in to SentFund' });
  await dialog.getByLabel('Email').fill(email);
  await dialog.getByLabel('Password').fill('12345678');
  await dialog.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(maker|approver|admin|employee)$/);
  return page;
}

async function approveBoth(browser: Browser, runId: string, total: RegExp) {
  for (const [email, step] of [['app1@sentfund.my.id', 1], ['app2@sentfund.my.id', 2]] as const) {
    const ap = await session(browser, email);
    await ap.goto(`/runs/${runId}`);
    await expect(ap.getByTestId('standin-note')).toBeVisible();
    await expect(ap.getByRole('heading', { name: `Your decision (step ${step})` })).toBeVisible({ timeout: 30_000 });
    await ap.getByRole('button', { name: 'Approve version 1' }).click();
    await ap.getByRole('dialog', { name: 'Approve version 1?' }).getByRole('button', { name: total }).click();
    await expect(async () => {
      await ap.reload();
      await expect(ap.locator('.timeline-list li').filter({ hasText: `(step ${step})` })).toContainText('Confirmed on NEAR', { timeout: 2000 });
    }).toPass({ timeout: 30_000 });
    await ap.context().close();
  }
}

async function waitPaid(page: Page, runId: string) {
  await page.goto(`/runs/${runId}`);
  await expect(async () => {
    await page.reload();
    await expect(page.locator('.run-head .chip').first()).toHaveText(/^Paid$/, { timeout: 2000 });
  }).toPass({ timeout: 60_000 });
}

test.describe.configure({ mode: 'serial' });

test('Payroll Advance: request with consent → maker submit → both approvals → paid; the next payroll carries the instalment', async ({ browser }) => {
  // 1. Employee: the offer, the terms and the consent.
  const emma = await session(browser, 'emma@sentfund.my.id');
  await expect(emma).toHaveURL(/\/employee$/);
  await expect(emma.getByTestId('advance-disclosure')).toContainText('Repaid like a loan');
  await expect(emma.getByTestId('advance-available')).toContainText('0.30');
  const offer = emma.getByTestId('advance-offer');
  await expect(offer.getByLabel('Amount (tUSDC)')).toHaveValue('0.30');
  await expect(offer.getByTestId('advance-receive')).toHaveText('0.294 tUSDC');
  await expect(offer.getByTestId('advance-instalment')).toContainText('0.05 tUSDC for 6 months');
  await expect(offer.getByTestId('advance-months').locator('li')).toHaveCount(6);
  await expect(offer.getByTestId('advance-months').locator('li').first()).toContainText('Estimated');
  await expect(offer.getByTestId('advance-months-note')).toContainText('which may still be this month');
  // Shortcuts: that share of the maximum (0.30), rounded down to 0.01.
  const amountField = offer.getByLabel('Amount (tUSDC)');
  const shortcuts = offer.getByRole('group', { name: 'Amount shortcuts' });
  await shortcuts.getByRole('button', { name: '25%' }).click();
  await expect(amountField).toHaveValue('0.07');
  await expect(offer.getByTestId('advance-receive')).toHaveText('0.0686 tUSDC');
  await expect(shortcuts.getByRole('button', { name: '25%' })).toHaveAttribute('aria-pressed', 'true');
  await shortcuts.getByRole('button', { name: '50%' }).click();
  await expect(amountField).toHaveValue('0.15');
  await expect(offer.getByTestId('advance-receive')).toHaveText('0.147 tUSDC');
  await shortcuts.getByRole('button', { name: 'Max' }).click();
  await expect(amountField).toHaveValue('0.30');
  await expect(shortcuts.getByRole('button', { name: '25%' })).toHaveAttribute('aria-pressed', 'false');
  const request = offer.getByRole('button', { name: 'Request 0.30 tUSDC' });
  await expect(request).toBeDisabled(); // consent not ticked yet
  await offer.getByLabel('Reason (optional)').fill('Car repair');
  await offer.getByLabel('I agree to these 6 salary deductions').check();
  await request.click();
  await expect(emma.getByTestId('advance-current').getByTestId('advance-status')).toHaveText('Requested');
  await expect(emma.getByTestId('advance-requests').getByTestId('advance-status').first()).toHaveText('Requested');
  const problems = watch(emma);

  // 2. The employee cannot open anything else.
  for (const path of ['/maker', '/approver', '/admin/recipients', '/history', '/maker/advances']) {
    const res = await emma.goto(path);
    expect(res?.status(), path).toBe(403);
  }

  // 3. Maker: the queue with the eligibility re-check, then submit.
  const maker = await session(browser, 'maker@sentfund.my.id');
  await maker.goto('/maker/advances');
  const card = maker.getByTestId('advance-request').filter({ hasText: 'Emma Clark' });
  await expect(card.getByTestId('advance-eligibility')).toContainText('Eligible');
  await expect(card.getByTestId('advance-terms')).toContainText('0.294 tUSDC');
  await expect(card.getByTestId('advance-months').locator('li')).toHaveCount(6);
  await expect(card.getByTestId('advance-months').locator('li').first()).toContainText('Estimated');
  await expect(card.getByTestId('advance-months-note')).toBeVisible();
  problems.push(...watch(maker));
  await sweep(maker, 'maker-advance-queue', '/maker/advances');
  await card.getByRole('button', { name: 'Submit for approval' }).click();
  await maker.getByRole('dialog', { name: 'Submit this Payroll Advance for approval?' }).getByRole('button', { name: 'Submit 0.294 tUSDC for approval' }).click();
  await maker.waitForURL(/\/runs\/[^/]+$/);
  const advanceRun = maker.url().split('/').pop()!;
  await expect(maker.getByRole('heading', { name: /^Payroll Advance: Emma Clark, [A-Z][a-z]+ \d{4}$/, level: 1 })).toBeVisible();
  await expect(maker.getByTestId('advance-run-note')).toBeVisible();
  // Submitted: the employee can no longer withdraw it, and is told so.
  await emma.goto('/employee');
  await expect(emma.getByTestId('advance-no-withdraw')).toContainText('can no longer be withdrawn');
  await expect(emma.getByRole('button', { name: 'Withdraw request' })).toHaveCount(0);
  const reviewer = await session(browser, 'app1@sentfund.my.id');
  problems.push(...watch(reviewer));
  await reviewer.goto(`/runs/${advanceRun}`);
  const note = reviewer.getByTestId('advance-run-note');
  await expect(note.getByTestId('advance-months').locator('li').first()).toContainText('Estimated');
  await expect(note.getByTestId('advance-months-note')).toContainText('first payroll after the advance is paid');
  await sweep(reviewer, 'approver-advance-run', `/runs/${advanceRun}`);
  await reviewer.context().close();

  // 4. Both approvers see the advance and approve; the stand-in worker pays it.
  await approveBoth(browser, advanceRun, /Approve 0\.294 tUSDC/);
  await waitPaid(maker, advanceRun);
  await emma.goto('/employee');
  await expect(emma.getByTestId('advance-balance')).toContainText('0.30');
  await expect(emma.getByTestId('advance-current').getByTestId('advance-status')).toHaveText('Paid');
  await expect(emma.getByTestId('paid-lines')).toContainText('0.294');

  // 5. The next payroll for Emma (gross 0.10) shows the instalment and commits the net pay.
  await maker.goto('/maker/runs/new');
  await maker.getByLabel('Run title').fill('November salaries');
  await maker.getByText('Upload a file').click();
  await maker.getByText('Detailed', { exact: true }).click();
  await maker.getByRole('button', { name: 'Create draft run' }).click();
  await maker.waitForURL(/\/maker\/runs\/(?!new$)[^/]+$/);
  const payrollRun = maker.url().split('/').pop()!;
  const csv = 'near_account_id,receiver_name,currency,amount,mobile_phone,email\nrecipient1.sentfund-payroll.testnet,Emma Clark,tUSDC,0.10,+44 7700 900101,emma.clark@example.com\n';
  await maker.getByLabel('Choose a payroll file').setInputFiles({ name: 'november.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(maker.getByText(/^Accepted /)).toBeVisible({ timeout: 30_000 });
  await maker.getByRole('link', { name: 'Continue to review' }).click();
  await maker.waitForURL(/\/review$/);
  const inst = maker.getByTestId('advance-instalments');
  await expect(inst).toContainText('Emma Clark');
  await expect(inst.locator('tbody tr').first()).toContainText('0.10');
  await expect(inst.locator('tbody tr').first()).toContainText('−0.05');
  await expect(maker.getByTestId('apply-instalments').getByRole('checkbox')).toBeChecked();
  await sweep(maker, 'maker-review-instalments', `/maker/runs/${payrollRun}/review`);
  await maker.getByRole('button', { name: 'Submit for approval' }).click();
  const dialog = maker.getByRole('dialog', { name: /Submit version 1 for approval/ });
  await expect(dialog).toContainText('Gross total');
  await dialog.getByRole('button', { name: 'Submit 0.05 tUSDC for approval' }).click();
  await maker.waitForURL(`**/runs/${payrollRun}`);
  await expect(maker.getByTestId('advance-instalments')).toContainText('−0.05');
  await approveBoth(browser, payrollRun, /Approve 0\.05 tUSDC/);
  await waitPaid(maker, payrollRun);

  // 6. Employee after the first instalment: 0.25 outstanding, 5 left.
  await emma.goto('/employee');
  await expect(emma.getByTestId('advance-balance')).toContainText('0.25');
  await expect(emma.getByTestId('advance-progress')).toContainText('0.05 of 0.30 tUSDC repaid');
  await expect(emma.getByTestId('advance-progress')).toContainText('5 instalments left');
  await sweep(emma, 'employee-repaying', '/employee');
  await sweep(maker, 'maker-payroll-run-instalments', `/runs/${payrollRun}`);
  await sweep(maker, 'maker-history-detailed', '/history?view=detailed');

  // 7. Company reports: kind, outstanding, reconciled.
  const admin = await session(browser, 'admin@sentfund.my.id');
  await admin.goto('/history');
  await expect(admin.getByTestId('history-outstanding')).toContainText('0.25');
  await expect(admin.getByText('Both views match')).toBeVisible();
  await expect(admin.getByTestId('history')).not.toContainText('Emma');
  await admin.goto('/admin/payroll-advance');
  await expect(admin.getByTestId('advance-outstanding')).toContainText('Emma Clark');
  problems.push(...watch(admin));
  await sweep(admin, 'admin-payroll-advance', '/admin/payroll-advance');
  await sweep(admin, 'admin-history-consolidated', '/history?view=consolidated');
  await sweep(admin, 'admin-recipients', '/admin/recipients');
  // A second employee's offer (not sent) fits too.
  const grace = await session(browser, 'grace@sentfund.my.id');
  problems.push(...watch(grace));
  await sweep(grace, 'employee-offer', '/employee');
  expect(problems).toEqual([]);
  for (const p of [emma, maker, admin, grace]) await p.context().close();
});

test('Payroll Advance: the employee withdraws a request while it is "Requested"; the maker no longer sees it; a new request is possible', async ({ browser }) => {
  const daniel = await session(browser, 'daniel@sentfund.my.id');
  const problems = watch(daniel);
  const offer = daniel.getByTestId('advance-offer');
  await offer.getByRole('group', { name: 'Amount shortcuts' }).getByRole('button', { name: '50%' }).click();
  await expect(offer.getByLabel('Amount (tUSDC)')).toHaveValue('0.15');
  await offer.getByLabel('I agree to these 6 salary deductions').check();
  await offer.getByRole('button', { name: 'Request 0.15 tUSDC' }).click();
  const current = daniel.getByTestId('advance-current');
  await expect(current.getByTestId('advance-status')).toHaveText('Requested');

  const maker = await session(browser, 'maker@sentfund.my.id');
  problems.push(...watch(maker));
  await maker.goto('/maker/advances');
  await expect(maker.getByTestId('advance-request').filter({ hasText: 'Daniel Hall' })).toBeVisible();
  await sweep(daniel, 'employee-requested', '/employee');

  // Withdraw needs a confirmation; "Keep the request" changes nothing.
  await current.getByRole('button', { name: 'Withdraw request' }).click();
  const confirm = daniel.getByRole('dialog', { name: 'Withdraw your Payroll Advance request?' });
  await expect(confirm).toContainText('0.15 tUSDC');
  await confirm.getByRole('button', { name: 'Keep the request' }).click();
  await expect(confirm).toBeHidden();
  await expect(current.getByTestId('advance-status')).toHaveText('Requested');
  await current.getByRole('button', { name: 'Withdraw request' }).click();
  await confirm.getByRole('button', { name: 'Yes, withdraw request' }).click();
  await expect(daniel.getByTestId('advance-current')).toHaveCount(0);
  await expect(daniel.getByTestId('advance-requests').getByTestId('advance-status').first()).toHaveText('Withdrawn');
  await expect(daniel.getByTestId('advance-requests')).toContainText('You withdrew this request');
  // A new request is possible right away.
  await expect(daniel.getByTestId('advance-offer')).toBeVisible();
  await expect(daniel.getByTestId('advance-available')).toContainText('0.30');

  // The maker's queue no longer has it; it is listed as handled, Withdrawn.
  await maker.reload();
  await expect(maker.getByTestId('advance-request').filter({ hasText: 'Daniel Hall' })).toHaveCount(0);
  const handled = maker.getByTestId('advance-handled').locator('tr').filter({ hasText: 'Daniel Hall' });
  await expect(handled.getByTestId('advance-status')).toHaveText('Withdrawn');
  await sweep(daniel, 'employee-withdrawn', '/employee');
  await sweep(maker, 'maker-advance-handled', '/maker/advances');
  expect(problems).toEqual([]);
  for (const p of [daniel, maker]) await p.context().close();
});
