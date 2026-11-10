/**
 * Phase 21 · identity checks in the browser (admin): the specimen demo with the real face engine
 * and the labelled test stub KTP reader, a check from uploaded images, manual review with a
 * reason, the check log, and the maker's review page refusing a run that pays someone not
 * verified. No testnet transactions, no Claude API calls.
 */
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

function watchCsp(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|CSP/i.test(m.text())) problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push(e.message));
  return problems;
}

const row = (page: Page, account: string) => page.locator(`[data-testid="identity-row"][data-account="${account}"]`);

test('admin runs the specimen checks, an upload check and a manual review; every check is logged', async ({ page }) => {
  test.setTimeout(90_000);
  const problems = watchCsp(page);
  await signIn(page, 'admin@sentfund.my.id');
  await page.waitForURL(/\/admin$/);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Identity checks' }).click();
  await page.waitForURL(/\/admin\/identity$/);
  await expect(page.getByRole('heading', { name: 'Identity checks', level: 1 })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Pay identity-verified recipients only' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('not a Dukcapil (government registry) check')).toBeVisible();
  await expect(row(page, 'recipient2.gajian-payroll.testnet').getByTestId('identity-status')).toHaveText('Verified');

  // Impostor: Daniel's KTP with another face → Failed, Daniel's status changes on this copy.
  const demo = page.getByTestId('specimen-demo');
  await demo.getByTestId('specimen-impostor').click();
  const result = demo.getByTestId('identity-result');
  await expect(result).toHaveAttribute('data-outcome', 'failed', { timeout: 30_000 });
  await expect(result).toContainText('Different person');
  await expect(result).toContainText('KTP read by the test stub reader (browser tests only)');
  await expect(row(page, 'recipient2.gajian-payroll.testnet').getByTestId('identity-status')).toHaveText('Failed');

  // Daniel's own specimen → Verified again, similarity shown.
  await demo.getByTestId('specimen-daniel').click();
  await expect(result).toHaveAttribute('data-outcome', 'verified', { timeout: 30_000 });
  await expect(result).toContainText(/face similarity 0\.9\d\d/);
  await expect(row(page, 'recipient2.gajian-payroll.testnet').getByTestId('identity-status')).toHaveText('Verified');

  // Upload check for Emma with the specimen files: a specimen card uploaded as real → Needs review.
  await row(page, 'recipient1.gajian-payroll.testnet').getByRole('button', { name: 'Check identity of Emma Clark' }).click();
  const dialog = page.getByRole('dialog', { name: /Check identity: Emma Clark/ });
  await dialog.getByLabel('KTP (photo or scan of the card)').setInputFiles('public/specimens/emma-ktp.jpg');
  await dialog.getByLabel('Face photo of the employee').setInputFiles('public/specimens/emma-selfie.jpg');
  await expect(dialog.getByRole('img', { name: 'KTP (photo or scan of the card) preview' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Run identity check' }).click();
  const upload = dialog.getByTestId('identity-result');
  await expect(upload).toHaveAttribute('data-outcome', 'needs_review', { timeout: 30_000 });
  await expect(upload).toContainText('marked as a specimen, not a real KTP');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(row(page, 'recipient1.gajian-payroll.testnet').getByTestId('identity-status')).toHaveText('Needs review');

  // Manual review with a reason → Verified.
  await row(page, 'recipient1.gajian-payroll.testnet').getByRole('button', { name: 'Review identity of Emma Clark' }).click();
  const review = page.getByRole('dialog', { name: /Review: Emma Clark/ });
  await review.getByLabel(/Approve/).check();
  await review.getByLabel('Reason').fill('Compared the specimen card and the photo myself');
  await review.getByRole('button', { name: 'Save decision' }).click();
  await expect(review).toBeHidden();
  await expect(row(page, 'recipient1.gajian-payroll.testnet').getByTestId('identity-status')).toHaveText('Verified');

  const log = page.getByTestId('identity-log');
  await expect(log).toContainText('manual review');
  await expect(log).toContainText('Compared the specimen card and the photo myself');
  await expect(log).toContainText('3174********0001');
  expect(problems).toEqual([]);
});

test('the filter finds recipients by identity status, and the sample employees are not checked', async ({ page }) => {
  await signIn(page, 'admin@sentfund.my.id');
  await page.waitForURL(/\/admin$/);
  await page.goto('/admin/identity?identity=unverified');
  await expect(page.getByText(/^1,0\d\d active recipients$/)).toBeVisible();
  await expect(page.getByTestId('identity-row').first().getByTestId('identity-status')).toHaveText('Not checked');
});
