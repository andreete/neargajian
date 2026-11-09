import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

export async function signIn(page: Page, email: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Sign in to GAJIAN' });
  await dialog.getByLabel('Email').fill(email);
  await dialog.getByLabel('Password').fill('12345678');
  await dialog.getByRole('button', { name: 'Sign in' }).click();
}

export async function newRun(page: Page, title: string, source: 'upload' | 'manual', posting: 'Consolidated' | 'Detailed' = 'Detailed') {
  await page.goto('/maker/runs/new');
  await page.getByLabel('Run title').fill(title);
  await page.getByText(source === 'upload' ? 'Upload a file' : 'Enter rows manually').click();
  await page.getByText(posting, { exact: true }).click();
  await page.getByRole('button', { name: 'Create draft run' }).click();
  await page.waitForURL(/\/maker\/runs\/(?!new$)[^/]+$/);
}

export const sampleCsv = () => readFileSync('public/templates/gajian-payroll-sample-1000.csv');

/** The sample file with two real problems: row 61 has an invalid account, row 205 a comma decimal. */
export function brokenSample(): Buffer {
  const lines = sampleCsv().toString('utf8').split('\r\n');
  lines[60] = lines[60]!.replace(/^[^,]+/, 'Mary Moore!');
  lines[204] = lines[204]!.replace(/,tUSDC,([0-9.]+),/, ',tUSDC,0,05,');
  return Buffer.from(lines.join('\r\n'));
}
