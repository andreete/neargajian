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

import type { Recipient } from '../recipients/directory.ts';
import { READINESS_LABEL } from '../recipients/readiness.ts';

export function recipientJson(r: Recipient) {
  return {
    id: r.id, nearAccountId: r.nearAccountId, name: r.name, division: r.division, email: r.email, mobilePhone: r.mobilePhone,
    maxAmount: formatAmount(r.maxAmount), active: r.active, sample: r.sample,
    readiness: r.readiness, readinessLabel: READINESS_LABEL[r.readiness], readinessCheckedAt: r.readinessCheckedAt?.toISOString() ?? null,
    updatedAt: r.updatedAt.getTime(),
  };
}
