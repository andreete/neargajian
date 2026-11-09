/** JSON shapes for validation summaries (bigint → exact decimal strings). */
import { formatAmount } from '../money.ts';
import type { ValidationSummary } from '../payroll/validate.ts';

export function summaryJson(s: ValidationSummary) {
  return {
    validCount: s.validCount,
    invalidCount: s.invalidCount,
    validTotal: formatAmount(s.validTotal),
    rows: s.rows.map((r) => ({ index: r.index, valid: Boolean(r.valid), errors: r.errors })),
    duplicateWallets: [...s.duplicateWallets].map(([accountId, indexes]) => ({ accountId, indexes })),
    runErrors: s.runErrors,
  };
}
