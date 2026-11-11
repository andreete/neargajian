/**
 * Phase 24 · the camera face check through Chromium's FAKE camera device (a synthetic test pattern,
 * no face; nothing real): permission granted, the real getUserMedia → challenge → frames → server
 * check path runs end to end and answers "No face found"; the attempt is counted.
 */
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }, permissions: ['camera'] });

test('the fake camera device (no face): the real path runs and answers "No face found"; nothing is requested', async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page, 'daniel@sentfund.my.id');
  await expect(page).toHaveURL(/\/employee$/);
  const offer = page.getByTestId('advance-offer');
  await offer.getByLabel('I agree to these 6 salary deductions').check();
  await offer.getByRole('button', { name: "Verify it's you" }).click();
  const fc = page.getByTestId('face-check');
  await expect(fc.getByRole('button', { name: 'Start' })).toBeVisible({ timeout: 15_000 });
  await expect(fc.getByLabel('Camera preview (mirrored)')).toBeVisible();
  await fc.getByRole('button', { name: 'Start' }).click();
  await expect(fc.getByTestId('face-step')).toHaveText(/Turn your head slowly to the (left|right)/, { timeout: 10_000 });
  await expect(fc.getByTestId('face-result')).toContainText('No face found', { timeout: 40_000 });
  await expect(fc.getByTestId('face-result')).toContainText('4 attempts left this hour');
  await expect(fc.getByRole('button', { name: 'Continue as a demo' })).toHaveCount(0);
  await expect(page.getByTestId('advance-current')).toHaveCount(0);
});
