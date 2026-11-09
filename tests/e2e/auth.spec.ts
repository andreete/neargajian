import { expect, test, type Page } from '@playwright/test';

/** Collects CSP violations and page errors so every test can assert there were none. */
function watchConsole(page: Page) {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /Content Security Policy|Refused to/i.test(msg.text())) problems.push(msg.text());
  });
  page.on('pageerror', (err) => problems.push(err.message));
  return problems;
}

const EMAIL = { Maker: 'maker@gajian.my.id', 'Approver 1': 'app1@gajian.my.id', 'Approver 2': 'app2@gajian.my.id', Admin: 'admin@gajian.my.id' } as const;

async function signInAs(page: Page, role: keyof typeof EMAIL) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Sign in to GAJIAN' });
  await dialog.getByLabel('Email').fill(EMAIL[role]);
  await dialog.getByLabel('Password').fill('12345678');
  await dialog.getByRole('button', { name: 'Sign in' }).click();
}

test('landing page shows the product, the testnet badge and a strict CSP', async ({ page }) => {
  const problems = watchConsole(page);
  const res = await page.goto('/');
  expect(res?.status()).toBe(200);
  const csp = res?.headers()['content-security-policy'] ?? '';
  expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).not.toContain('unsafe-eval');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Run payroll with a clear approval trail.');
  await expect(page.locator('.testnet-badge').first()).toContainText('NEAR testnet');
  await expect(page.getByText('Sample data')).toBeVisible();
  expect(problems).toEqual([]);
});

test('login dialog: focus moves in, Tab is trapped, Escape closes and restores focus', async ({ page }) => {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Try the demo' }).first();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Sign in to GAJIAN' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Email')).toBeFocused();
  await expect(dialog.getByRole('radio')).toHaveCount(0); // no role picker: the server decides the role
  await expect(dialog.getByText('Demo accounts')).toBeVisible();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('login dialog shows field errors and a generic credential error', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Sign in to GAJIAN' });
  await dialog.getByRole('button', { name: 'Sign in' }).click();
  await expect(dialog.getByText('Enter your email address.')).toBeVisible();
  await expect(dialog.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
  await dialog.getByLabel('Email').fill('maker@gajian.my.id');
  await dialog.getByLabel('Password').fill('not-the-password');
  await dialog.getByRole('button', { name: 'Sign in' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Email or password is incorrect.');
});

const ROLES = [
  { role: 'Maker', path: '/maker', heading: 'My runs', name: 'Maya Maker' },
  { role: 'Approver 1', path: '/approver', heading: 'Review queue', name: 'Alex Approver' },
  { role: 'Approver 2', path: '/approver', heading: 'Review queue', name: 'Riley Reviewer' },
  { role: 'Admin', path: '/admin', heading: 'Workflow settings', name: 'Adam Admin' },
] as const;

for (const r of ROLES) {
  test(`${r.role} signs in, lands on ${r.path} and signs out`, async ({ page }) => {
    const problems = watchConsole(page);
    await signInAs(page, r.role);
    await page.waitForURL(`**${r.path}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(r.heading);
    await expect(page.getByRole('banner').getByText(r.name)).toBeVisible();
    await expect(page.locator('.testnet-badge')).toContainText('NEAR testnet');
    await page.getByRole('button', { name: /Sign out/ }).click();
    await page.waitForURL('http://127.0.0.1:8092/');
    const again = await page.goto(r.path);
    expect(new URL(page.url()).pathname).toBe('/');
    expect(new URL(page.url()).searchParams.get('signin')).toBe('required');
    expect(again?.status()).toBe(200);
    expect(problems).toEqual([]);
  });
}

test('unauthenticated page requests redirect to sign-in and open the dialog', async ({ page }) => {
  for (const path of ['/maker', '/approver', '/admin']) {
    await page.goto(path);
    expect(page.url()).toBe('http://127.0.0.1:8092/?signin=required');
  }
  const dialog = page.getByRole('dialog', { name: 'Sign in to GAJIAN' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('alert')).toHaveText('Please sign in to continue.');
});

test('a signed-in role cannot open another role’s dashboard or admin API', async ({ page }) => {
  await signInAs(page, 'Maker');
  await page.waitForURL('**/maker');
  for (const path of ['/admin', '/approver']) {
    const res = await page.goto(path);
    expect(res?.status()).toBe(403);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText("You don't have access to this page");
  }
  const api = await page.request.get('/api/admin/audit');
  expect(api.status()).toBe(403);
  const runs = await page.request.get('/api/runs');
  expect(runs.status()).toBe(200);
});

test('query parameters cannot grant a role', async ({ page }) => {
  await signInAs(page, 'Approver 1');
  await page.waitForURL('**/approver');
  const res = await page.goto('/admin?role=admin');
  expect(res?.status()).toBe(403);
});

test('first screen shows headline, text, both buttons and the full hero card at desktop sizes', async ({ page }) => {
  for (const [width, height] of [[1280, 720], [1366, 768], [1440, 900], [1920, 1080], [768, 1024]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const desktop = width >= 1024;
    const targets = [
      page.getByRole('heading', { level: 1 }),
      page.locator('.hero-lead'),
      page.locator('.hero-actions').getByRole('button', { name: 'Try the demo' }),
      page.locator('.hero-actions').getByRole('link', { name: 'See how it works' }),
      ...(desktop ? [page.getByTestId('hero-card')] : []),
    ];
    for (const t of targets) {
      const box = await t.boundingBox();
      expect(box, `${width}x${height}`).not.toBeNull();
      expect(box!.y + box!.height, `${width}x${height} bottom`).toBeLessThanOrEqual(height);
      expect(box!.x, `${width}x${height} left`).toBeGreaterThanOrEqual(desktop ? 48 : 32);
      expect(box!.x + box!.width, `${width}x${height} right`).toBeLessThanOrEqual(width - (desktop ? 48 : 32));
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width} no horizontal scroll`).toBe(true);
  }
});

test('admin workflow editor: live preview, distinct reviewers, nothing saved without a change', async ({ page }) => {
  await signInAs(page, 'Admin');
  await page.waitForURL('**/admin');
  const editor = page.getByRole('region', { name: 'Approval workflow for new runs' }).or(page.locator('section[aria-labelledby="editor-title"]'));
  const save = editor.getByRole('button', { name: 'Save workflow' });
  await expect(save).toBeDisabled(); // unchanged
  await expect(page.getByTestId('workflow-summary')).toContainText('approves first');
  await editor.getByText('Two in parallel', { exact: true }).click();
  await expect(page.getByTestId('workflow-summary')).toContainText('approve in any order');
  await expect(editor.locator('.am-gate')).toBeVisible();
  await page.locator('#approver2').selectOption('usr_app1');
  await expect(editor.getByText('Choose two different reviewers.')).toBeVisible();
  await expect(save).toBeDisabled();
  await page.locator('#approver2').selectOption('usr_app2');
  await expect(save).toBeEnabled();
});
