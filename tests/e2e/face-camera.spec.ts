/**
 * Phase 24 · the camera face check in a real browser WITHOUT a stand-in (the regular e2e server):
 * the camera is allowed only on the employee page (Permissions-Policy), the employee sees
 * "Verify it's you" and the notice, and with the camera permission refused the page explains how to
 * allow it and nothing can be sent. (The fake-camera run is face-camera-fake.spec.ts; the whole
 * flow with the labelled stand-in camera is tests/e2e-standin/advance.spec.ts.)
 */
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('the camera is allowed only on the employee page (Permissions-Policy camera=(self)), blocked everywhere else', async ({ page, request }) => {
  await signIn(page, 'emma@sentfund.my.id');
  await expect(page).toHaveURL(/\/employee$/);
  const employee = await page.request.get('/employee');
  expect(employee.headers()['permissions-policy']).toBe('camera=(self), microphone=(self), geolocation=(), payment=(), usb=()');
  for (const path of ['/', '/maker', '/approver', '/history', '/admin', '/admin/recipients', '/api/health', '/employee/x']) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.headers()['permissions-policy'], path).toBe('camera=(), microphone=(self), geolocation=(), payment=(), usb=()');
  }
  // Off the public demo, the admin's identity page keeps the camera for the face photo (Phase 21).
  expect((await request.get('/admin/identity', { maxRedirects: 0 })).headers()['permissions-policy']).toMatch(/^camera=\(self\)/);
});

test('"Verify it\'s you" opens the camera with the notice; refused permission: how to allow it, and nothing can be sent', async ({ page }) => {
  await signIn(page, 'grace@sentfund.my.id');
  await expect(page).toHaveURL(/\/employee$/);
  const offer = page.getByTestId('advance-offer');
  const verify = offer.getByRole('button', { name: "Verify it's you" });
  await expect(verify).toBeDisabled();
  await expect(offer.getByRole('button', { name: /^Request/ })).toHaveCount(0); // no way around the check
  await offer.getByLabel('I agree to these 6 salary deductions').check();
  const challenges: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/api/employee/')) challenges.push(r.url()); });
  await verify.click();
  const fc = page.getByTestId('face-check');
  await expect(fc.getByTestId('face-notice')).toContainText('Camera images are processed in memory on the SentFund server and never stored');
  await expect(fc.getByTestId('face-standin')).toHaveCount(0); // the real camera here
  await expect(fc.getByTestId('face-camera-help')).toContainText('The request cannot be sent without the face check.');
  await expect(fc.getByTestId('face-camera-help')).toContainText(/allow|camera was found|cannot open the camera/);
  await expect(fc.getByRole('button', { name: 'Start' })).toHaveCount(0);
  await expect(fc.getByRole('button', { name: 'Try again' })).toBeVisible();
  expect(challenges).toEqual([]); // no challenge, no request
  await fc.getByRole('button', { name: 'Cancel' }).click();
  await expect(offer.getByRole('button', { name: "Verify it's you" })).toBeEnabled();
});
