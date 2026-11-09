/**
 * Deterministic synthetic payroll fixtures (no real people): valid runs of any size up to
 * 1,000 rows and invalid variants for importer and validation tests. Same seed → same bytes.
 * Phone numbers use the reserved +62 800 range; emails use example.com.
 */

export const HEADERS = ['near_account_id', 'receiver_name', 'currency', 'amount', 'mobile_phone', 'email'] as const;
export type FixtureRow = Record<(typeof HEADERS)[number], string>;

const FIRST = ['Adi', 'Bayu', 'Citra', 'Dewi', 'Eka', 'Fajar', 'Gita', 'Hendra', 'Indah', 'Joko', 'Kartika', 'Lestari', 'Made', 'Nur', 'Putri', 'Rizky', 'Sari', 'Teguh', 'Wahyu', 'Yuni'];
const LAST = ['Pratama', 'Santoso', 'Wijaya', 'Lestari', 'Saputra', 'Hidayat', 'Kurniawan', 'Wulandari', 'Nugroho', 'Siregar', 'Harahap', 'Gunawan', 'Putra', 'Rahmawati', 'Setiawan'];

/** mulberry32: tiny deterministic PRNG for fixtures (not for security). */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Valid rows: 0.01–0.10 tUSDC each (two decimals), accounts gjn-fx-NNNN.testnet. */
export function validRows(count: number, seed = 2026): FixtureRow[] {
  if (!Number.isInteger(count) || count < 0) throw new RangeError('count must be a non-negative integer');
  const rand = prng(seed);
  return Array.from({ length: count }, (_, i) => {
    const n = String(i + 1).padStart(4, '0');
    const first = FIRST[Math.floor(rand() * FIRST.length)] ?? 'Adi';
    const last = LAST[Math.floor(rand() * LAST.length)] ?? 'Putra';
    const cents = 1 + Math.floor(rand() * 10);
    return {
      near_account_id: `gjn-fx-${n}.testnet`,
      receiver_name: `${first} ${last}`,
      currency: 'tUSDC',
      amount: `0.${String(cents).padStart(2, '0')}`,
      mobile_phone: `+62 800-1000-${n}`,
      email: `${first}.${last}.${n}@example.com`.toLowerCase(),
    };
  });
}

export const INVALID_KINDS = [
  'bad_account', 'comma_decimal', 'too_many_decimals', 'zero_amount', 'negative_amount', 'missing_field',
  'wrong_currency', 'bad_email', 'bad_phone', 'formula_name',
] as const;
export type InvalidKind = (typeof INVALID_KINDS)[number];

/** Breaks exactly one row (0-based `at`) in a specific way. */
export function withInvalidRow(rows: FixtureRow[], at: number, kind: InvalidKind): FixtureRow[] {
  const copy = rows.map((r) => ({ ...r }));
  const row = copy[at];
  if (!row) throw new RangeError('row index out of range');
  const patch: Record<InvalidKind, Partial<FixtureRow>> = {
    bad_account: { near_account_id: 'Not A Wallet!.testnet' },
    comma_decimal: { amount: '0,05' },
    too_many_decimals: { amount: '0.0000001' },
    zero_amount: { amount: '0' },
    negative_amount: { amount: '-0.05' },
    missing_field: { email: '' },
    wrong_currency: { currency: 'USDC' },
    bad_email: { email: 'not-an-email' },
    bad_phone: { mobile_phone: '12' },
    // Not invalid for import, but must be escaped in CSV exports (Phase 13).
    formula_name: { receiver_name: '=HYPERLINK("http://example.com","x")' },
  };
  Object.assign(row, patch[kind]);
  return copy;
}

function csvField(value: string, delimiter: string): string {
  return /["\r\n]/.test(value) || value.includes(delimiter) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Serializes rows as CSV (or tab-delimited TXT with delimiter '\t'). */
export function toDelimited(rows: FixtureRow[], options: { delimiter?: ',' | ';' | '\t'; crlf?: boolean; bom?: boolean } = {}): string {
  const d = options.delimiter ?? ',';
  const eol = options.crlf === false ? '\n' : '\r\n';
  const lines = [HEADERS.join(d), ...rows.map((r) => HEADERS.map((h) => csvField(r[h], d)).join(d))];
  return `${options.bom ? '﻿' : ''}${lines.join(eol)}${eol}`;
}
