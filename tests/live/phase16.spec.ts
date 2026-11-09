/**
 * Phase 16 live testnet rehearsal through the app (final vault vault2.gajian-payroll.testnet),
 * against the running production server + release worker on 127.0.0.1:8092 with the real
 * database. SENDS REAL TESTNET TRANSACTIONS: run only on purpose (npm run live:phase16).
 * Steps (run one at a time with --grep, in order):
 *   16e  full demo: upload, detailed posting, two approvals, automatic release, history, CSVs
 *   16c  maker release (+16b duplicate pay_row proof while the run is still Releasing),
 *        workflow switched to maker releases and back through the admin page
 *   16d  Awaiting funding: run larger than the vault balance, admin funds, automatic payout
 *   1000 the 1,000-row import check (draft only, never submitted)
 * Screenshots: docs/screenshots/phase-16/. Downloads and logs: .tmp/live-exports/.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { shot as shotIn } from './helpers';

const OUT = 'docs/screenshots/phase-16';
mkdirSync(OUT, { recursive: true });
mkdirSync('.tmp/live-exports', { recursive: true });
const shot = (page: Page, name: string) => shotIn(page, name, OUT);
const log = (name: string, data: unknown) => writeFileSync(`.tmp/live-exports/p16-${name}.json`, JSON.stringify(data, null, 2));

async function session(browser: Browser, email: string) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Sign in to GAJIAN' });
  await dialog.getByLabel('Email').fill(email);
  await dialog.getByLabel('Password').fill('12345678');
  await dialog.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(maker|approver|admin)$/);
  return page;
}

/** Creates and uploads a draft (or resumes an already uploaded draft: resumeDraftId), then submits it. */
async function createAndSubmit(maker: Page, title: string, posting: 'Detailed' | 'Consolidated', file: string, total: string, resumeDraftId?: string) {
  let runId = resumeDraftId ?? '';
  const t = total.replace('.', '\\.');
  if (runId) {
    await maker.goto(`/maker/runs/${runId}`);
  } else {
    await maker.goto('/maker/runs/new');
    await maker.getByLabel('Run title').fill(title);
    await maker.getByText('Upload a file').click();
    await maker.getByText(posting, { exact: true }).click();
    await maker.getByRole('button', { name: 'Create draft run' }).click();
    await maker.waitForURL(/\/maker\/runs\/(?!new$)[^/]+$/);
    runId = maker.url().split('/').pop()!;
    await maker.getByLabel('Choose a payroll file').setInputFiles({ name: file.split('/').pop()!, mimeType: 'text/csv', buffer: readFileSync(file) });
  }
  // The transient "Accepted …" status or the persistent review summary, whichever is on screen.
  await expect(maker.getByText(new RegExp(`Accepted .*3 rows, exact total ${t} tUSDC`)).or(maker.getByText(new RegExp(`^3 rows accepted · exact total ${t} tUSDC$`)))).toBeVisible({ timeout: 15_000 });
  await maker.getByRole('link', { name: 'Continue to review' }).click();
  await maker.waitForURL(/\/review$/);
  await maker.getByRole('button', { name: 'Submit for approval' }).click();
  const dialog = maker.getByRole('dialog', { name: /Submit version 1 for approval/ });
  await dialog.getByRole('button', { name: new RegExp(`Submit ${total.replace('.', '\\.')} tUSDC for approval`) }).click();
  await maker.waitForURL(`**/runs/${runId}`);
  await expect(maker.locator('.run-head .chip').first()).toHaveText(/Awaiting approval/, { timeout: 90_000 });
  const chainRunId = (await maker.locator('.run-sub .mono').first().textContent())!.trim();
  return { runId, chainRunId };
}

async function approveBoth(browser: Browser, runId: string, total: string) {
  for (const [email, step] of [['app1@gajian.my.id', 1], ['app2@gajian.my.id', 2]] as const) {
    const ap = await session(browser, email);
    await ap.goto(`/runs/${runId}`);
    await expect(ap.getByRole('heading', { name: `Your decision (step ${step})` })).toBeVisible({ timeout: 90_000 });
    await ap.getByRole('button', { name: 'Approve version 1' }).click();
    await ap.getByRole('dialog', { name: 'Approve version 1?' }).getByRole('button', { name: new RegExp(`Approve ${total.replace('.', '\\.')} tUSDC`) }).click();
    await expect(ap.locator('.timeline-list')).toContainText(`approved (step ${step})`, { timeout: 30_000 });
    await expect(async () => {
      await ap.reload();
      await expect(ap.locator('.timeline-list li').filter({ hasText: `(step ${step})` })).toContainText('Confirmed on NEAR', { timeout: 2000 });
    }).toPass({ timeout: 120_000 });
    await ap.context().close();
  }
}

const paidStat = (page: Page) => page.locator('.stat').filter({ hasText: /^Paid/ }).locator('.value');

async function waitPaid(page: Page, runId: string) {
  await page.goto(`/runs/${runId}`);
  await expect(page.locator('.run-head .chip').first()).toHaveText(/^Paid$/, { timeout: 420_000 });
  await expect(paidStat(page)).toHaveText('3 of 3');
  await expect(page.getByText('Payouts: 3 of 3 paid')).toBeVisible();
}

async function setRelease(browser: Browser, mode: 'Maker releases' | 'Automatic release', revision: number, screenshot?: string) {
  const admin = await session(browser, 'admin@gajian.my.id');
  if (!(await admin.getByText(`Revision ${revision}`).first().isVisible())) { // idempotent on resume
    await admin.getByText(mode, { exact: true }).click();
    await admin.getByRole('button', { name: 'Save workflow' }).click();
    await expect(admin.getByText(`Revision ${revision}`).first()).toBeVisible({ timeout: 120_000 });
  }
  if (screenshot) await shot(admin, screenshot);
  await admin.context().close();
}

test.describe.configure({ mode: 'serial' });

test('16e full demo through the app: automatic release, history, both exports', async ({ browser }) => {
  test.setTimeout(900_000);
  const maker = await session(browser, 'maker@gajian.my.id');
  const r = await createAndSubmit(maker, 'Phase 16 rehearsal: November contractors', 'Detailed', 'tests/live/p16-demo.csv', '0.12');
  log('demo', r);
  await approveBoth(browser, r.runId, '0.12');
  await waitPaid(maker, r.runId);
  await shot(maker, '01-demo-paid-with-explorer-links');
  await expect(async () => {
    await maker.goto('/history?view=consolidated');
    await expect(maker.getByTestId('history')).toContainText('Phase 16 rehearsal: November contractors', { timeout: 2000 });
  }).toPass({ timeout: 90_000 });
  await shot(maker, '02-history-consolidated');
  await maker.goto('/history?view=detailed');
  await expect(maker.getByTestId('history').locator('tr.group-row').filter({ hasText: 'Phase 16 rehearsal' })).toBeVisible();
  await shot(maker, '03-history-detailed');
  for (const [name, link] of [['company', /Company entries/], ['recipients', /Recipient detail/]] as const) {
    const download = maker.waitForEvent('download');
    await maker.getByTestId('export-area').getByRole('link', { name: link }).click();
    await (await download).saveAs(`.tmp/live-exports/p16-${name}.csv`);
  }
});

test('16c maker release through the app, with 16b duplicate pay_row refused on-chain', async ({ browser }) => {
  test.setTimeout(900_000);
  await setRelease(browser, 'Maker releases', 2, process.env.P16_RESUME_DRAFT ? undefined : '04-admin-maker-releases');
  const maker = await session(browser, 'maker@gajian.my.id');
  const r = await createAndSubmit(maker, 'Phase 16 rehearsal: maker release', 'Consolidated', 'tests/live/p16-maker-release.csv', '0.09', process.env.P16_RESUME_DRAFT);
  log('maker-release', r);
  await approveBoth(browser, r.runId, '0.09');
  await maker.goto(`/runs/${r.runId}`);
  await expect(maker.getByRole('button', { name: 'Release payments' })).toBeVisible({ timeout: 60_000 });
  await shot(maker, '05-maker-release-button');
  await maker.getByRole('button', { name: 'Release payments' }).click();
  await maker.getByRole('dialog', { name: /Release 0\.09 tUSDC\?/ }).getByRole('button', { name: 'Release 0.09 tUSDC' }).click();
  await expect(maker.locator('.run-head .chip').first()).toHaveText(/Releasing/, { timeout: 120_000 });
  // 16b: once one row is paid and the run is still Releasing, repeat pay_row on that row.
  await expect(paidStat(maker)).toHaveText(/^[12] of 3$/, { timeout: 180_000 });
  const out = execFileSync('node', ['--env-file=.env', 'scripts/testnet/phase16.ts', 'duplicate', r.chainRunId, '0'], { encoding: 'utf8', env: { ...process.env, TMPDIR: `${process.cwd()}/.tmp` } });
  writeFileSync('.tmp/live-exports/p16-duplicate.txt', out);
  expect(out).toMatch(/duplicate pay_row 0 on a paid row while the run is Releasing \(worker\) \[as expected\] \w+ .*already paid/i);
  await maker.reload();
  await shot(maker, '06-releasing-during-duplicate-proof');
  await waitPaid(maker, r.runId);
  await shot(maker, '07-maker-release-paid');
  await setRelease(browser, 'Automatic release', 3, '08-admin-back-to-automatic');
});

test('16d Awaiting funding: shown in the app, funded by the admin, then paid automatically', async ({ browser }) => {
  test.setTimeout(900_000);
  const maker = await session(browser, 'maker@gajian.my.id');
  const r = await createAndSubmit(maker, 'Phase 16 rehearsal: November bonuses', 'Detailed', 'tests/live/p16-awaiting-funding.csv', '0.75');
  log('awaiting-funding', r);
  await approveBoth(browser, r.runId, '0.75');
  await maker.goto(`/runs/${r.runId}`);
  await expect(maker.locator('.run-head .chip').first()).toHaveText('Awaiting funding', { timeout: 180_000 });
  await expect(maker.getByText('Release waiting for funding')).toBeVisible();
  await shot(maker, '09-awaiting-funding');
  await maker.goto('/maker');
  await expect(maker.getByRole('row', { name: /November bonuses/ }).locator('.chip')).toHaveText('Awaiting funding');
  const out = execFileSync('node', ['scripts/testnet/phase16.ts', 'fund', '0.50'], { encoding: 'utf8', env: { ...process.env, TMPDIR: `${process.cwd()}/.tmp` } });
  writeFileSync('.tmp/live-exports/p16-fund.txt', out);
  await waitPaid(maker, r.runId);
  await shot(maker, '10-paid-after-funding');
});

test('1000-row import check (draft only, not submitted)', async ({ browser }) => {
  const maker = await session(browser, 'maker@gajian.my.id');
  await maker.goto('/maker/runs/new');
  await maker.getByLabel('Run title').fill('Phase 16 import check: 1,000 rows (not submitted)');
  await maker.getByText('Upload a file').click();
  await maker.getByText('Consolidated', { exact: true }).click();
  await maker.getByRole('button', { name: 'Create draft run' }).click();
  await maker.waitForURL(/\/maker\/runs\/(?!new$)[^/]+$/);
  await maker.getByLabel('Choose a payroll file').setInputFiles({ name: 'gajian-payroll-uniform-1000.csv', mimeType: 'text/csv', buffer: readFileSync('public/templates/gajian-payroll-uniform-1000.csv') });
  await expect(maker.getByText(/Accepted .*1,000 rows, exact total 10\.00 tUSDC/)).toBeVisible();
  await expect(maker.getByTestId('review-table').locator('tbody tr')).toHaveCount(50);
  await shot(maker, '11-import-1000-rows');
});
