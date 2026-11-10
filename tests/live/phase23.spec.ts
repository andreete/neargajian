/**
 * Phase 23 · LIVE Payroll Advance on NEAR testnet through the local app (server + release worker on
 * 127.0.0.1:8092 with the real demo database). SENDS REAL TESTNET TRANSACTIONS. One step at a time:
 *   nice -n 19 npx playwright test -c playwright.live.config.ts tests/live/phase23.spec.ts --grep p23-advance
 *   nice -n 19 npx playwright test -c playwright.live.config.ts tests/live/phase23.spec.ts --grep p23-payroll
 *   p23-advance  Emma takes 0.30 (fee 0.006, receives 0.294) with consent; the maker submits; both
 *                approvers approve in the browser; the vault pays 0.294.
 *   p23-payroll  A payroll run for Emma with gross 0.10 shows the 0.05 instalment and net 0.05; both
 *                approve; paid; her balance becomes 0.25 with 5 instalments left.
 * Screenshots (1440x900): docs/screenshots/phase-23/. Run IDs: .tmp/live-exports/p23-runs.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { shot as shotIn } from './helpers';

const OUT = 'docs/screenshots/phase-23';
mkdirSync(OUT, { recursive: true });
mkdirSync('.tmp/live-exports', { recursive: true });
const shot = (page: Page, name: string) => shotIn(page, name, OUT);
const EXPORT = '.tmp/live-exports/p23-runs.json';
const saved = (): Record<string, string> => (existsSync(EXPORT) ? JSON.parse(readFileSync(EXPORT, 'utf8')) as Record<string, string> : {});
const save = (k: string, v: string) => writeFileSync(EXPORT, JSON.stringify({ ...saved(), [k]: v }, null, 2));

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

async function approveBoth(browser: Browser, runId: string, total: RegExp, onFirst?: (p: Page) => Promise<void>) {
  for (const [email, step] of [['app1@sentfund.my.id', 1], ['app2@sentfund.my.id', 2]] as const) {
    const ap = await session(browser, email);
    await ap.goto(`/runs/${runId}`);
    await expect(ap.getByRole('heading', { name: `Your decision (step ${step})` })).toBeVisible({ timeout: 120_000 });
    if (step === 1 && onFirst) await onFirst(ap);
    await ap.getByRole('button', { name: 'Approve version 1' }).click();
    await ap.getByRole('dialog', { name: 'Approve version 1?' }).getByRole('button', { name: total }).click();
    await expect(async () => {
      await ap.reload();
      await expect(ap.locator('.timeline-list li').filter({ hasText: `(step ${step})` })).toContainText('Confirmed on NEAR', { timeout: 3000 });
    }).toPass({ timeout: 180_000 });
    await ap.context().close();
  }
}

async function waitPaid(page: Page, runId: string, rows: string) {
  await page.goto(`/runs/${runId}`);
  await expect(page.locator('.run-head .chip').first()).toHaveText(/^Paid$/, { timeout: 480_000 });
  await expect(page.locator('.stat').filter({ hasText: /^Paid/ }).locator('.value')).toHaveText(rows);
}

test.describe.configure({ mode: 'serial' });

test('p23-advance: Emma takes 0.30 with consent, the maker submits, both approve, the vault pays 0.294', async ({ browser }) => {
  test.setTimeout(900_000);
  const emma = await session(browser, 'emma@sentfund.my.id');
  await expect(emma).toHaveURL(/\/employee$/);
  const offer = emma.getByTestId('advance-offer');
  await expect(offer.getByLabel('Amount (tUSDC)')).toHaveValue('0.30');
  await expect(offer.getByTestId('advance-receive')).toHaveText('0.294 tUSDC');
  await offer.getByLabel('Reason (optional)').fill('Car repair');
  await offer.getByLabel('I agree to these 6 salary deductions').check();
  await emma.evaluate(() => { document.getElementById('offer-h')?.scrollIntoView({ block: 'start', behavior: 'instant' }); window.scrollBy({ top: -88, behavior: 'instant' }); });
  await shot(emma, '01-employee-offer-with-consent');
  await offer.getByRole('button', { name: 'Request 0.30 tUSDC' }).click();
  await expect(emma.getByTestId('advance-current').getByTestId('advance-status')).toHaveText('Requested');

  const maker = await session(browser, 'maker@sentfund.my.id');
  await maker.goto('/maker/advances');
  const card = maker.getByTestId('advance-request').filter({ hasText: 'Emma Clark' });
  await expect(card.getByTestId('advance-eligibility')).toContainText('Eligible');
  await maker.evaluate(() => window.scrollTo(0, 0));
  await shot(maker, '02-maker-advance-queue');
  await card.getByRole('button', { name: 'Submit for approval' }).click();
  await maker.getByRole('dialog', { name: 'Submit this Payroll Advance for approval?' }).getByRole('button', { name: 'Submit 0.294 tUSDC for approval' }).click();
  await maker.waitForURL(/\/runs\/[^/]+$/, { timeout: 120_000 });
  const runId = maker.url().split('/').pop()!;
  await expect(maker.locator('.run-head .chip').first()).toHaveText(/Awaiting approval/, { timeout: 120_000 });
  save('advanceRunId', runId);
  save('advanceChainRunId', (await maker.locator('.run-sub .mono').first().textContent())!.trim());

  await approveBoth(browser, runId, /Approve 0\.294 tUSDC/, async (ap) => {
    await expect(ap.getByTestId('advance-run-note')).toContainText('repaid like a loan');
    await expect(ap.getByTestId('advance-run-note').getByTestId('advance-eligibility')).toContainText('Eligible');
    await ap.evaluate(() => window.scrollTo(0, 0));
    await shot(ap, '03-approver-advance-view');
  });
  await waitPaid(maker, runId, '1 of 1');
  await maker.evaluate(() => window.scrollTo(0, 0));
  await shot(maker, '04-advance-paid');
  await emma.goto('/employee');
  await expect(emma.getByTestId('advance-current').getByTestId('advance-status')).toHaveText('Paid');
  await expect(emma.getByTestId('advance-balance')).toContainText('0.30');
  for (const p of [emma, maker]) await p.context().close();
});

test('p23-payroll: a payroll run for Emma with gross 0.10 carries the 0.05 instalment (net 0.05); paid; balance 0.25 with 5 left', async ({ browser }) => {
  test.setTimeout(900_000);
  const maker = await session(browser, 'maker@sentfund.my.id');
  await maker.goto('/maker/runs/new');
  await maker.getByLabel('Run title').fill('Phase 23: November salary, Emma Clark');
  await maker.getByText('Upload a file').click();
  await maker.getByText('Detailed', { exact: true }).click();
  await maker.getByRole('button', { name: 'Create draft run' }).click();
  await maker.waitForURL(/\/maker\/runs\/(?!new$)[^/]+$/);
  const runId = maker.url().split('/').pop()!;
  const csv = 'near_account_id,receiver_name,currency,amount,mobile_phone,email\nrecipient1.sentfund-payroll.testnet,Emma Clark,tUSDC,0.10,+44 7700 900101,emma.clark@example.com\n';
  await maker.getByLabel('Choose a payroll file').setInputFiles({ name: 'p23-november-salary.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(maker.getByText(/^Accepted /)).toBeVisible({ timeout: 30_000 });
  await maker.getByRole('link', { name: 'Continue to review' }).click();
  await maker.waitForURL(/\/review$/);
  const inst = maker.getByTestId('advance-instalments');
  await expect(inst.locator('tbody tr').first()).toContainText('0.10');
  await expect(inst.locator('tbody tr').first()).toContainText('−0.05');
  await expect(maker.getByTestId('apply-instalments').getByRole('checkbox')).toBeChecked();
  await maker.evaluate(() => { document.getElementById('instalments-h')?.scrollIntoView({ block: 'start', behavior: 'instant' }); window.scrollBy({ top: -88, behavior: 'instant' }); });
  await shot(maker, '05a-payroll-review');
  await maker.getByRole('button', { name: 'Submit for approval' }).click();
  await maker.getByRole('dialog', { name: /Submit version 1 for approval/ }).getByRole('button', { name: 'Submit 0.05 tUSDC for approval' }).click();
  await maker.waitForURL(`**/runs/${runId}`, { timeout: 120_000 });
  await expect(maker.locator('.run-head .chip').first()).toHaveText(/Awaiting approval/, { timeout: 120_000 });
  save('payrollRunId', runId);
  save('payrollChainRunId', (await maker.locator('.run-sub .mono').first().textContent())!.trim());
  await approveBoth(browser, runId, /Approve 0\.05 tUSDC/);
  await waitPaid(maker, runId, '1 of 1');
  await expect(maker.getByTestId('advance-instalments')).toContainText('−0.05');

  const emma = await session(browser, 'emma@sentfund.my.id');
  await expect(emma.getByTestId('advance-balance')).toContainText('0.25');
  await expect(emma.getByTestId('advance-progress')).toContainText('0.05 of 0.30 tUSDC repaid');
  await expect(emma.getByTestId('advance-progress')).toContainText('5 instalments left');
  await emma.evaluate(() => { document.getElementById('current-h')?.scrollIntoView({ block: 'start', behavior: 'instant' }); window.scrollBy({ top: -88, behavior: 'instant' }); });
  await shot(emma, '06-employee-after-first-instalment');
  for (const p of [emma, maker]) await p.context().close();
});

// Read-only recapture of the offer with the final layout (no request is sent): Daniel's offer with the
// consent ticked. Emma's own offer is gone once her advance is outstanding (one at a time).
test('p23-offer-shot: the offer and the consent (Daniel, nothing sent)', async ({ browser }) => {
  const daniel = await session(browser, 'daniel@sentfund.my.id');
  const offer = daniel.getByTestId('advance-offer');
  await expect(offer.getByTestId('advance-receive')).toHaveText('0.294 tUSDC');
  await offer.getByLabel('I agree to these 6 salary deductions').check();
  await daniel.evaluate(() => { document.getElementById('offer-h')?.scrollIntoView({ block: 'start', behavior: 'instant' }); window.scrollBy({ top: -88, behavior: 'instant' }); });
  await shot(daniel, '01b-employee-offer-with-consent-daniel-not-sent');
  await daniel.context().close();
});

// Read-only recaptures after the live runs (no transaction): the paid payroll run's instalment
// section (gross, "Payroll Advance instalment", net per row) and the employee after the first
// instalment, scrolled to the current advance and its schedule.
test('p23-shots: the paid payroll run with the instalment, and the employee after it (read-only)', async ({ browser }) => {
  const ids = saved();
  const maker = await session(browser, 'maker@sentfund.my.id');
  await maker.goto(`/runs/${ids.payrollRunId}`);
  await expect(maker.locator('.run-head .chip').first()).toHaveText(/^Paid$/);
  await expect(maker.getByTestId('advance-instalments')).toContainText('−0.05');
  await maker.evaluate(() => { document.getElementById('instalments-h')?.scrollIntoView({ block: 'start', behavior: 'instant' }); window.scrollBy({ top: -88, behavior: 'instant' }); });
  await shot(maker, '05-payroll-run-with-instalment');
  const emma = await session(browser, 'emma@sentfund.my.id');
  await expect(emma.getByTestId('advance-progress')).toContainText('5 instalments left');
  await emma.evaluate(() => { document.getElementById('current-h')?.scrollIntoView({ block: 'start', behavior: 'instant' }); window.scrollBy({ top: -88, behavior: 'instant' }); });
  await shot(emma, '06-employee-after-first-instalment');
  for (const p of [emma, maker]) await p.context().close();
});
