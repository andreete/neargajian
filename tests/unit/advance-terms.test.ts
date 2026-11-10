/**
 * Phase 23 · Payroll Advance money rules (pure): fee, instalments and rounding, the maximum,
 * the 50% rule, carry-over, missed instalments and one deduction per month.
 */
import { describe, expect, it } from 'vitest';
import {
  addMonths, deductionFor, feeFor, HOSTED_ADVANCE_CAP, maxAdvanceFor, monthKey, monthLabel, monthsBetween, monthsFrom, scheduleFor, termsFor,
} from '@/server/advance/terms';

const T = (s: string) => BigInt(Math.round(Number(s) * 1e6)); // test helper only: "0.30" → 300000n
const SIX = scheduleFor(T('0.30'), 6).amounts;

describe('fee and terms', () => {
  it('the example from the brief: salary 0.10, A = 0.30 → fee 0.006, receives 0.294, 0.05 a month for 6 months', () => {
    const t = termsFor(T('0.30'), { feeBps: 200, instalments: 6 });
    expect(t).toEqual({ amount: 300_000n, fee: 6_000n, net: 294_000n, schedule: { regular: 50_000n, last: 50_000n, amounts: Array(6).fill(50_000n) } });
  });

  it('fee is 2% rounded half up to 6 decimals', () => {
    expect(feeFor(10_000n, 200)).toBe(200n); // 0.01 → 0.0002
    expect(feeFor(10_025n, 200)).toBe(201n); // 200.5 → 201 (half up)
    expect(feeFor(10_024n, 200)).toBe(200n); // 200.48 → 200
    expect(feeFor(1n, 200)).toBe(0n); // 0.02 of a base unit → 0
    expect(feeFor(25n, 200)).toBe(1n); // 0.5 → 1
    expect(feeFor(123_456_789n, 0)).toBe(0n);
    expect(() => feeFor(-1n, 200)).toThrow();
  });

  it('instalments: A ÷ n rounded down, the last one absorbs the rounding, the n add up to exactly A', () => {
    for (const [a, n] of [[100_000n, 6], [10_000n, 6], [299_999n, 6], [1n, 6], [7n, 3], [1_000_001n, 12], [5n, 1]] as const) {
      const s = scheduleFor(a, n);
      expect(s.amounts).toHaveLength(n);
      expect(s.amounts.reduce((x, y) => x + y, 0n)).toBe(a);
      expect(s.amounts.slice(0, -1).every((x) => x === s.regular)).toBe(true);
      expect(s.last).toBeGreaterThanOrEqual(s.regular);
      expect(s.last - s.regular).toBeLessThan(BigInt(n));
    }
    expect(scheduleFor(100_000n, 6)).toEqual({ regular: 16_666n, last: 16_670n, amounts: [16_666n, 16_666n, 16_666n, 16_666n, 16_666n, 16_670n] });
    expect(() => scheduleFor(1n, 0)).toThrow();
  });

  it('the maximum: 300% of the monthly net pay, capped by the recipient maximum, the per-row cap and (public demo) 0.30', () => {
    const base = { monthlyNetPay: T('0.10'), maxPercent: 300, recipientMax: T('1.00'), perRowCap: T('1.00') };
    expect(maxAdvanceFor(base)).toBe(T('0.30'));
    expect(maxAdvanceFor({ ...base, recipientMax: T('0.20') })).toBe(T('0.20'));
    expect(maxAdvanceFor({ ...base, perRowCap: T('0.25') })).toBe(T('0.25'));
    expect(maxAdvanceFor({ ...base, monthlyNetPay: T('1.00'), hosted: true })).toBe(HOSTED_ADVANCE_CAP);
    expect(maxAdvanceFor({ ...base, maxPercent: 150 })).toBe(T('0.15'));
  });
});

describe('months (UTC)', () => {
  it('keys, labels and arithmetic across years', () => {
    expect(monthKey(new Date('2026-11-30T23:59:59Z'))).toBe('2026-11');
    expect(monthKey(new Date('2026-12-01T00:00:00Z'))).toBe('2026-12');
    expect(addMonths('2026-11', 2)).toBe('2027-01');
    expect(addMonths('2027-01', -1)).toBe('2026-12');
    expect(monthsBetween('2026-11', '2027-04')).toBe(5);
    expect(monthsFrom('2026-11', 6)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04']);
    expect(monthLabel('2026-11')).toBe('November 2026');
  });
});

describe('deduction rule', () => {
  const base = { schedule: SIX, firstMonth: null, month: '2026-11', alreadyDeducted: 0n, monthAlreadyDeducted: false, gross: T('0.10') };

  it('first payroll after the payout: the first instalment, net = gross − instalment', () => {
    expect(deductionFor(base)).toEqual({ due: T('0.05'), instalment: T('0.05'), net: T('0.05'), carried: 0n });
  });

  it('never more than 50% of the gross: the rest carries over to the next month', () => {
    const d = deductionFor({ ...base, gross: T('0.06') });
    expect(d).toEqual({ due: T('0.05'), instalment: T('0.03'), net: T('0.03'), carried: T('0.02') });
    // Next month: instalment 2 plus the carried 0.02 are due; a big payroll takes all of it.
    const next = deductionFor({ ...base, firstMonth: '2026-11', month: '2026-12', alreadyDeducted: T('0.03'), gross: T('0.50') });
    expect(next).toEqual({ due: T('0.07'), instalment: T('0.07'), net: T('0.43'), carried: 0n });
  });

  it('never takes a row to zero or below', () => {
    expect(deductionFor({ ...base, gross: 1n })).toMatchObject({ instalment: 0n, net: 1n });
    expect(deductionFor({ ...base, gross: 2n })).toMatchObject({ instalment: 1n, net: 1n });
    expect(deductionFor({ ...base, gross: 0n })).toMatchObject({ instalment: 0n, net: 0n });
  });

  it('one deduction per month: a later run in the same month deducts nothing', () => {
    expect(deductionFor({ ...base, firstMonth: '2026-11', alreadyDeducted: T('0.05'), monthAlreadyDeducted: true, gross: T('1.00') }))
      .toEqual({ due: 0n, instalment: 0n, net: T('1.00'), carried: 0n });
  });

  it('missed months are caught up: skipped December and January, February deducts three instalments (capped at 50%)', () => {
    const feb = { ...base, firstMonth: '2026-11', month: '2027-02', alreadyDeducted: T('0.05') };
    expect(deductionFor({ ...feb, gross: T('1.00') })).toEqual({ due: T('0.15'), instalment: T('0.15'), net: T('0.85'), carried: 0n });
    expect(deductionFor({ ...feb, gross: T('0.20') })).toEqual({ due: T('0.15'), instalment: T('0.10'), net: T('0.10'), carried: T('0.05') });
  });

  it('after the sixth month only the remaining balance is due, and nothing once fully deducted', () => {
    expect(deductionFor({ ...base, firstMonth: '2026-11', month: '2027-08', alreadyDeducted: T('0.20'), gross: T('1.00') })).toMatchObject({ due: T('0.10'), instalment: T('0.10') });
    expect(deductionFor({ ...base, firstMonth: '2026-11', month: '2027-08', alreadyDeducted: T('0.30'), gross: T('1.00') })).toMatchObject({ due: 0n, instalment: 0n });
  });

  it('the last instalment absorbs the rounding when repaid month by month', () => {
    const s = scheduleFor(100_000n, 6).amounts;
    let deducted = 0n;
    for (let i = 0; i < 6; i++) {
      const d = deductionFor({ schedule: s, firstMonth: '2026-11', month: addMonths('2026-11', i), alreadyDeducted: deducted, monthAlreadyDeducted: false, gross: T('1.00') });
      expect(d.instalment).toBe(s[i]);
      deducted += d.instalment;
    }
    expect(deducted).toBe(100_000n);
  });
});
