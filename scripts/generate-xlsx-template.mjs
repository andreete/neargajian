#!/usr/bin/env node
// Generates public/templates/gajian-payroll-template.xlsx (macro-free) from the sample CSV:
//   "Instructions" sheet + "Payroll" sheet with the six headers and the same 1,000 synthetic rows.
// near_account_id, amount and mobile_phone are TEXT columns (number format "@") and written
// as strings, so Excel keeps leading "+", never uses scientific notation and never changes decimals.
// Usage: node scripts/generate-xlsx-template.mjs
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { parse } from 'csv-parse/sync';

const ROOT = new URL('../', import.meta.url);
const OUT = new URL('public/templates/gajian-payroll-template.xlsx', ROOT);
const HEADERS = ['near_account_id', 'receiver_name', 'currency', 'amount', 'mobile_phone', 'email'];
const TEXT_COLUMNS = new Set(['near_account_id', 'amount', 'mobile_phone']);
const rows = parse(readFileSync(new URL('public/templates/gajian-payroll-sample-1000.csv', ROOT)), { columns: false }).slice(1);
const FIXED_DATE = new Date('2026-11-09T00:00:00Z');

const wb = new ExcelJS.Workbook();
wb.creator = 'GAJIAN';
wb.lastModifiedBy = 'GAJIAN';
wb.created = FIXED_DATE;
wb.modified = FIXED_DATE;
wb.title = 'GAJIAN payroll template';

const info = wb.addWorksheet('Instructions', { properties: { tabColor: { argb: 'FF0A3C90' } } });
info.getColumn(1).width = 110;
const lines = [
  ['GAJIAN payroll template', { bold: true, size: 16, color: { argb: 'FF0A3C90' } }],
  ['NEAR testnet demo · zero-value tUSDC · the sample rows are synthetic and their wallets are not real.', { italic: true }],
  [''],
  ['How to fill it in', { bold: true, size: 12 }],
  ['1. Use the "Payroll" sheet. Replace the sample rows with your own; keep the header row exactly as it is.'],
  ['2. Columns: near_account_id, receiver_name, currency, amount, mobile_phone, email. All six are required.'],
  ['3. near_account_id: the recipient\'s NEAR testnet account, e.g. name.testnet (lowercase).'],
  ['4. currency: tUSDC.'],
  ['5. amount: tUSDC with a DOT as the decimal separator and at most 6 decimals, e.g. 0.05 or 1500.50. Do not use thousands separators.'],
  ['6. mobile_phone: with country code, e.g. +44 7700 900123. email: a valid address.'],
  ['7. Up to 1,000 rows and 2 MB per file. Each row is one payment; the same wallet may appear twice and is flagged for review.'],
  [''],
  ['How to save it for upload', { bold: true, size: 12 }],
  ['Excel: File → Save As → choose "CSV UTF-8 (Comma delimited) (*.csv)" or "Text (Tab delimited) (*.txt)". Upload that file in GAJIAN.'],
  ['Regional Excel settings: if your Excel saves CSV with semicolons, GAJIAN detects that automatically. Amounts must still use a dot (1500.50, not 1500,50).'],
  ['Account, amount and phone columns are formatted as Text so Excel keeps the leading +, never shows amounts in scientific notation and never changes decimals.'],
  [''],
  ['What happens next', { bold: true, size: 12 }],
  ['GAJIAN checks the whole file before accepting anything. If any row has a problem, nothing is imported and you get a list of every problem with its row and column (also as a downloadable report). Fix the file and upload it again; the previous version stays active until a new file passes.'],
];
lines.forEach(([text, font], i) => {
  const cell = info.getCell(i + 1, 1);
  cell.value = text;
  cell.alignment = { wrapText: true, vertical: 'top' };
  if (font) cell.font = font;
});

const sheet = wb.addWorksheet('Payroll', { views: [{ state: 'frozen', ySplit: 1 }] });
sheet.columns = HEADERS.map((h) => ({
  header: h, key: h,
  width: { near_account_id: 40, receiver_name: 28, currency: 10, amount: 12, mobile_phone: 18, email: 40 }[h],
  style: TEXT_COLUMNS.has(h) ? { numFmt: '@' } : {},
}));
for (const r of rows) sheet.addRow(Object.fromEntries(HEADERS.map((h, i) => [h, String(r[i] ?? '')])));
const head = sheet.getRow(1);
head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A3C90' } };
sheet.autoFilter = { from: 'A1', to: 'F1' };
for (const h of TEXT_COLUMNS) {
  const col = sheet.getColumn(h);
  col.eachCell({ includeEmpty: false }, (cell) => { cell.numFmt = '@'; });
}

await wb.xlsx.writeFile(OUT.pathname);
console.log(`wrote public/templates/gajian-payroll-template.xlsx (${rows.length} sample rows)`);
