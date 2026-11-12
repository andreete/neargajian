/**
 * Phase 26 · QA Part A (milestone kit, docs/roadmap/qa-checklist.md): the automatable checks that are
 * safe on the SHARED public demo. READ-ONLY: sign-ins (sessions), page and API reads, and mutation
 * attempts that are refused before they do anything (no CSRF token, foreign origin, or an ID that does
 * not exist). No NEAR transaction, no upload, no approval, no change to the demo data.
 *   npx playwright test -c playwright.hosted-live.config.ts tests/live/qa-part-a.spec.ts
 *   QA_BASE_URL=http://127.0.0.1:8092 npx playwright test -c playwright.hosted-live.config.ts tests/live/qa-part-a.spec.ts
 * (the second form runs the same checks against a local production build).
 * Results: docs/roadmap/qa-part-a-results.md.
 */
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';

const BASE = (process.env.QA_BASE_URL ?? process.env.HOSTED_URL ?? 'https://sentfund.my.id').replace(/\/$/, '');
const HTTPS = BASE.startsWith('https://');
const PASSWORD = '12345678';
const ACCOUNTS = { maker: 'maker@sentfund.my.id', app1: 'app1@sentfund.my.id', admin: 'admin@sentfund.my.id', emma: 'emma@sentfund.my.id' } as const;
type Who = keyof typeof ACCOUNTS;

test.use({ baseURL: BASE });


/** Signs in through the API in a fresh browser context; returns the context's page, request and CSRF token. */
async function signIn(browser: Browser, who: Who, home: string) {
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 800 } });
  const res = await ctx.request.post('/api/auth/login', { headers: { origin: BASE }, data: { email: ACCOUNTS[who], password: PASSWORD } });
  expect(res.status(), `${who} signs in`).toBe(200);
  const page = await ctx.newPage();
  await page.goto(home);
  const csrf = /csrfToken\\?"\s*:\s*\\?"([A-Za-z0-9_-]{20,})/.exec(await page.content())?.[1] ?? '';
  expect(csrf, `${who}: CSRF token embedded in the page`).not.toBe('');
  return { ctx, page, request: ctx.request, csrf };
}

const STACK = /\bat\s+[\w$.<>]+\s+\(|node_modules\/|\.tsx?:\d+:\d+|webpack-internal|Error:\s+\w+.*\n\s+at\s/;

test('QA-A1-01: the landing page has no sideways scroll at 375 px and 1280 px, and no console errors', async ({ browser }) => {
  for (const [width, height] of [[375, 812], [390, 844], [1280, 800]] as const) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(scroll, `${width} px: page scroll width`).toBeLessThanOrEqual(client);
    const tryDemo = page.getByRole('button', { name: 'Try the demo' }).first();
    const box = await tryDemo.boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= width, `${width} px: "Try the demo" fully on screen`).toBe(true);
    expect(errors, `${width} px: console errors (incl. hydration #418/#423)`).toEqual([]);
    await ctx.close();
  }
});

test('QA-A1-03: a wrong password and an unknown email give the same generic answer', async ({ request }) => {
  const known = await request.post('/api/auth/login', { headers: { origin: BASE }, data: { email: ACCOUNTS.maker, password: 'wrong-password' } });
  const unknown = await request.post('/api/auth/login', { headers: { origin: BASE }, data: { email: 'nobody-qa@example.com', password: 'wrong-password' } });
  expect(known.status()).toBe(401);
  expect(unknown.status()).toBe(401);
  expect(await known.json()).toEqual(await unknown.json());
});

test('QA-A1-04: the session cookie is HttpOnly, SameSite and (on HTTPS) Secure; after sign-out protected pages and APIs are closed', async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: BASE });
  const res = await ctx.request.post('/api/auth/login', { headers: { origin: BASE }, data: { email: ACCOUNTS.maker, password: PASSWORD } });
  const cookie = res.headers()['set-cookie'] ?? '';
  expect(cookie).toMatch(/^sentfund_session=/);
  expect(cookie).toMatch(/;\s*HttpOnly/i);
  expect(cookie).toMatch(/;\s*SameSite=(Lax|Strict)/i);
  if (HTTPS) expect(cookie).toMatch(/;\s*Secure/i);
  const page = await ctx.newPage();
  await page.goto('/maker');
  await expect(page).toHaveURL(/\/maker/);
  const csrf = /csrfToken\\?"\s*:\s*\\?"([A-Za-z0-9_-]{20,})/.exec(await page.content())?.[1] ?? '';
  const out = await ctx.request.post('/api/auth/logout', { headers: { origin: BASE, 'x-csrf-token': csrf } });
  expect(out.ok()).toBe(true);
  await page.goto('/maker');
  await expect(page).toHaveURL(/signin=required/);
  await page.goBack();
  await page.reload();
  await expect(page).not.toHaveURL(/\/maker$/);
  expect((await ctx.request.get('/api/runs')).status()).toBe(401);
  await ctx.close();
});

test('QA-A1-05 + A5-01: two roles in two browser profiles; the employee reaches none of the maker\'s pages or data', async ({ browser }) => {
  const maker = await signIn(browser, 'maker', '/maker');
  const emma = await signIn(browser, 'emma', '/employee');
  const runs = (await (await maker.request.get('/api/runs')).json()) as { runs?: { id: string }[] };
  const ids = (runs.runs ?? []).map((r) => r.id).slice(0, 5);
  expect(ids.length).toBeGreaterThan(0);
  for (const id of ids) {
    expect((await emma.request.get(`/api/runs/${id}`)).status(), `employee reads run ${id}`).toBe(404);
    expect((await emma.request.get(`/api/runs/${id}/draft`)).status(), `employee reads draft ${id}`).toBe(403);
  }
  expect((await emma.request.get('/api/runs')).status()).toBe(403);
  for (const path of ['/maker', '/approver', '/admin', '/history']) {
    const r = await emma.page.goto(path);
    expect(r?.status(), `employee opens ${path}`).toBe(403);
  }
  await maker.ctx.close();
  await emma.ctx.close();
});

test('QA-A1-06 + A1-07: proof links go to the testnet explorer; every in-page anchor has a target', async ({ page }) => {
  await page.goto('/');
  const hrefs = await page.locator('a[href]').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
  const explorer = hrefs.filter((h) => h.includes('nearblocks'));
  expect(explorer.length).toBeGreaterThan(0);
  for (const h of explorer) expect(h, h).toMatch(/^https:\/\/testnet\.nearblocks\.io\//);
  for (const h of hrefs.filter((x) => x.startsWith('#') && x.length > 1)) {
    expect(await page.locator(h).count(), `anchor ${h}`).toBe(1);
  }
});

const GET_APIS = ['/api/me', '/api/runs', '/api/runs/qa-none', '/api/runs/qa-none/draft', '/api/admin/audit', '/api/admin/workflow', '/api/admin/recipients', '/api/admin/settings', '/api/reports/company', '/api/reports/recipients'];

test('QA-A7-02: every protected API answers 401 without a session', async ({ request }) => {
  for (const path of GET_APIS) expect((await request.get(path)).status(), path).toBe(401);
  for (const path of ['/api/runs', '/api/runs/qa-none/submit', '/api/runs/qa-none/decision', '/api/admin/workflow', '/api/employee/advances', '/api/employee/face-check/challenge', '/api/advances/qa-none/submit', '/api/assistant']) {
    expect((await request.post(path, { headers: { origin: BASE }, data: {} })).status(), `POST ${path}`).toBe(401);
  }
});

test('QA-A7-01 + A7-02: with the wrong role every API answers 403 (or 404 for a record the caller may not see)', async ({ browser }) => {
  const emma = await signIn(browser, 'emma', '/employee');
  const app1 = await signIn(browser, 'app1', '/approver');
  const maker = await signIn(browser, 'maker', '/maker');
  const expectStatus = async (r: APIRequestContext, path: string, want: number[], who: string) => {
    const s = (await r.get(path)).status();
    expect(want, `${who} GET ${path} → ${s}`).toContain(s);
  };
  for (const path of ['/api/admin/audit', '/api/admin/workflow', '/api/admin/recipients', '/api/admin/settings', '/api/reports/company', '/api/reports/recipients', '/api/runs']) await expectStatus(emma.request, path, [403], 'employee');
  for (const path of ['/api/admin/audit', '/api/admin/workflow', '/api/admin/recipients', '/api/admin/settings']) {
    await expectStatus(app1.request, path, [403], 'approver 1');
    await expectStatus(maker.request, path, [403], 'maker');
  }
  await expectStatus(app1.request, '/api/runs/qa-none/draft', [403], 'approver 1');
  await expectStatus(maker.request, '/api/runs/qa-none', [404], 'maker');
  for (const s of [emma, app1, maker]) await s.ctx.close();
});

test('QA-A7-03: mutations need our origin and the session\'s CSRF token (refused before anything happens)', async ({ browser }) => {
  const maker = await signIn(browser, 'maker', '/maker');
  const emma = await signIn(browser, 'emma', '/employee');
  // A record that does not exist: with a valid token the route answers 404, so a refusal is the guard.
  const cases: [typeof maker, string][] = [[maker, '/api/runs/qa-none/cancel'], [maker, '/api/runs/qa-none/submit'], [emma, '/api/employee/advances/qa-none/withdraw']];
  for (const [s, path] of cases) {
    const noToken = await s.request.post(path, { headers: { origin: BASE }, data: {} });
    expect(noToken.status(), `${path} without token`).toBe(403);
    expect((await noToken.json()).error.code).toBe('bad_csrf');
    const foreign = await s.request.post(path, { headers: { origin: 'https://evil.example', 'x-csrf-token': s.csrf }, data: {} });
    expect(foreign.status(), `${path} from another origin`).toBe(403);
    expect((await foreign.json()).error.code).toBe('bad_origin');
    const wrongToken = await s.request.post(path, { headers: { origin: BASE, 'x-csrf-token': 'x'.repeat(43) }, data: {} });
    expect(wrongToken.status(), `${path} with a wrong token`).toBe(403);
    const ok = await s.request.post(path, { headers: { origin: BASE, 'x-csrf-token': s.csrf }, data: {} });
    expect([400, 404, 409, 422], `${path} with the token reaches the route (and refuses the empty body or the unknown ID)`).toContain(ok.status());
  }
  const loginForeign = await browser.newContext({ baseURL: BASE }).then((c) => c.request.post('/api/auth/login', { headers: { origin: 'https://evil.example' }, data: { email: ACCOUNTS.maker, password: PASSWORD } }));
  expect(loginForeign.status(), 'sign-in from another origin').toBe(403);
  await maker.ctx.close();
  await emma.ctx.close();
});

test('QA-A7-04: security headers (CSP with frame-ancestors, X-Frame-Options, Referrer-Policy, nosniff, HSTS on HTTPS)', async ({ request }) => {
  for (const path of ['/', '/maker', '/api/health', '/qa-does-not-exist', '/api/runs']) {
    const h = (await request.get(path, { maxRedirects: 0 })).headers();
    expect(h['content-security-policy'], `${path} CSP`).toMatch(/frame-ancestors 'none'/);
    expect(h['x-frame-options'], path).toBe('DENY');
    expect(h['referrer-policy'], path).toBe('strict-origin-when-cross-origin');
    expect(h['x-content-type-options'], path).toBe('nosniff');
    expect(h['x-powered-by'], path).toBeUndefined();
    if (HTTPS) expect(h['strict-transport-security'], `${path} HSTS`).toMatch(/max-age=(\d{8,})/);
  }
  const csp = (await request.get('/')).headers()['content-security-policy'] ?? '';
  expect(csp).not.toMatch(/unsafe-inline|unsafe-eval/);
});

test('QA-A7-05: the client JavaScript of every role\'s pages carries no key material', async ({ browser }) => {
  const scripts = new Set<string>();
  const collect = (page: Page) => page.on('response', (r) => { if (r.url().includes('/_next/static/') && r.url().endsWith('.js')) scripts.add(r.url()); });
  const anon = await browser.newContext({ baseURL: BASE });
  const landing = await anon.newPage();
  collect(landing);
  await landing.goto('/');
  await landing.waitForLoadState('networkidle');
  for (const [who, home, more] of [['maker', '/maker', ['/maker/runs/new', '/history']], ['app1', '/approver', []], ['admin', '/admin', ['/admin/recipients', '/admin/identity']], ['emma', '/employee', []]] as const) {
    const s = await signIn(browser, who, home);
    collect(s.page);
    for (const p of [home, ...more]) { await s.page.goto(p); await s.page.waitForLoadState('networkidle'); }
    await s.ctx.close();
  }
  expect(scripts.size).toBeGreaterThan(5);
  const patterns: [string, RegExp][] = [
    ['ed25519 key', /ed25519:[1-9A-HJ-NP-Za-km-z]{43,}/],
    ['secp256k1 key', /secp256k1:[1-9A-HJ-NP-Za-km-z]{20,}/],
    ['PEM private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ['Anthropic key', /sk-ant-[A-Za-z0-9_-]{20,}/],
    ['server secret names', /SIGNER_PRIVATE_KEY|SESSION_SECRET|FACE_TEMPLATE_KEY|ANTHROPIC_API_KEY|DEMO_RESET_TOKEN|HOSTED_FACE_TEMPLATE_KEY/],
    ['seed phrase field', /seed[_ ]?phrase/i],
  ];
  const hits: string[] = [];
  for (const url of scripts) {
    const body = await (await anon.request.get(url)).text();
    for (const [name, re] of patterns) if (re.test(body)) hits.push(`${name} in ${url}`);
    expect((await anon.request.get(`${url}.map`)).status(), `${url}.map is not served`).not.toBe(200);
  }
  console.log(`QA-A7-05: scanned ${scripts.size} client scripts`);
  expect(hits).toEqual([]);
  await anon.close();
});

test('QA-A7-07: errors show no stack traces (unknown page, unknown API, malformed JSON, bad IDs)', async ({ request, browser }) => {
  const page404 = await request.get('/qa-does-not-exist');
  expect(page404.status()).toBe(404);
  expect(await page404.text()).not.toMatch(STACK);
  for (const path of ['/api/qa-does-not-exist', `/api/runs/${'x'.repeat(5000)}`, '/api/runs/..%2F..%2Fetc%2Fpasswd']) {
    const r = await request.get(path);
    expect(r.status(), path).toBeGreaterThanOrEqual(400);
    expect(r.status(), path).toBeLessThan(500);
    expect(await r.text(), path).not.toMatch(STACK);
  }
  // BUG-26-07 (Low, open): a malformed percent-encoding answers 500 (502 behind the hosted proxy)
  // instead of 400. It must still leak nothing and the server must stay up.
  for (const path of ['/api/runs/%E0%A4%A', '/maker/runs/%E0%A4%A']) {
    const r = await request.get(path);
    expect(r.status(), path).toBeGreaterThanOrEqual(400);
    expect(await r.text(), path).not.toMatch(STACK);
  }
  expect((await request.get('/api/health')).ok()).toBe(true);
  const bad = await request.post('/api/auth/login', { headers: { origin: BASE, 'content-type': 'application/json' }, data: '{"email": ' });
  expect(bad.status()).toBe(400);
  expect(await bad.text()).not.toMatch(STACK);
  const maker = await signIn(browser, 'maker', '/maker');
  for (const path of ['/api/runs', '/api/runs/qa-none/submit', '/api/runs/qa-none/release']) {
    const r = await maker.request.post(path, { headers: { origin: BASE, 'x-csrf-token': maker.csrf, 'content-type': 'application/json' }, data: '{not json' });
    expect(r.status(), path).toBeGreaterThanOrEqual(400);
    expect(r.status(), path).toBeLessThan(500);
    expect(await r.text(), path).not.toMatch(STACK);
  }
  await maker.ctx.close();
});
