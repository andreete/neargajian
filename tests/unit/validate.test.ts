import { describe, expect, it } from 'vitest';
import { emptyRow, validateRow, validateRows, type RawRow } from '@/server/payroll/validate';

const LIMITS = { maxRowAmount: 1_000_000n, maxRunTotal: 100_000_000n };
const ok: RawRow = { near_account_id: 'recipient1.gajian-payroll.testnet', receiver_name: 'Emma Clark', currency: 'tUSDC', amount: '0.05', mobile_phone: '+44 7700 900101', email: 'Emma.Clark@Example.com' };
const errs = (r: Partial<RawRow>) => validateRow({ ...ok, ...r }, 0, LIMITS).errors.map((e) => `${e.field}: ${e.message}`);

describe('row validation', () => {
  it('accepts a valid row and normalizes it exactly', () => {
    const r = validateRow({ ...ok, receiver_name: '  Emma Clark  ' }, 0, LIMITS);
    expect(r.errors).toEqual([]);
    expect(r.valid).toEqual({ accountId: 'recipient1.gajian-payroll.testnet', receiverName: 'Emma Clark', currency: 'tUSDC', amount: 50_000n, mobilePhone: '+44 7700 900101', email: 'emma.clark@example.com' });
  });

  it('keeps amount precision exact and refuses anything ambiguous', () => {
    expect(validateRow({ ...ok, amount: '0.000001' }, 0, LIMITS).valid?.amount).toBe(1n);
    expect(validateRow({ ...ok, amount: '0.999999' }, 0, LIMITS).valid?.amount).toBe(999_999n);
    expect(errs({ amount: '0.0000001' })).toEqual(['amount: tUSDC has at most 6 decimal places.']);
    expect(errs({ amount: '0,05' })).toEqual(['amount: Use a dot as the decimal separator, e.g. 1500.50']);
    expect(errs({ amount: '0' })).toEqual(['amount: Amount must be greater than zero.']);
    expect(errs({ amount: '1.000001' })).toEqual(['amount: Amount is above the per-row cap of 1.00 tUSDC.']);
    expect(errs({ amount: '1e-2' })).toEqual(['amount: Amount must be a plain decimal number, e.g. 0.05']);
  });

  it('requires all six fields', () => {
    const r = validateRow(emptyRow(), 0, LIMITS);
    expect(r.errors.map((e) => e.field).sort()).toEqual(['amount', 'email', 'mobile_phone', 'near_account_id', 'receiver_name']);
    expect(errs({ currency: '' })).toEqual(['currency: Currency is required.']);
  });

  it('checks account syntax, currency, phone and email', () => {
    expect(errs({ near_account_id: 'Bad Wallet!.testnet' })).toEqual(['near_account_id: Invalid NEAR account ID.']);
    expect(errs({ near_account_id: 'Upper.testnet' })).toEqual(['near_account_id: NEAR account IDs are lowercase.']);
    expect(errs({ near_account_id: 'a'.repeat(64) })).toEqual([]); // implicit account
    expect(errs({ currency: 'USDC' })).toEqual(['currency: Currency must be tUSDC.']);
    expect(errs({ mobile_phone: '12' })).toEqual(['mobile_phone: Mobile phone must have 7–15 digits, optionally starting with +.']);
    expect(errs({ mobile_phone: '+447700900101' })).toEqual([]);
    expect(errs({ email: 'not-an-email' })).toEqual(['email: Invalid email address.']);
    expect(errs({ receiver_name: 'x'.repeat(101) })).toEqual(['receiver_name: Receiver name is longer than 100 characters.']);
  });
});

describe('run validation', () => {
  it('computes the exact total of valid rows and counts invalid ones without dropping them', () => {
    const s = validateRows([ok, { ...ok, amount: '0.07' }, { ...ok, near_account_id: 'bad wallet' }], LIMITS);
    expect([s.validCount, s.invalidCount, s.validTotal]).toEqual([2, 1, 120_000n]);
    expect(s.rows).toHaveLength(3);
    expect(s.rows[2]?.valid).toBeNull();
  });

  it('flags the same wallet on two rows as a warning, not an error', () => {
    const s = validateRows([ok, { ...ok, near_account_id: 'other.testnet' }, ok], LIMITS);
    expect(s.invalidCount).toBe(0);
    expect([...s.duplicateWallets]).toEqual([['recipient1.gajian-payroll.testnet', [0, 2]]]);
  });

  it('enforces the run cap and the row limit', () => {
    expect(validateRows(Array.from({ length: 101 }, () => ({ ...ok, amount: '1' })), LIMITS).runErrors).toContain('The total of the valid rows is above the per-run cap.');
    expect(validateRows(Array.from({ length: 1001 }, () => ok), LIMITS).runErrors).toContain('A run has at most 1,000 rows.');
    expect(validateRows([], LIMITS).runErrors).toContain('Add at least one row.');
  });
});
