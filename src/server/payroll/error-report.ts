/**
 * Downloadable error report for a rejected file (CSV, UTF-8 with BOM so Excel opens it
 * correctly). Spreadsheet formula injection is neutralised: any cell starting with
 * = + - @ or a control character is prefixed with an apostrophe. Contains only row numbers,
 * column names and reasons, never the private contents of a row.
 */
export interface ReportError { line: number | null; record: number | null; column: string | null; message: string }

export function escapeCsvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function errorReportCsv(filename: string, errors: ReportError[]): string {
  const lines = [['file', 'spreadsheet_row', 'data_row', 'column', 'problem'].join(',')];
  for (const e of errors) {
    lines.push([filename, e.line === null ? '' : String(e.line), e.record === null ? '' : String(e.record), e.column ?? '', e.message].map(escapeCsvCell).join(','));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}
