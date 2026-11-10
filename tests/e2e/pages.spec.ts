/**
 * Phase 14 UX sweep: every page, every role, at 1280x720 and 1440x900, with runs in every
 * lifecycle state (test-only fixture, scripts/e2e-fixture.ts). On each page:
 * - no horizontal page scroll; every table fits its card (no horizontal table scroll);
 * - references, accounts, amounts, times, chips and copy values stay on one line;
 * - no CSP violation or page error.
 * Dialogs: Escape closes them and focus returns to the button that opened them.
 * Narrow check at 1024x768: no horizontal page scroll (tables may scroll inside their region).
 * QA_SHOTS=1 also writes every page to .tmp/phase-14/ for visual QA.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const fixture = () => JSON.parse(readFileSync('.tmp/e2e/fixture.json', 'utf8')) as Record<'paidDetailed' | 'paidConsolidated' | 'releasing' | 'awaitingFunding' | 'pending' | 'rejected' | 'longTitle' | 'assistantPending', string>;
const SIZES = [[1280, 720], [1440, 900]] as const;
const EMAIL = { maker: 'maker@sentfund.my.id', approver: 'app1@sentfund.my.id', admin: 'admin@sentfund.my.id' } as const;

function watch(page: Page) {
  const problems: string[] = [];
  page.on('console', (msg) => { if (msg.type() === 'error' && /Content Security Policy|Refused to/i.test(msg.text())) problems.push(msg.text()); });
  page.on('pageerror', (err) => problems.push(err.message));
  return problems;
}

async function signIn(page: Page, role: keyof typeof EMAIL) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Sign in to SentFund' });
  await dialog.getByLabel('Email').fill(EMAIL[role]);
  await dialog.getByLabel('Password').fill('12345678');
  await dialog.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(new RegExp(`/${role}$`));
}

/** Layout problems on the current page, as human-readable strings. */
async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > window.innerWidth) out.push(`page scrolls horizontally (${doc.scrollWidth} > ${window.innerWidth})`);
    document.querySelectorAll<HTMLElement>('.table-wrap').forEach((w, i) => {
      if (w.closest('.error-panel')) return; // the error list may scroll by design
      if (w.scrollWidth > w.clientWidth + 1) out.push(`table ${i} (${w.closest('section')?.querySelector('h2')?.textContent ?? '?'}) scrolls: ${w.scrollWidth} > ${w.clientWidth}`);
    });
    /** Visible text of `el` spans more than one line (icons and screen-reader text ignored). */
    const wraps = (el: Element) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const rects: DOMRect[] = [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent?.trim() || n.parentElement?.closest('.sr-only')) continue;
        const r = document.createRange();
        r.selectNodeContents(n);
        for (const rect of Array.from(r.getClientRects())) if (rect.width > 0 && rect.height > 0) rects.push(rect);
      }
      if (rects.length < 2) return false;
      const minH = Math.min(...rects.map((x) => x.height));
      const bottoms = rects.map((x) => x.bottom);
      return Math.max(...bottoms) - Math.min(...bottoms) > minH * 0.9;
    };
    const oneLine = 'td.amount, td.when, td.nowrap > *, .cv-text, .chip, a.tx, table.data th[scope="col"], .stat .value';
    document.querySelectorAll(oneLine).forEach((el) => {
      if (!(el as HTMLElement).offsetParent) return;
      if (wraps(el)) out.push(`wraps: ${el.tagName.toLowerCase()}.${(el as HTMLElement).className} "${(el.textContent ?? '').trim().slice(0, 40)}"`);
    });
    return out;
  });
}

async function sweep(page: Page, label: string, path: string) {
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(50);
  expect.soft(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${label} at 1024x768: no horizontal page scroll`).toBe(true);
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(50);
    expect.soft(await layoutProblems(page), `${label} at ${width}x${height}`).toEqual([]);
    if (process.env.QA_SHOTS === '1') {
      mkdirSync('.tmp/phase-14', { recursive: true });
      await page.mouse.move(0, 0);
      await page.screenshot({ path: `.tmp/phase-14/${label}-${width}.png`, fullPage: true });
    }
  }
}

test('landing page fits at both desktop sizes', async ({ page }) => {
  const problems = watch(page);
  await sweep(page, 'landing', '/');
  expect(problems).toEqual([]);
});

test('maker pages fit at 1280x720 and 1440x900 in every run state', async ({ page }) => {
  test.setTimeout(120_000);
  const problems = watch(page);
  const f = fixture();
  await signIn(page, 'maker');
  await sweep(page, 'maker-dashboard', '/maker');
  await sweep(page, 'maker-new-run', '/maker/runs/new');
  await sweep(page, 'maker-draft-upload', '/maker/runs/run_demo_november');
  await sweep(page, 'maker-review', '/maker/runs/run_demo_november/review');
  for (const [name, id] of Object.entries(f)) await sweep(page, `maker-run-${name}`, `/runs/${id}`);
  await sweep(page, 'maker-history-consolidated', '/history?view=consolidated');
  await sweep(page, 'maker-history-detailed', '/history?view=detailed');
  await sweep(page, 'maker-history-detailed-p2', '/history?view=detailed&page=2');
  expect(problems).toEqual([]);
});

test('approver and admin pages fit at 1280x720 and 1440x900', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const problems = watch(page);
  const f = fixture();
  await signIn(page, 'approver');
  await sweep(page, 'approver-queue', '/approver');
  await sweep(page, 'approver-run-pending', `/runs/${f.pending}`);
  await sweep(page, 'approver-run-paid', `/runs/${f.paidDetailed}`);
  await sweep(page, 'approver-run-assistant', `/runs/${f.assistantPending}`);
  await sweep(page, 'approver-history-detailed', '/history?view=detailed');
  const admin = await browser.newPage();
  problems.push(...watch(admin));
  await signIn(admin, 'admin');
  await sweep(admin, 'admin-setup', '/admin');
  await sweep(admin, 'admin-recipients', '/admin/recipients');
  await sweep(admin, 'admin-recipients-p2', '/admin/recipients?page=2');
  await sweep(admin, 'admin-identity', '/admin/identity');
  await sweep(admin, 'admin-history-consolidated', '/history?view=consolidated');
  await sweep(admin, 'admin-history-detailed', '/history?view=detailed');
  expect(problems).toEqual([]);
});

test('run page actions stay in one place (top right, title row) in every run state and at both sizes', async ({ page }) => {
  const f = fixture();
  await signIn(page, 'maker');
  for (const [name, id] of Object.entries(f)) {
    await page.goto(`/runs/${id}`);
    for (const [width, height] of SIZES) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(50);
      const geo = await page.evaluate(() => {
        const head = document.querySelector('.run-head')!.getBoundingClientRect();
        const h1 = document.querySelector('.run-head h1')!.getBoundingClientRect();
        const bar = document.querySelector('[data-testid="run-actions"]')!;
        const buttons = Array.from(bar.querySelectorAll('a, button')).filter((b) => !b.closest('dialog')).map((b) => b.getBoundingClientRect()).filter((r) => r.width > 0);
        return { headRight: head.right, h1Top: h1.top, h1Right: h1.right, buttons: buttons.map((b) => ({ top: b.top, right: b.right, bottom: b.bottom })) };
      });
      for (const b of geo.buttons) {
        expect(Math.abs(b.right - geo.headRight), `${name} ${width}: action at the right edge`).toBeLessThanOrEqual(1);
        expect(Math.abs(b.top - geo.h1Top), `${name} ${width}: action on the title row`).toBeLessThanOrEqual(12);
        expect(geo.h1Right, `${name} ${width}: title never runs under the actions`).toBeLessThanOrEqual(b.right - 40);
      }
      if (name === 'pending' || name === 'assistantPending' || name === 'longTitle' || name === 'awaitingFunding') expect(geo.buttons.length, `${name}: cancel available`).toBe(1);
      if (name === 'rejected') expect(geo.buttons.length, 'rejected: edit available').toBe(1);
    }
  }
  if (process.env.QA_SHOTS === '1') {
    await page.goto(`/runs/${f.longTitle}`);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: '.tmp/phase-14/run-long-title-1440.png' });
  }
});

test('lists and the run page show the same derived status (Awaiting funding)', async ({ page }) => {
  const f = fixture();
  await signIn(page, 'maker');
  await expect(page.getByRole('row', { name: /November bonuses/ }).locator('.chip')).toHaveText('Awaiting funding');
  await expect(page.getByRole('row', { name: /October contractors/ }).locator('.chip')).toHaveText('Paid');
  await page.goto(`/runs/${f.awaitingFunding}`);
  await expect(page.locator('.run-head .chip').first()).toHaveText('Awaiting funding');
  await expect(page.getByText('Release waiting for funding')).toBeVisible();
  await expect(page.getByText(/Awaiting funding: the release worker retries/)).toBeVisible();
});

test('detailed history: one line per payout, long values truncated with a copy action', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await signIn(page, 'maker');
  await page.goto('/history?view=detailed');
  const table = page.getByTestId('history');
  await expect(table.locator('tbody tr:not(.group-row)')).toHaveCount(100); // 1,003 lines, 100 per page
  await expect(page.getByText('Lines 1–100 of 1,003 · page 1 of 11')).toBeVisible();
  await page.getByRole('link', { name: 'Next' }).click();
  await expect(page).toHaveURL(/page=2/);
  await page.goto('/history?view=detailed&page=11');
  await expect(table.locator('tr.group-row').filter({ hasText: 'October contractors' })).toBeVisible();
  await expect(table.locator('tbody tr:not(.group-row)')).toHaveCount(3);
  const copy = table.getByRole('button', { name: /^Copy NEAR account recipient1\.sentfund-payroll\.testnet/ }).first();
  await copy.click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('recipient1.sentfund-payroll.testnet');
  await expect(table.getByText('NEAR account copied').first()).toBeAttached();
  const ref = table.locator('tbody tr:not(.group-row) .cv-text').first();
  await expect(ref).toHaveAttribute('title', /^SFD-[A-Z2-9]{8}-0001$/);
  // Truncated values keep the full value in the tooltip and the copy action.
  const account = table.locator('tbody tr:not(.group-row) td:nth-child(3) .cv-text').first();
  await expect(account).toHaveAttribute('title', 'recipient1.sentfund-payroll.testnet');
});

test('dialogs close with Escape and return focus to the button that opened them', async ({ page, browser }) => {
  const f = fixture();
  await signIn(page, 'maker');
  // Submit confirmation (opened only; nothing is sent).
  await page.goto('/maker/runs/run_demo_november/review');
  const submit = page.getByRole('button', { name: 'Submit for approval' });
  await submit.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(submit).toBeFocused();
  // Cancel version on a pending run.
  await page.goto(`/runs/${f.pending}`);
  const cancel = page.getByRole('button', { name: /^Cancel version/ });
  await cancel.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(cancel).toBeFocused();
  // Approver decision dialogs.
  const ap = await browser.newPage();
  await signIn(ap, 'approver');
  await ap.goto(`/runs/${f.pending}`);
  for (const name of [/^Approve version/, /^Reject$/]) {
    const button = ap.getByRole('button', { name }).first();
    await button.click();
    const dialog = ap.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(':focus')).toHaveCount(1); // focus moved into the dialog
    await ap.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(button).toBeFocused();
  }
});
