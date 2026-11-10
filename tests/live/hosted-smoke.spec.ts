/**
 * Smoke test of the PUBLIC hosted demo (docs/HOSTING.md step 6), in a real browser.
 * SENDS REAL TESTNET TRANSACTIONS on the hosted site: one 0.01 tUSDC run to Emma Clark.
 *   HOSTED_URL=https://sentfund.my.id npx playwright test -c playwright.hosted-live.config.ts
 * Writes .tmp/live-exports/hosted-smoke-run.json (run IDs) for record-run-evidence / docs.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { shot as shotIn } from './helpers';

const OUT = 'docs/screenshots/phase-22';
mkdirSync(OUT, { recursive: true });
mkdirSync('.tmp/live-exports', { recursive: true });
const shot = (page: Page, name: string) => shotIn(page, name, OUT);

async function session(browser: Browser, email: string) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Sign in to SentFund' });
  await dialog.getByLabel('Email').fill(email);
  await dialog.getByLabel('Password').fill('12345678');
  await dialog.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(maker|approver|admin)$/);
  return page;
}

async function uploadRun(page: Page, title: string, file: string) {
  await page.goto('/maker/runs/new');
  await page.getByLabel('Run title').fill(title);
  await page.getByText('Upload a file').click();
  await page.getByText('Detailed', { exact: true }).click();
  await page.getByRole('button', { name: 'Create draft run' }).click();
  await page.waitForURL(/\/maker\/runs\/(?!new$)[^/]+$/);
  const runId = page.url().split('/').pop()!;
  await page.getByLabel('Choose a payroll file').setInputFiles({ name: file.split('/').pop()!, mimeType: 'text/csv', buffer: readFileSync(file) });
  await expect(page.getByText(/^Accepted /)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('link', { name: 'Continue to review' }).click();
  await page.waitForURL(/\/review$/);
  return runId;
}

test.describe.configure({ mode: 'serial' });

test('hosted: health, banner and the read-only admin screens', async ({ browser, request }) => {
  const health = await (await request.get('/api/health')).json();
  expect(health).toMatchObject({ status: 'ok', service: 'sentfund', db: 'ok', hostedDemo: true, readOnly: false, faceModels: true });
  const admin = await session(browser, 'admin@sentfund.my.id');
  await expect(admin.getByText(/Public demo on NEAR testnet/).first()).toBeVisible();
  await admin.goto('/admin');
  await expect(admin.getByText(/Read-only on this copy/).first()).toBeVisible();
  await shot(admin, '01-hosted-admin-workflow-read-only');
  await admin.goto('/admin/recipients');
  await expect(admin.getByText(/recipient1\.sentfund-payroll\.testnet/).first()).toBeVisible();
  await expect(admin.getByRole('button', { name: 'Add recipient' })).toHaveCount(0);
  await admin.goto('/admin/identity');
  await expect(admin.getByText(/built-in synthetic specimens/).first()).toBeVisible();
  await shot(admin, '02-hosted-identity');
  await admin.context().close();
});

test('hosted: the 1,000-row sample previews but cannot be submitted (nothing sent)', async ({ browser }) => {
  const maker = await session(browser, 'maker@sentfund.my.id');
  await uploadRun(maker, 'Hosted sample check', 'public/templates/sentfund-payroll-sample-1000.csv');
  await maker.getByRole('button', { name: 'Submit for approval' }).click();
  await maker.getByRole('dialog').getByRole('button', { name: /^Submit .* tUSDC for approval$/ }).click();
  await expect(maker.getByRole('dialog').getByRole('alert')).toContainText('Nothing was sent');
  await shot(maker, '03-hosted-sample-refused');
  await maker.context().close();
});

// Needs ANTHROPIC_API_KEY on the hosted service (Andre's separate key). No NEAR transaction: the
// assistant preview is not turned into a draft, and the specimen check is a dry run.
test('hosted: assistant preview (no draft created) and a specimen identity dry run', async ({ browser }) => {
  test.setTimeout(180_000);
  const maker = await session(browser, 'maker@sentfund.my.id');
  await maker.goto('/maker/runs/new');
  await expect(maker.getByTestId('assistant-off')).toHaveCount(0);
  const box = maker.getByTestId('payroll-assistant');
  await box.getByRole('textbox').fill('Create a disbursement for the Sales division, 0.03 tUSDC each, called November commissions');
  await box.getByRole('button', { name: /^(Send|Answer)$/ }).click();
  const preview = maker.getByTestId('assistant-preview');
  await expect(preview).toBeVisible({ timeout: 90_000 });
  await expect(preview).toContainText('Sales division, 2 recipients, 0.03 tUSDC each, total 0.06 tUSDC');
  await shot(maker, '05-hosted-assistant-preview');
  await maker.context().close(); // "Create draft" is never clicked

  const admin = await session(browser, 'admin@sentfund.my.id');
  await admin.goto('/admin/identity');
  const demo = admin.getByTestId('specimen-demo');
  await demo.getByTestId('specimen-emma').click();
  const result = demo.getByTestId('identity-result');
  await expect(result).toHaveAttribute('data-outcome', /verified|needs_review|failed/, { timeout: 90_000 });
  await expect(result.getByTestId('identity-dry-run')).toBeVisible();
  await expect(result).toHaveAttribute('data-outcome', 'verified');
  await result.scrollIntoViewIfNeeded();
  await shot(admin, '06-hosted-specimen-dry-run');
  await admin.context().close();
});

test('hosted: a 0.01 tUSDC run to Emma Clark, approved by both, paid on testnet', async ({ browser }) => {
  test.setTimeout(900_000);
  const maker = await session(browser, 'maker@sentfund.my.id');
  const runId = await uploadRun(maker, 'Hosted smoke test', 'docs/hosting/smoke-test-0.01.csv');
  await maker.getByRole('button', { name: 'Submit for approval' }).click();
  await maker.getByRole('dialog', { name: /Submit version 1 for approval/ }).getByRole('button', { name: /Submit 0\.01 tUSDC for approval/ }).click();
  await maker.waitForURL(`**/runs/${runId}`);
  await expect(maker.locator('.run-head .chip').first()).toHaveText(/Awaiting approval/, { timeout: 120_000 });
  const chainRunId = (await maker.locator('.run-sub .mono').first().textContent())!.trim();
  writeFileSync('.tmp/live-exports/hosted-smoke-run.json', JSON.stringify({ runId, chainRunId }, null, 2));
  for (const [email, step] of [['app1@sentfund.my.id', 1], ['app2@sentfund.my.id', 2]] as const) {
    const ap = await session(browser, email);
    await ap.goto(`/runs/${runId}`);
    await expect(ap.getByRole('heading', { name: `Your decision (step ${step})` })).toBeVisible({ timeout: 120_000 });
    await ap.getByRole('button', { name: 'Approve version 1' }).click();
    await ap.getByRole('dialog', { name: 'Approve version 1?' }).getByRole('button', { name: /Approve 0\.01 tUSDC/ }).click();
    await expect(async () => {
      await ap.reload();
      await expect(ap.locator('.timeline-list li').filter({ hasText: `(step ${step})` })).toContainText('Confirmed on NEAR', { timeout: 3000 });
    }).toPass({ timeout: 180_000 });
    await ap.context().close();
  }
  await maker.goto(`/runs/${runId}`);
  await expect(maker.locator('.run-head .chip').first()).toHaveText(/^Paid$/, { timeout: 480_000 });
  await expect(maker.locator('.stat').filter({ hasText: /^Paid/ }).locator('.value')).toHaveText('1 of 1');
  await maker.evaluate(() => window.scrollTo(0, 0));
  await shot(maker, '04-hosted-smoke-run-paid');
  await maker.context().close();
});
