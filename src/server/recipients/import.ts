/**
 * Recipient-directory bulk import (Phase 19): a file in the payroll format plus a `division`
 * column. The `amount` column is the recipient's MAXIMUM per payout (≤ the workflow's per-row
 * cap). Same reader as payroll uploads (separators, UTF-8, quotes, row numbers) and the same
 * all-or-nothing rule: every problem is reported with its file row and column, nothing is
 * written unless the whole file passes. Each NEAR account may appear once.
 */
import { FIELDS } from '../payroll/validate.ts';
import { fileError, readTable, recordShapeError, reject, type ImportError, type RejectedImport } from '../payroll/import.ts';
import { validateRecipient, type CleanRecipient, type RecipientField } from './directory.ts';

export const DIRECTORY_COLUMNS = [...FIELDS, 'division'] as const;

export interface AcceptedDirectoryImport { ok: true; filename: string; sha256: string; rows: (CleanRecipient & { line: number })[] }

const COLUMN_OF: Record<RecipientField, ImportError['column']> = {
  nearAccountId: 'near_account_id', name: 'receiver_name', division: 'division', email: 'email', mobilePhone: 'mobile_phone', maxAmount: 'amount',
  monthlyNetPay: null, startDate: null, // not in a directory file (set in the form)
};

export function importRecipientFile(input: { filename: string; bytes: Uint8Array; perRowCap: bigint }): AcceptedDirectoryImport | RejectedImport {
  const { filename, bytes, perRowCap } = input;
  const table = readTable(filename, bytes, DIRECTORY_COLUMNS);
  if (!table.ok) return table;
  const { sha256, delimiter, names, data } = table;
  const errors: ImportError[] = [];
  const rows: AcceptedDirectoryImport['rows'] = [];
  const seen = new Map<string, number>();
  for (const rec of data) {
    const shape = recordShapeError(rec, names, delimiter);
    if (shape) { errors.push(shape); continue; }
    const cell = (n: string) => rec.cells[names.indexOf(n)] ?? '';
    const currency = cell('currency').trim();
    if (currency !== 'tUSDC') errors.push({ line: rec.line, record: rec.record, column: 'currency', message: currency ? 'Currency must be tUSDC.' : 'Currency is required.' });
    const v = validateRecipient({
      nearAccountId: cell('near_account_id'), name: cell('receiver_name'), division: cell('division'),
      email: cell('email'), mobilePhone: cell('mobile_phone'), maxAmount: cell('amount'),
    }, perRowCap);
    if (!v.ok) {
      for (const e of v.errors) errors.push({ line: rec.line, record: rec.record, column: COLUMN_OF[e.field], message: e.field === 'maxAmount' ? `${e.message} (In a directory file, amount is the maximum per payout.)` : e.message });
      continue;
    }
    const first = seen.get(v.value.nearAccountId);
    if (first !== undefined) {
      errors.push({ line: rec.line, record: rec.record, column: 'near_account_id', message: `This NEAR account is already on row ${first}. Each recipient appears once.` });
      continue;
    }
    seen.set(v.value.nearAccountId, rec.line);
    if (currency === 'tUSDC') rows.push({ ...v.value, line: rec.line });
  }
  if (errors.length) return reject(filename, sha256, errors, data.length);
  if (!rows.length) return reject(filename, sha256, [fileError('The file has no recipients.')], data.length);
  return { ok: true, filename, sha256, rows };
}
