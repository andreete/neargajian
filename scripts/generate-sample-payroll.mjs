#!/usr/bin/env node
// GAJIAN sample payroll generator.
// Deterministic: the same seed always produces byte-identical files.
// Usage (from repo root): node scripts/generate-sample-payroll.mjs
// Output:
//   public/templates/gajian-payroll-template-blank.csv   header row only
//   public/templates/gajian-payroll-sample-1000.csv      1,000 realistic synthetic rows (CSV, RFC 4180)
//   public/templates/gajian-payroll-sample-1000.txt      same rows, tab-delimited
//   public/templates/gajian-payroll-uniform-1000.csv     1,000 rows x 0.01 = exactly 10.00 (posting-mode reconciliation check)
//   docs/SAMPLE-DATA.md                                  counts, exact totals, SHA-256 checksums
// Amounts are deliberately tiny (0.01-0.10 tUSDC per row) so a showcase stays within a
// small, faucet-friendly budget.
// All data is synthetic. Phone numbers use the unassigned +62 800-0000-xxxx range,
// emails use the reserved example.com domain, and the NEAR account IDs are not real
// demo wallets: never release a live testnet payout from these files.

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SEED = 20261109;
const ROWS = 1000;
const DECIMALS = 6n;
const UNIT = 10n ** DECIMALS;
const CURRENCY = 'tUSDC';
const HEADERS = ['near_account_id', 'receiver_name', 'currency', 'amount', 'mobile_phone', 'email'];
const EOL = '\r\n'; // what Excel produces on Windows; the importer must also accept LF

// mulberry32: small deterministic PRNG
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(SEED);
const pick = (list) => list[Math.floor(rand() * list.length)];
const between = (min, max) => min + Math.floor(rand() * (max - min + 1));

const FIRST = ['Adi', 'Agus', 'Ahmad', 'Andi', 'Anisa', 'Ayu', 'Bambang', 'Bayu', 'Budi', 'Citra', 'Dedi', 'Dewi',
  'Dian', 'Dimas', 'Eka', 'Fajar', 'Fitri', 'Gilang', 'Hadi', 'Hendra', 'Indah', 'Intan', 'Joko', 'Kartika',
  'Lestari', 'Maya', 'Nanda', 'Nur', 'Putri', 'Rani', 'Reza', 'Rizky', 'Sari', 'Siti', 'Taufik', 'Teguh',
  'Wahyu', 'Wulan', 'Yoga', 'Yuni'];
const LAST = ['Anggraini', 'Firmansyah', 'Gunawan', 'Halim', 'Hidayat', 'Kurniawan', 'Lubis', 'Maharani',
  'Nasution', 'Nugroho', 'Permata', 'Pratama', 'Purnomo', 'Rahayu', 'Saputra', 'Setiawan', 'Simanjuntak',
  'Siregar', 'Susanto', 'Wibowo', 'Wijaya', 'Yulianti'];
const TITLES = ['S.E.', 'S.Kom.', 'S.T.', 'M.M.', 'S.Psi.'];

// Exact decimal string from base units, always 2..6 fraction digits as generated.
function formatUnits(units, fractionDigits) {
  const whole = units / UNIT;
  const frac = (units % UNIT).toString().padStart(Number(DECIMALS), '0').slice(0, fractionDigits);
  return fractionDigits === 0 ? whole.toString() : `${whole}.${frac}`;
}
function formatTotal(units) {
  const whole = (units / UNIT).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = (units % UNIT).toString().padStart(Number(DECIMALS), '0');
  return `${whole}.${frac}`;
}

function nearAccount(i) {
  const n = String(i).padStart(4, '0');
  const r = rand();
  if (r < 0.05) return createHash('sha256').update(`gajian-sample-implicit-${i}`).digest('hex'); // implicit account
  if (r < 0.15) return `pay.gjn-emp-${n}.testnet`; // sub-account
  return `gjn-emp-${n}.testnet`;
}

// Every amount is between 0.01 and 0.10 tUSDC inclusive (10,000..100,000 base units).
const MIN_UNITS = 10_000n;
const MAX_UNITS = 100_000n;
function amountFor() {
  const r = rand();
  if (r < 0.05) { // six-decimal precision cases, e.g. 0.054321
    let units = BigInt(between(10_001, 99_999));
    if (units % 10n === 0n) units += 1n; // keep the 6th decimal non-zero
    return { units, text: formatUnits(units, 6) };
  }
  if (r < 0.08) { // one-decimal form "0.1"
    return { units: MAX_UNITS, text: formatUnits(MAX_UNITS, 1) };
  }
  const units = BigInt(between(1, 10)) * (UNIT / 100n); // 0.01 .. 0.10
  return { units, text: formatUnits(units, 2) };
}

function phone(i) {
  const n = String(i).padStart(4, '0');
  return rand() < 0.7 ? `+62 800-0000-${n}` : `+628000000${n}`;
}

function csvField(value) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const rows = [];
for (let i = 1; i <= ROWS; i++) {
  const first = pick(FIRST);
  const last = pick(LAST);
  let name = `${first} ${last}`;
  if (rand() < 0.06) name = `${name}, ${pick(TITLES)}`; // commas force CSV quoting
  const { units, text } = amountFor();
  rows.push({
    units,
    fields: [
      nearAccount(i),
      name,
      CURRENCY,
      text,
      phone(i),
      `${first}.${last}.${String(i).padStart(4, '0')}@example.com`.toLowerCase(),
    ],
  });
}

const toCsv = (records) => [HEADERS, ...records].map((r) => r.map(csvField).join(',')).join(EOL) + EOL;
const toTsv = (records) => [HEADERS, ...records].map((r) => r.join('\t')).join(EOL) + EOL;

const uniform = rows.map((r) => {
  const f = [...r.fields];
  f[3] = '0.01';
  return f;
});
const UNIFORM_UNITS = 10_000n; // 0.01 tUSDC

const outputs = {
  'public/templates/gajian-payroll-template-blank.csv': HEADERS.join(',') + EOL,
  'public/templates/gajian-payroll-sample-1000.csv': toCsv(rows.map((r) => r.fields)),
  'public/templates/gajian-payroll-sample-1000.txt': toTsv(rows.map((r) => r.fields)),
  'public/templates/gajian-payroll-uniform-1000.csv': toCsv(uniform),
};

const total = rows.reduce((sum, r) => sum + r.units, 0n);
const uniformTotal = UNIFORM_UNITS * BigInt(ROWS);
if (rows.some((r) => r.units < MIN_UNITS || r.units > MAX_UNITS)) throw new Error('amount out of range');
const minUnits = rows.reduce((m, r) => (r.units < m ? r.units : m), rows[0].units);
const maxUnits = rows.reduce((m, r) => (r.units > m ? r.units : m), rows[0].units);
const quoted = rows.filter((r) => r.fields[1].includes(',')).length;
const implicit = rows.filter((r) => /^[0-9a-f]{64}$/.test(r.fields[0])).length;
const sub = rows.filter((r) => r.fields[0].startsWith('pay.')).length;
const sixDp = rows.filter((r) => /\.\d{6}$/.test(r.fields[3])).length;
const oneDp = rows.filter((r) => /\.\d$/.test(r.fields[3])).length;

for (const [rel, content] of Object.entries(outputs)) {
  const path = join(ROOT, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const md = `# GAJIAN sample payroll data

Generated by \`node scripts/generate-sample-payroll.mjs\` (seed ${SEED}). Re-running it must reproduce the checksums below exactly; if they differ, the generator or Node version changed behaviour.

All records are synthetic: phones use the unassigned \`+62 800-0000-xxxx\` range, emails use the reserved \`example.com\` domain, and the NEAR account IDs are not demo wallets. **Never release a live testnet payout from these files.** The live demo uses a separate 2–3 row file with real, token-registered testnet accounts.

## Files

| File | Format | Data rows | Purpose |
| --- | --- | --- | --- |
| \`public/templates/gajian-payroll-template-blank.csv\` | CSV, header only | 0 | Blank template users fill in |
| \`public/templates/gajian-payroll-sample-1000.csv\` | CSV (RFC 4180, UTF-8, CRLF, no BOM) | ${ROWS} | Realistic import + review + reporting check (A03, A07) |
| \`public/templates/gajian-payroll-sample-1000.txt\` | Tab-delimited TXT (UTF-8, CRLF) | ${ROWS} | Same rows as the CSV, TXT import path |
| \`public/templates/gajian-payroll-uniform-1000.csv\` | CSV | ${ROWS} | Posting-mode reconciliation: 1,000 × 0.01 = exactly 10.00 |

Amounts are deliberately tiny, **0.01 to 0.10 tUSDC per row**, so a showcase stays within a small, faucet-friendly budget. The PRD's large-number example (1,000 × 1,000,000 = 1,000,000,000) is covered by unit tests of the money and reporting code, not by a file.

Headers (canonical order): \`${HEADERS.join(',')}\`

## Expected results

| Check | sample-1000 (CSV and TXT) | uniform-1000 |
| --- | --- | --- |
| Data rows | ${ROWS} | ${ROWS} |
| Currency | ${CURRENCY} | ${CURRENCY} |
| Exact total | **${formatTotal(total)} ${CURRENCY}** | **${formatTotal(uniformTotal)} ${CURRENCY}** |
| Total in base units (6 decimals) | ${total} | ${uniformTotal} |
| Smallest / largest row | ${formatTotal(minUnits)} / ${formatTotal(maxUnits)} | 0.010000 each |
| Consolidated posting | 1 entry, total as above | 1 entry of 10.000000 |
| Detailed posting | ${ROWS} entries, same total | ${ROWS} entries of 0.010000 |

Edge cases inside sample-1000 (all valid): ${quoted} names containing a comma (quoted in CSV), ${implicit} implicit 64-hex account IDs, ${sub} sub-account IDs (\`pay.gjn-emp-NNNN.testnet\`), ${sixDp} amounts with 6 decimals (e.g. 0.054321), ${oneDp} amounts written with one decimal ("0.1"), phones with and without spaces/dashes. No duplicate wallets.

## SHA-256 checksums

| File | SHA-256 |
| --- | --- |
${Object.entries(outputs).map(([rel, c]) => `| \`${rel.split('/').pop()}\` | \`${sha(c)}\` |`).join('\n')}
`;
const mdPath = join(ROOT, 'docs/SAMPLE-DATA.md');
mkdirSync(dirname(mdPath), { recursive: true });
writeFileSync(mdPath, md, 'utf8');

console.log(`Wrote ${Object.keys(outputs).length} files + docs/SAMPLE-DATA.md`);
console.log(`sample-1000 total: ${formatTotal(total)} ${CURRENCY} (${total} base units)`);
console.log(`uniform-1000 total: ${formatTotal(uniformTotal)} ${CURRENCY}`);
