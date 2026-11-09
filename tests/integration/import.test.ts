/** Phase 09: importer rules (A03) and the upload API (atomic acceptance, role scoping). */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { firstErrorSentence, importPayrollFile, type ImportResult } from '@/server/payroll/import';
import { errorReportCsv } from '@/server/payroll/error-report';
import { HEADERS, toDelimited, validRows, withInvalidRow } from '@/server/fixtures/payroll';

const LIMITS = { maxRowAmount: 1_000_000n, maxRunTotal: 100_000_000n };
const enc = (s: string) => new TextEncoder().encode(s);
const imp = (text: string, filename = 'payroll.csv'): ImportResult => importPayrollFile({ filename, bytes: enc(text), limits: LIMITS });
const tpl = (f: string) => readFileSync(new URL(`../../public/templates/${f}`, import.meta.url));
const rejectedErrors = (r: ImportResult) => (r.ok ? [] : r.errors);

describe('importer (A03)', () => {
  it('accepts the three sample files with their exact totals (docs/SAMPLE-DATA.md)', () => {
    for (const [file, total] of [['gajian-payroll-sample-1000.csv', 56_690_860n], ['gajian-payroll-sample-1000.txt', 56_690_860n], ['gajian-payroll-uniform-1000.csv', 10_000_000n]] as const) {
      const r = importPayrollFile({ filename: file, bytes: tpl(file), limits: LIMITS });
      expect(r.ok, file).toBe(true);
      if (r.ok) {
        expect(r.rows).toHaveLength(1000);
        expect(r.total).toBe(total);
        expect(r.rows[0]?.line).toBe(2);
        expect(r.rows[999]?.line).toBe(1001);
      }
    }
  });

  it('accepts 1,000 rows and rejects 1,001 without partial acceptance', () => {
    expect(imp(toDelimited(validRows(1000))).ok).toBe(true);
    const r = imp(toDelimited(validRows(1001)));
    expect(r.ok).toBe(false);
    expect(rejectedErrors(r)[0]?.message).toBe('The file has 1,001 rows. The maximum is 1,000 per run; split it into two runs.');
  });

  it('rejects the whole file for one invalid row after row 50, with its spreadsheet row and column', () => {
    const r = imp(toDelimited(withInvalidRow(validRows(120), 54, 'bad_account')));
    expect(r.ok).toBe(false);
    expect(rejectedErrors(r)).toEqual([{ line: 56, record: 55, column: 'near_account_id', message: 'Invalid NEAR account ID.' }]);
    expect(firstErrorSentence(rejectedErrors(r))).toBe('Row 56: invalid NEAR account ID. Fix the file and upload it again.');
  });

  it('reports malformed CSV (unclosed quote) as a file-level error', () => {
    const r = imp(`${HEADERS.join(',')}\r\nabc.testnet,"Unclosed name,tUSDC,0.05,+447700900001,a@example.com\r\n`);
    expect(r.ok).toBe(false);
    expect(rejectedErrors(r)[0]?.message).toMatch(/^The file is not valid CSV/);
  });

  it('parses quoted multiline fields and keeps the physical line numbers of later rows', () => {
    const rows = validRows(3);
    const text = `${HEADERS.join(',')}\r\n${rows[0]!.near_account_id},"Emma\r\nClark",tUSDC,0.05,+447700900001,emma@example.com\r\n${toDelimited(rows.slice(1)).split('\r\n').slice(1).join('\r\n')}`;
    const r = imp(text);
    expect(r.ok).toBe(false);
    expect(rejectedErrors(r)).toEqual([{ line: 2, record: 1, column: 'receiver_name', message: 'Receiver name contains a line break or control character.' }]);
    const fixed = imp(text.replace('Emma\r\nClark', 'Emma Clark, CPA'));
    expect(fixed.ok).toBe(true);
    if (fixed.ok) expect(fixed.rows.map((x) => x.line)).toEqual([2, 3, 4]);
    const multi = imp(text.replace('"Emma\r\nClark"', '"Emma ""Em"" Clark"'));
    expect(multi.ok && multi.rows[0]?.raw.receiver_name).toBe('Emma "Em" Clark');
  });

  it('rejects a wrong currency', () => {
    expect(rejectedErrors(imp(toDelimited(withInvalidRow(validRows(5), 2, 'wrong_currency'))))[0]).toMatchObject({ line: 4, column: 'currency', message: 'Currency must be tUSDC.' });
  });

  it('handles regional Excel settings: semicolons detected, comma decimals explained', () => {
    const semi = toDelimited(validRows(10), { delimiter: ';' });
    const r = imp(semi);
    expect(r.ok && r.delimiter).toBe(';');
    const comma = imp(toDelimited(withInvalidRow(validRows(10), 3, 'comma_decimal'), { delimiter: ';' }));
    expect(rejectedErrors(comma)[0]).toMatchObject({ line: 5, column: 'amount', message: 'Use a dot as the decimal separator, e.g. 1500.50' });
  });

  it('explains a comma decimal that split a comma-separated row', () => {
    const lines = toDelimited(validRows(4)).split('\r\n');
    lines[2] = lines[2]!.replace(/,tUSDC,0\.(\d+),/, ',tUSDC,0,$1,');
    expect(rejectedErrors(imp(lines.join('\r\n')))[0]).toMatchObject({ line: 3, column: 'amount', message: 'Use a dot as the decimal separator, e.g. 1500.50' });
  });

  it('accepts BOM, LF line endings and tab-delimited TXT', () => {
    expect(imp(toDelimited(validRows(5), { bom: true, crlf: false })).ok).toBe(true);
    const tsv = imp(toDelimited(validRows(5), { delimiter: '\t' }), 'payroll.txt');
    expect(tsv.ok && tsv.delimiter).toBe('\t');
  });

  it('rejects header problems, empty files, non-UTF-8, wrong extensions and oversize files', () => {
    const body = toDelimited(validRows(2)).split('\r\n').slice(1).join('\r\n');
    expect(rejectedErrors(imp(`near_account_id,receiver_name,currency,amount,mobile_phone\r\n${body}`)).map((e) => e.message)).toContain('Missing column "email".');
    expect(rejectedErrors(imp(`near_account_id,receiver_name,currency,amount,mobile_phone,email,iban\r\n`)).map((e) => e.message)).toContain('Unknown column "iban".');
    expect(rejectedErrors(imp(`near_account_id,receiver_name,currency,amount,amount,email\r\n`)).map((e) => e.message)).toContain('Column "amount" appears twice.');
    expect(rejectedErrors(imp(''))[0]?.message).toBe('The file is empty.');
    expect(rejectedErrors(imp(`${HEADERS.join(',')}\r\n\r\n\r\n`))[0]?.message).toBe('The file has a header but no payroll rows.');
    expect(rejectedErrors(importPayrollFile({ filename: 'p.csv', bytes: new Uint8Array([0xff, 0xfe, 0x00]), limits: LIMITS }))[0]?.message).toMatch(/not UTF-8/);
    expect(rejectedErrors(imp(toDelimited(validRows(2)), 'payroll.xlsx'))[0]?.message).toMatch(/Upload a \.csv or \.txt/);
    expect(rejectedErrors(importPayrollFile({ filename: 'p.csv', bytes: new Uint8Array(2 * 1024 * 1024 + 1), limits: LIMITS }))[0]?.message).toMatch(/larger than 2 MB/);
  });

  it('ignores only trailing empty records', () => {
    const rows = toDelimited(validRows(3));
    expect(imp(`${rows}\r\n\r\n,,,,,\r\n`).ok).toBe(true);
    const lines = rows.split('\r\n');
    const middle = imp([lines[0], lines[1], '', lines[2], lines[3], ''].join('\r\n'));
    expect(rejectedErrors(middle)[0]).toMatchObject({ line: 3, message: 'This row is empty. Remove empty rows between payroll rows.' });
  });

  it('flags the same wallet twice as a warning and the run cap as an error', () => {
    const rows = validRows(3);
    rows[2] = { ...rows[2]!, near_account_id: rows[0]!.near_account_id };
    const r = imp(toDelimited(rows));
    expect(r.ok && r.duplicateWallets).toEqual([{ accountId: rows[0]!.near_account_id, lines: [2, 4] }]);
    const big = imp(toDelimited(Array.from({ length: 101 }, (_, i) => ({ ...validRows(101)[i]!, amount: '1' }))));
    expect(rejectedErrors(big)[0]?.message).toBe('The file total is above the per-run cap.');
  });

  it('error report escapes spreadsheet formulas and carries no row contents', () => {
    const csv = errorReportCsv('=evil.csv', [{ line: 61, record: 60, column: 'near_account_id', message: 'Invalid NEAR account ID.' }, { line: 7, record: 6, column: 'receiver_name', message: '@SUM(A1)' }]);
    expect(csv.startsWith('﻿file,spreadsheet_row,data_row,column,problem\r\n')).toBe(true);
    expect(csv).toContain("'=evil.csv,61,60,near_account_id,Invalid NEAR account ID.");
    expect(csv).toContain("'@SUM(A1)");
  });
});

describe('Excel template', () => {
  it('is macro-free, has instructions and 1,000 sample rows with Text-formatted account, amount and phone', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const bytes = tpl('gajian-payroll-template.xlsx');
    await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Instructions', 'Payroll']);
    const text = wb.getWorksheet('Instructions')!.getColumn(1).values.join(' ');
    expect(text).toContain('Text (Tab delimited)');
    expect(text).toMatch(/dot as the decimal separator/i);
    const sheet = wb.getWorksheet('Payroll')!;
    expect(sheet.getRow(1).values).toEqual([undefined, ...HEADERS]);
    expect(sheet.rowCount).toBe(1001);
    for (const col of ['A', 'D', 'E']) {
      const cell = sheet.getCell(`${col}2`);
      expect(cell.numFmt, col).toBe('@');
      expect(typeof cell.value, col).toBe('string');
    }
    expect(sheet.getCell('E2').value).toBe('+44 7700 900000');
    expect(sheet.getCell('D2').value).toBe('0.05');
    expect(tpl('gajian-payroll-template.xlsx').includes(Buffer.from('vbaProject'))).toBe(false);
  });
});

// ------------------------------------------------------------------ upload API

const BASE = 'http://127.0.0.1:8092';
const dir = mkdtempSync(join(tmpdir(), 'gajian-upload-'));
process.env.DATABASE_URL = `file:${join(dir, 'u.sqlite')}`;
process.env.DEMO_MODE = 'true';
process.env.APP_BASE_URL = BASE;
type H = (r: Request, c?: unknown) => Promise<Response>;
let db: import('@/server/db/client').Db;
let upload: { POST: H }, runs: { POST: H }, draft: { GET: H };
let n = 0;

beforeAll(async () => {
  db = (await import('@/server/db/client')).getDb();
  await (await import('@/server/db/seed')).seedDemo(db);
  upload = (await import('@/app/api/runs/[runId]/upload/route')) as unknown as typeof upload;
  runs = (await import('@/app/api/runs/route')) as unknown as typeof runs;
  draft = (await import('@/app/api/runs/[runId]/draft/route')) as unknown as typeof draft;
});
afterAll(async () => {
  (await import('@/server/db/client')).closeDatabase();
  rmSync(dir, { recursive: true, force: true });
});

async function as(email: string) {
  const login = (await import('@/app/api/auth/login/route')) as unknown as { POST: H };
  n += 1;
  const res = await login.POST(new Request(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE, 'x-forwarded-for': `10.7.0.${n}` }, body: JSON.stringify({ email, password: '12345678' }) }));
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  const { readSession, parseCookies, SESSION_COOKIE } = await import('@/server/auth/session');
  const csrf = readSession(db, parseCookies(cookie)[SESSION_COOKIE], new Date())?.csrfToken ?? '';
  return {
    json: (path: string, method: string, body: unknown) => new Request(`${BASE}${path}`, { method, headers: { cookie, origin: BASE, 'x-csrf-token': csrf, 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    get: (path: string) => new Request(`${BASE}${path}`, { headers: { cookie } }),
    file: (path: string, name: string, content: string | Uint8Array, rev: number) => {
      const form = new FormData();
      form.set('file', new File([content as BlobPart], name));
      form.set('expectedRevision', String(rev));
      return new Request(`${BASE}${path}`, { method: 'POST', headers: { cookie, origin: BASE, 'x-csrf-token': csrf }, body: form });
    },
  };
}
const ctx = (runId: string) => ({ params: Promise.resolve({ runId }) });

describe('upload API', () => {
  it('accepts a file atomically, and a failed replacement preserves the earlier draft', async () => {
    const maker = await as('maker@gajian.my.id');
    const { id } = (await (await runs.POST(maker.json('/api/runs', 'POST', { title: 'Upload run', postingMode: 'detailed', source: 'upload' }))).json()) as { id: string };
    const ok = await upload.POST(maker.file(`/api/runs/${id}/upload`, 'gajian-payroll-sample-1000.csv', tpl('gajian-payroll-sample-1000.csv'), 0), ctx(id));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ accepted: true, rowCount: 1000, total: '56.690860', revision: 1, delimiter: 'comma' });

    const bad = await upload.POST(maker.file(`/api/runs/${id}/upload`, 'broken.csv', toDelimited(withInvalidRow(validRows(80), 59, 'bad_account')), 1), ctx(id));
    expect(bad.status).toBe(422);
    expect(await bad.json()).toMatchObject({ accepted: false, revision: 1, errorCount: 1, summary: 'Row 61: invalid NEAR account ID. Fix the file and upload it again.' });

    const view = (await (await draft.GET(maker.get(`/api/runs/${id}/draft`), ctx(id))).json()) as { run: { draftFilename: string; draftRevision: number }; rows: { sourceLine: number }[]; summary: { validTotal: string } };
    expect(view.run).toMatchObject({ draftFilename: 'gajian-payroll-sample-1000.csv', draftRevision: 1 });
    expect(view.rows).toHaveLength(1000);
    expect(view.rows[49]?.sourceLine).toBe(51);
    expect(view.summary.validTotal).toBe('56.690860');

    expect((await upload.POST(maker.file(`/api/runs/${id}/upload`, 'again.csv', toDelimited(validRows(3)), 0), ctx(id))).status).toBe(409);
  });

  it('only the run maker can upload', async () => {
    const maker = await as('maker@gajian.my.id');
    const { id } = (await (await runs.POST(maker.json('/api/runs', 'POST', { title: 'Scoped', postingMode: 'detailed', source: 'upload' }))).json()) as { id: string };
    for (const email of ['app1@gajian.my.id', 'admin@gajian.my.id']) {
      const u = await as(email);
      expect((await upload.POST(u.file(`/api/runs/${id}/upload`, 'p.csv', toDelimited(validRows(2)), 0), ctx(id))).status).toBe(403);
    }
    const manual = (await (await runs.POST(maker.json('/api/runs', 'POST', { title: 'Manual', postingMode: 'detailed', source: 'manual' }))).json()) as { id: string };
    expect((await upload.POST(maker.file(`/api/runs/${manual.id}/upload`, 'p.csv', toDelimited(validRows(2)), 0), ctx(manual.id))).status).toBe(422);
  });
});
