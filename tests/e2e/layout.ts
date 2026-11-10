/** Shared layout sweep (Phase 14, reused by the Phase 23 stand-in flow): see pages.spec.ts. */
import { mkdirSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

export const SIZES = [[1280, 720], [1440, 900]] as const;

export function watch(page: Page) {
  const problems: string[] = [];
  page.on('console', (msg) => { if (msg.type() === 'error' && /Content Security Policy|Refused to/i.test(msg.text())) problems.push(msg.text()); });
  page.on('pageerror', (err) => problems.push(err.message));
  return problems;
}

/** Layout problems on the current page, as human-readable strings. */
export async function layoutProblems(page: Page): Promise<string[]> {
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

export async function sweep(page: Page, label: string, path: string) {
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

