/**
 * Exact money math for tUSDC (6 decimals). Amounts are integer base units (bigint)
 * end to end: 1 tUSDC = 1_000_000 base units. JSON carries amounts as decimal strings
 * of base units ("50000"), the UI and files use decimal tUSDC strings ("0.05").
 *
 * Never use JavaScript numbers for money.
 */

export const DECIMALS = 6;
export const UNIT = 1_000_000n;
/** Largest value the contract can hold (Rust u128). */
export const U128_MAX = (1n << 128n) - 1n;
/** Contract row limit and importer limit (PRD §4). */
export const MAX_ROWS = 1000;

export type AmountError =
  | 'empty'
  | 'comma_decimal'
  | 'invalid_format'
  | 'too_many_decimals'
  | 'not_positive'
  | 'above_row_cap'
  | 'above_u128';

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: AmountError; message: string };

const MESSAGES: Record<AmountError, string> = {
  empty: 'Amount is required.',
  comma_decimal: 'Use a dot as the decimal separator, e.g. 1500.50',
  invalid_format: 'Amount must be a plain decimal number, e.g. 0.05',
  too_many_decimals: 'tUSDC has at most 6 decimal places.',
  not_positive: 'Amount must be greater than zero.',
  above_row_cap: 'Amount is above the per-row demo cap.',
  above_u128: 'Amount is too large.',
};

function fail<T>(error: AmountError): ParseResult<T> {
  return { ok: false, error, message: MESSAGES[error] };
}

const DECIMAL_RE = /^(\d+)(?:\.(\d+))?$/;
const COMMA_DECIMAL_RE = /^\d+,\d+$/;

/**
 * Parses a decimal tUSDC string ("0.05", "1500.5", "12") into base units.
 * Accepts surrounding whitespace only. Rejects signs, exponents, thousands separators,
 * comma decimals, more than 6 decimals, zero, and values above `maxUnits`.
 */
export function parseAmount(input: string, maxUnits: bigint = U128_MAX): ParseResult<bigint> {
  const s = input.trim();
  if (s === '') return fail('empty');
  if (COMMA_DECIMAL_RE.test(s)) return fail('comma_decimal');
  const m = DECIMAL_RE.exec(s);
  if (!m) return fail('invalid_format');
  const whole = m[1] ?? '';
  const frac = m[2] ?? '';
  if (frac.length > DECIMALS) return fail('too_many_decimals');
  const units = BigInt(whole) * UNIT + BigInt(frac.padEnd(DECIMALS, '0') || '0');
  if (units === 0n) return fail('not_positive');
  if (units > U128_MAX) return fail('above_u128');
  if (units > maxUnits) return fail('above_row_cap');
  return { ok: true, value: units };
}

/** Formats base units as a fixed 6-decimal tUSDC string: 50000n → "0.050000". */
export function formatAmount(units: bigint): string {
  if (units < 0n) throw new RangeError('negative amount');
  const s = units.toString().padStart(DECIMALS + 1, '0');
  return `${s.slice(0, -DECIMALS)}.${s.slice(-DECIMALS)}`;
}

/** Shorter display form: trailing zeros trimmed but at least 2 decimals ("0.05", "12.50"). */
export function formatAmountShort(units: bigint): string {
  const full = formatAmount(units);
  const [whole, frac = ''] = full.split('.');
  const trimmed = frac.replace(/0+$/, '').padEnd(2, '0');
  return `${whole}.${trimmed}`;
}

/** Base units → JSON string. */
export function toJsonUnits(units: bigint): string {
  if (units < 0n || units > U128_MAX) throw new RangeError('amount out of u128 range');
  return units.toString();
}

/** JSON string of base units → bigint, strictly validated. */
export function fromJsonUnits(json: string): bigint {
  if (!/^(0|[1-9]\d*)$/.test(json)) throw new RangeError('invalid base-unit string');
  const v = BigInt(json);
  if (v > U128_MAX) throw new RangeError('amount out of u128 range');
  return v;
}

/** Sums base units; throws if the sum leaves the u128 range or exceeds `maxTotal`. */
export function sumUnits(values: Iterable<bigint>, maxTotal: bigint = U128_MAX): bigint {
  let total = 0n;
  for (const v of values) {
    if (v < 0n) throw new RangeError('negative amount');
    total += v;
    if (total > U128_MAX) throw new RangeError('total exceeds u128');
    if (total > maxTotal) throw new RangeError('total exceeds the run cap');
  }
  return total;
}
