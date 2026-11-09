/**
 * Payroll file importer (CSV or tab-delimited TXT, UTF-8, up to 1,000 data records, 2 MiB).
 * All-or-nothing: the file is accepted only if every record passes; otherwise every problem
 * is reported with its spreadsheet row (physical line), column and reason, and nothing is
 * written. Handles regional Excel exports: the separator (`,` `;` or tab) is detected from the
 * header row, and comma decimals get a specific fix-it message.
 */
import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { FIELD_LABEL, FIELDS, validateRow, type Field, type Limits, type RawRow, type RecipientRule, type ValidRow } from './validate.ts';

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_DATA_ROWS = 1000;
export const ALLOWED_EXTENSIONS = ['.csv', '.txt', '.tsv'] as const;

export type Delimiter = ',' | ';' | '\t';
export const DELIMITER_LABEL: Record<Delimiter, string> = { ',': 'comma', ';': 'semicolon', '\t': 'tab' };

export interface ImportError {
  /** Spreadsheet row: the physical line where the record starts (header = row 1). */
  line: number | null;
  /** 1-based data record ordinal (null for file-level problems). */
  record: number | null;
  column: Field | 'division' | null;
  message: string;
}

export interface AcceptedImport {
  ok: true;
  filename: string;
  sha256: string;
  delimiter: Delimiter;
  rows: { raw: RawRow; valid: ValidRow; line: number }[];
  total: bigint;
  duplicateWallets: { accountId: string; lines: number[] }[];
}

export interface RejectedImport {
  ok: false;
  filename: string;
  sha256: string | null;
  errors: ImportError[];
  /** Records seen (when the file could be parsed). */
  recordCount: number | null;
}

export type ImportResult = AcceptedImport | RejectedImport;

export const reject = (filename: string, sha256: string | null, errors: ImportError[], recordCount: number | null = null): RejectedImport =>
  ({ ok: false, filename, sha256, errors, recordCount });
export const fileError = (message: string): ImportError => ({ line: null, record: null, column: null, message });

function detectDelimiter(headerLine: string, columns: readonly string[]): Delimiter | null {
  const candidates: Delimiter[] = ['\t', ';', ','];
  for (const d of candidates) {
    const names = headerLine.split(d).map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase());
    if (names.length === columns.length && columns.every((f) => names.includes(f))) return d;
  }
  // Fall back to the most frequent separator so header errors can still be reported.
  const counts = candidates.map((d) => [d, headerLine.split(d).length - 1] as const).sort((a, b) => b[1] - a[1]);
  return counts[0] && counts[0][1] > 0 ? counts[0][0] : null;
}

const COUNT_WORD: Record<number, string> = { 6: 'six', 7: 'seven' };

/** A data record with its physical start line (header = line 1). */
export interface LocatedRecord { cells: string[]; line: number; record: number }

export interface ReadTable {
  ok: true;
  sha256: string;
  delimiter: Delimiter;
  names: string[];
  data: LocatedRecord[];
}

/**
 * Shared file reader (payroll files and the recipient-directory import): extension, size,
 * strict UTF-8, separator detection, RFC 4180 parsing with line numbers, the exact header set,
 * trailing empty records and the row limit. Row-level validation is the caller's.
 */
export function readTable(filename: string, bytes: Uint8Array, columns: readonly string[], maxRows = MAX_DATA_ROWS): ReadTable | RejectedImport {
  const lower = filename.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return reject(filename, null, [fileError('Upload a .csv or .txt file. For Excel, use Save As → CSV UTF-8 or Text (Tab delimited).')]);
  }
  if (bytes.length === 0) return reject(filename, null, [fileError('The file is empty.')]);
  if (bytes.length > MAX_FILE_BYTES) return reject(filename, null, [fileError(`The file is larger than 2 MB (${(bytes.length / 1024 / 1024).toFixed(1)} MB).`)]);
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return reject(filename, sha256, [fileError('The file is not UTF-8. In Excel use Save As → CSV UTF-8 (Comma delimited) or Text (Tab delimited).')]);
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (!text.trim()) return reject(filename, sha256, [fileError('The file is empty.')]);

  const headerLine = text.split(/\r\n|\n|\r/, 1)[0] ?? '';
  const delimiter = detectDelimiter(headerLine, columns);
  if (!delimiter) return reject(filename, sha256, [fileError(`The header row must contain the ${COUNT_WORD[columns.length] ?? columns.length} column names separated by commas, semicolons or tabs.`)]);

  let records: { record: string[]; info: { lines: number } }[];
  try {
    records = parse(text, {
      delimiter, relax_column_count: true, skip_empty_lines: false, info: true, bom: true,
      relax_quotes: delimiter === '\t', quote: '"',
    }) as unknown as { record: string[]; info: { lines: number } }[];
  } catch (error) {
    const lines = (error as { lines?: number }).lines;
    const reason = (error as Error).message.replace(/^Invalid Record Length.*|^.*?: /, '').slice(0, 160);
    return reject(filename, sha256, [{ line: lines ?? null, record: null, column: null, message: `The file is not valid CSV${lines ? ` near row ${lines}` : ''}: ${reason}. Check for a missing closing quote.` }]);
  }

  // Physical start line of each record: previous record's end line + 1 (header starts at 1).
  let prevEnd = 0;
  const located = records.map((r) => {
    const start = prevEnd + 1;
    prevEnd = r.info.lines;
    return { cells: r.record, line: start };
  });

  const header = located[0];
  if (!header) return reject(filename, sha256, [fileError('The file is empty.')]);
  const names = header.cells.map((h) => h.trim().toLowerCase());
  const headerErrors: ImportError[] = [];
  const seen = new Set<string>();
  for (const n of names) {
    if (!n) headerErrors.push({ line: 1, record: null, column: null, message: 'A header cell is empty.' });
    else if (!columns.includes(n)) headerErrors.push({ line: 1, record: null, column: null, message: `Unknown column "${n.slice(0, 40)}".` });
    else if (seen.has(n)) headerErrors.push({ line: 1, record: null, column: null, message: `Column "${n}" appears twice.` });
    seen.add(n);
  }
  for (const f of columns) if (!seen.has(f)) headerErrors.push({ line: 1, record: null, column: f as Field | 'division', message: `Missing column "${f}".` });
  if (headerErrors.length) return reject(filename, sha256, headerErrors);

  // Ignore only trailing empty records.
  let data = located.slice(1);
  while (data.length && isEmptyRecord(data[data.length - 1]!.cells)) data = data.slice(0, -1);
  if (data.length === 0) return reject(filename, sha256, [fileError('The file has a header but no payroll rows.')], 0);
  if (data.length > maxRows) {
    return reject(filename, sha256, [fileError(`The file has ${data.length.toLocaleString('en-US')} rows. The maximum is ${maxRows.toLocaleString('en-US')} per run; split it into two runs.`)], data.length);
  }
  return { ok: true, sha256, delimiter, names, data: data.map((d, i) => ({ ...d, record: i + 1 })) };
}

export const isEmptyRecord = (cells: string[]) => cells.every((c) => c.trim() === '');

/** Empty rows in the middle and wrong cell counts (with the comma-decimal special case). */
export function recordShapeError(rec: LocatedRecord, names: string[], delimiter: Delimiter): ImportError | null {
  const { cells, line, record } = rec;
  if (isEmptyRecord(cells)) return { line, record, column: null, message: 'This row is empty. Remove empty rows between payroll rows.' };
  if (cells.length === names.length) return null;
  // A comma decimal in an unquoted comma-separated file splits the amount into two cells.
  const a = names.indexOf('amount');
  const commaDecimal = delimiter === ',' && cells.length === names.length + 1 && a >= 0
    && /^\s*\d+\s*$/.test(cells[a] ?? '') && /^\d{1,6}\s*$/.test(cells[a + 1] ?? '');
  return commaDecimal
    ? { line, record, column: 'amount', message: 'Use a dot as the decimal separator, e.g. 1500.50' }
    : { line, record, column: null, message: `This row has ${cells.length} cells; expected ${names.length}. Check for an extra or missing separator.` };
}

export function importPayrollFile(input: { filename: string; bytes: Uint8Array; limits: Limits; directory?: RecipientRule }): ImportResult {
  const { filename, bytes, limits } = input;
  const table = readTable(filename, bytes, FIELDS);
  if (!table.ok) return table;
  const { sha256, delimiter, names, data } = table;

  const errors: ImportError[] = [];
  const accepted: AcceptedImport['rows'] = [];
  data.forEach((rec, i) => {
    const shape = recordShapeError(rec, names, delimiter);
    if (shape) return void errors.push(shape);
    const { cells, line, record } = rec;
    const raw = Object.fromEntries(names.map((n, k) => [n, cells[k] ?? ''])) as RawRow;
    const result = validateRow(raw, i, limits, input.directory);
    for (const e of result.errors) errors.push({ line, record, column: e.field, message: e.field === 'receiver_name' && /control/.test(e.message) ? 'Receiver name contains a line break or control character.' : e.message });
    if (result.valid) accepted.push({ raw, valid: result.valid, line });
  });

  let total = 0n;
  for (const r of accepted) total += r.valid.amount;
  if (!errors.length && total > limits.maxRunTotal) errors.push(fileError('The file total is above the per-run cap.'));
  if (errors.length) return reject(filename, sha256, errors, data.length);

  const byWallet = new Map<string, number[]>();
  for (const r of accepted) byWallet.set(r.valid.accountId, [...(byWallet.get(r.valid.accountId) ?? []), r.line]);
  return {
    ok: true, filename, sha256, delimiter, rows: accepted, total,
    duplicateWallets: [...byWallet].filter(([, l]) => l.length > 1).map(([accountId, lines]) => ({ accountId, lines })),
  };
}

/** One-line summary in the style "Row 61: invalid NEAR account ID. Fix the file and upload it again." */
export function firstErrorSentence(errors: ImportError[]): string {
  const e = errors[0];
  if (!e) return '';
  const msg = e.message.replace(/\.$/, '');
  const lowered = msg.charAt(0).toLowerCase() + msg.slice(1);
  return e.line && e.record ? `Row ${e.line}: ${lowered.replace(/^nEAR/, 'NEAR')}. Fix the file and upload it again.` : `${msg}. Fix the file and upload it again.`;
}

export { FIELD_LABEL };
