import { describe, expect, it } from 'vitest';
import {
  U128_MAX, UNIT, formatAmount, formatAmountShort, fromJsonUnits, parseAmount, sumUnits, toJsonUnits,
} from '@/server/money';

const ok = (s: string, max?: bigint) => {
  const r = parseAmount(s, max);
  if (!r.ok) throw new Error(`${s}: ${r.error}`);
  return r.value;
};
const err = (s: string, max?: bigint) => {
  const r = parseAmount(s, max);
  return r.ok ? 'ok' : r.error;
};

describe('parseAmount', () => {
  it('parses exact six-decimal values into base units', () => {
    expect(ok('0.01')).toBe(10_000n);
    expect(ok('0.05')).toBe(50_000n);
    expect(ok('0.000001')).toBe(1n);
    expect(ok('1')).toBe(UNIT);
    expect(ok('1500.5')).toBe(1_500_500_000n);
    expect(ok('  12.340000 ')).toBe(12_340_000n);
    expect(ok('007.5')).toBe(7_500_000n);
  });

  it('rejects comma decimals with the Indonesian-Excel hint (D-028)', () => {
    const r = parseAmount('1500,50');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe('Use a dot as the decimal separator, e.g. 1500.50');
  });

  it('rejects malformed, signed, exponent and grouped values', () => {
    for (const s of ['abc', '-1', '+1', '1e3', '1,000.00', '.5', '1.', '1..2', '0x10', '1 000', 'NaN', '∞', '１']) {
      expect(err(s), s).toBe('invalid_format');
    }
    expect(err('')).toBe('empty');
    expect(err('   ')).toBe('empty');
  });

  it('rejects more than six decimals and zero', () => {
    expect(err('0.0000001')).toBe('too_many_decimals');
    expect(err('1.1234567')).toBe('too_many_decimals');
    expect(err('0')).toBe('not_positive');
    expect(err('0.000000')).toBe('not_positive');
  });

  it('enforces the per-row cap and the u128 bound', () => {
    const cap = 1_000_000n; // D-027: 1 tUSDC per row
    expect(ok('1', cap)).toBe(cap);
    expect(err('1.000001', cap)).toBe('above_row_cap');
    const maxWhole = (U128_MAX / UNIT).toString();
    expect(ok(`${maxWhole}.${(U128_MAX % UNIT).toString().padStart(6, '0')}`)).toBe(U128_MAX);
    expect(err(`${maxWhole}.999999`)).toBe('above_u128');
  });
});

describe('formatting and JSON', () => {
  it('formats base units exactly', () => {
    expect(formatAmount(50_000n)).toBe('0.050000');
    expect(formatAmount(56_690_860n)).toBe('56.690860');
    expect(formatAmount(0n)).toBe('0.000000');
    expect(formatAmountShort(50_000n)).toBe('0.05');
    expect(formatAmountShort(12_500_000n)).toBe('12.50');
    expect(formatAmountShort(1n)).toBe('0.000001');
  });

  it('round-trips through JSON strings and rejects non-canonical input', () => {
    expect(toJsonUnits(U128_MAX)).toBe('340282366920938463463374607431768211455');
    expect(fromJsonUnits('340282366920938463463374607431768211455')).toBe(U128_MAX);
    for (const bad of ['01', '-1', '1.0', '', ' 1', '340282366920938463463374607431768211456']) {
      expect(() => fromJsonUnits(bad), bad).toThrow(RangeError);
    }
  });
});

describe('sums', () => {
  it('reconciles 1,000 payouts of 1,000,000 units to 1,000,000,000 (PRD J07)', () => {
    expect(sumUnits(Array.from({ length: 1000 }, () => 1_000_000n))).toBe(1_000_000_000n);
  });

  it('enforces the run cap and u128 overflow', () => {
    expect(() => sumUnits([60_000_000n, 50_000_000n], 100_000_000n)).toThrow('run cap');
    expect(() => sumUnits([U128_MAX, 1n])).toThrow('u128');
  });
});
