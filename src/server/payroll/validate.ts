/**
 * Payroll row validation, shared by the manual builder (browser + server) and the file
 * importer (server). Pure TypeScript, no Node APIs. The server always re-validates; the
 * browser only mirrors the same rules for instant feedback.
 */
import { formatAmountShort, parseAmount, U128_MAX } from '../money.ts';
import { isValidAccountId } from '../near-account.ts';

export const FIELDS = ['near_account_id', 'receiver_name', 'currency', 'amount', 'mobile_phone', 'email'] as const;
export type Field = (typeof FIELDS)[number];
export const FIELD_LABEL: Record<Field, string> = {
  near_account_id: 'NEAR account ID', receiver_name: 'Receiver name', currency: 'Currency',
  amount: 'Amount', mobile_phone: 'Mobile phone', email: 'Email',
};
export const CURRENCY = 'tUSDC';
export const MAX_NAME = 100;
export const MAX_EMAIL = 254;

export type RawRow = Record<Field, string>;

export interface ValidRow {
  accountId: string;
  receiverName: string;
  currency: string;
  amount: bigint;
  mobilePhone: string;
  email: string;
}

export interface FieldIssue { field: Field; message: string }

export interface RowResult {
  index: number;
  valid: ValidRow | null;
  errors: FieldIssue[];
}

export interface Limits { maxRowAmount: bigint; maxRunTotal: bigint }

 
const CONTROL = /[\u0000-\u001f\u007f]/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

export function normalizePhone(raw: string): string | null {
  const compact = raw.trim().replace(/[\s\-().]/g, '');
  return /^\+?\d{7,15}$/.test(compact) ? compact : null;
}

export function validateRow(raw: Partial<RawRow>, index: number, limits: Limits): RowResult {
  const v = (f: Field) => (raw[f] ?? '').trim();
  const errors: FieldIssue[] = [];
  const err = (field: Field, message: string) => errors.push({ field, message });

  const account = v('near_account_id');
  if (!account) err('near_account_id', 'NEAR account ID is required.');
  else if (account !== account.toLowerCase() && isValidAccountId(account.toLowerCase())) err('near_account_id', 'NEAR account IDs are lowercase.');
  else if (!isValidAccountId(account)) err('near_account_id', 'Invalid NEAR account ID.');

  const name = v('receiver_name');
  if (!name) err('receiver_name', 'Receiver name is required.');
  else if (name.length > MAX_NAME) err('receiver_name', `Receiver name is longer than ${MAX_NAME} characters.`);
  else if (CONTROL.test(name)) err('receiver_name', 'Receiver name contains control characters.');

  const currency = v('currency');
  if (!currency) err('currency', 'Currency is required.');
  else if (currency !== CURRENCY) err('currency', `Currency must be ${CURRENCY}.`);

  const amountText = v('amount');
  const amount = parseAmount(amountText, limits.maxRowAmount);
  if (!amount.ok) {
    err('amount', amount.error === 'above_row_cap' ? `Amount is above the per-row cap of ${formatAmountShort(limits.maxRowAmount)} tUSDC.` : amount.message);
  }

  const phoneRaw = v('mobile_phone');
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (!phoneRaw) err('mobile_phone', 'Mobile phone is required.');
  else if (!phone) err('mobile_phone', 'Mobile phone must have 7–15 digits, optionally starting with +.');

  const email = v('email').toLowerCase();
  if (!email) err('email', 'Email is required.');
  else if (email.length > MAX_EMAIL || !EMAIL_RE.test(email)) err('email', 'Invalid email address.');

  const valid = errors.length === 0 && amount.ok
    ? { accountId: account, receiverName: name, currency, amount: amount.value, mobilePhone: phoneRaw.replace(/\s+/g, ' '), email }
    : null;
  return { index, valid, errors };
}

export interface ValidationSummary {
  rows: RowResult[];
  validCount: number;
  invalidCount: number;
  /** Exact total of the valid rows. */
  validTotal: bigint;
  /** Row indexes whose wallet appears more than once (allowed, flagged for review). */
  duplicateWallets: Map<string, number[]>;
  /** Run-level problems (cap, empty, too many rows). */
  runErrors: string[];
}

export function validateRows(rows: Partial<RawRow>[], limits: Limits, maxRows = 1000): ValidationSummary {
  const results = rows.map((r, i) => validateRow(r, i, limits));
  const valid = results.filter((r) => r.valid);
  let total = 0n;
  for (const r of valid) total += r.valid?.amount ?? 0n;
  const byWallet = new Map<string, number[]>();
  for (const r of valid) {
    const id = r.valid?.accountId ?? '';
    byWallet.set(id, [...(byWallet.get(id) ?? []), r.index]);
  }
  const duplicateWallets = new Map([...byWallet].filter(([, idx]) => idx.length > 1));
  const runErrors: string[] = [];
  if (rows.length === 0) runErrors.push('Add at least one row.');
  if (rows.length > maxRows) runErrors.push(`A run has at most ${maxRows.toLocaleString('en-US')} rows.`);
  if (total > limits.maxRunTotal || total > U128_MAX) runErrors.push('The total of the valid rows is above the per-run cap.');
  return { rows: results, validCount: valid.length, invalidCount: results.length - valid.length, validTotal: total, duplicateWallets, runErrors };
}

export function emptyRow(): RawRow {
  return { near_account_id: '', receiver_name: '', currency: CURRENCY, amount: '', mobile_phone: '', email: '' };
}
