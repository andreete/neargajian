/**
 * NIK (Nomor Induk Kependudukan) checks, offline. A NIK has 16 digits: PP KK CC DDMMYY SSSS
 * (province, regency/city, district, birth date with DD + 40 for women, serial). The app checks
 * the structure and that it agrees with the date of birth and sex printed on the same card.
 * It does NOT check the NIK against Dukcapil (the government registry): that needs an official
 * partnership, which this prototype does not have, and the UI says so.
 */
import { createHmac } from 'node:crypto';

/** Province codes in use (Kemendagri), including the four Papua provinces created in 2022. */
export const PROVINCE_CODES: Readonly<Record<string, string>> = {
  11: 'Aceh', 12: 'Sumatera Utara', 13: 'Sumatera Barat', 14: 'Riau', 15: 'Jambi', 16: 'Sumatera Selatan', 17: 'Bengkulu', 18: 'Lampung',
  19: 'Kepulauan Bangka Belitung', 21: 'Kepulauan Riau', 31: 'DKI Jakarta', 32: 'Jawa Barat', 33: 'Jawa Tengah', 34: 'DI Yogyakarta',
  35: 'Jawa Timur', 36: 'Banten', 51: 'Bali', 52: 'Nusa Tenggara Barat', 53: 'Nusa Tenggara Timur', 61: 'Kalimantan Barat',
  62: 'Kalimantan Tengah', 63: 'Kalimantan Selatan', 64: 'Kalimantan Timur', 65: 'Kalimantan Utara', 71: 'Sulawesi Utara',
  72: 'Sulawesi Tengah', 73: 'Sulawesi Selatan', 74: 'Sulawesi Tenggara', 75: 'Gorontalo', 76: 'Sulawesi Barat', 81: 'Maluku',
  82: 'Maluku Utara', 91: 'Papua', 92: 'Papua Barat', 93: 'Papua Selatan', 94: 'Papua Tengah', 95: 'Papua Pegunungan', 96: 'Papua Barat Daya',
};

export interface NikParts { province: string; provinceName: string; regency: string; district: string; birthDay: number; birthMonth: number; birthYear2: number; female: boolean; serial: string }
export type NikResult = { ok: true; nik: string; parts: NikParts } | { ok: false; reason: string };

export function normalizeNik(raw: string): string {
  return raw.replace(/[\s.\-]/g, '');
}

export function parseNik(raw: string): NikResult {
  const nik = normalizeNik(raw);
  if (!/^\d{16}$/.test(nik)) return { ok: false, reason: `A NIK has exactly 16 digits (read: ${nik.length} characters).` };
  const province = nik.slice(0, 2);
  const provinceName = PROVINCE_CODES[province];
  if (!provinceName) return { ok: false, reason: `The first two digits (${province}) are not an Indonesian province code.` };
  const regency = nik.slice(2, 4), district = nik.slice(4, 6);
  if (regency === '00' || district === '00') return { ok: false, reason: 'The regency or district code is 00, which is never issued.' };
  let day = Number(nik.slice(6, 8));
  const month = Number(nik.slice(8, 10)), year2 = Number(nik.slice(10, 12));
  const female = day > 40;
  if (female) day -= 40;
  if (day < 1 || day > 31 || month < 1 || month > 12) return { ok: false, reason: 'Digits 7–12 are not a valid date of birth (DDMMYY, women DD + 40).' };
  const serial = nik.slice(12);
  if (serial === '0000') return { ok: false, reason: 'The last four digits are 0000, which is never issued.' };
  return { ok: true, nik, parts: { province, provinceName, regency, district, birthDay: day, birthMonth: month, birthYear2: year2, female, serial } };
}

/** Does the NIK agree with the date of birth (YYYY-MM-DD) and sex printed on the card? */
export function nikMatchesCard(parts: NikParts, birthDate: string | null, gender: string | null): { date: boolean | null; sex: boolean | null } {
  let date: boolean | null = null;
  const m = birthDate ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate) : null;
  if (m) date = Number(m[3]) === parts.birthDay && Number(m[2]) === parts.birthMonth && Number(m[1]) % 100 === parts.birthYear2;
  const g = (gender ?? '').toUpperCase();
  const sex = g.includes('PEREMPUAN') || g === 'FEMALE' ? parts.female : g.includes('LAKI') || g === 'MALE' ? !parts.female : null;
  return { date, sex };
}

/** Shown and stored instead of the NIK: first four and last four digits. */
export function maskNik(nik: string): string {
  return `${nik.slice(0, 4)}${'*'.repeat(8)}${nik.slice(12)}`;
}

/** Keyed hash (HMAC-SHA-256) to spot the same NIK on two employees without storing it. */
export function nikHash(nik: string, secret: string): string {
  return createHmac('sha256', `sentfund-nik-v1:${secret}`).update(nik).digest('hex');
}

// ------------------------------------------------------------------ names

const TITLES = new Set(['IR', 'DR', 'DRS', 'DRA', 'H', 'HJ', 'S', 'SH', 'SE', 'ST', 'MM', 'MT', 'MBA', 'SKOM', 'SPD', 'AMD', 'PROF', 'MR', 'MRS', 'MS']);

export function nameTokens(name: string): string[] {
  return name.toUpperCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z\s]/g, ' ').split(/\s+/).filter((t) => t.length > 1 && !TITLES.has(t)); // initials and degree letters (S.E.) are ignored
}

function levenshtein(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]!;
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j]!;
      d[j] = Math.min(d[j]! + 1, d[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length]!;
}

/**
 * Directory name vs the name on the KTP: "match" when the same words (any order, titles ignored),
 * "close" when they differ by about one letter per word (a reading slip or a spelling variant),
 * else "different".
 */
export function compareNames(directory: string, card: string): 'match' | 'close' | 'different' {
  const a = nameTokens(directory), b = nameTokens(card);
  if (!a.length || !b.length) return 'different';
  const sa = [...a].sort().join(' '), sb = [...b].sort().join(' ');
  if (sa === sb) return 'match';
  const dist = levenshtein(sa, sb);
  if (dist <= Math.max(1, Math.floor(Math.min(sa.length, sb.length) / 8))) return 'close';
  const shorter = a.length <= b.length ? a : b, longer = a.length <= b.length ? b : a;
  if (shorter.length >= 2 && shorter.every((t) => longer.includes(t))) return 'close';
  return 'different';
}
