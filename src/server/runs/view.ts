/** Derived views of a run detail: row payout states, display status, actionable approval step. */
import type { RunStatus } from '../../components/status-chip.tsx';
import type { RunDetail } from './lifecycle.ts';

export interface RowView { index: number; line: number | null; account: string; name: string; amount: string; status: 'pending' | 'inflight' | 'paid' | 'failed' | 'unknown'; txHash: string | null }

type PaymentInput = Pick<RunDetail, 'version' | 'rows' | 'actions'>;

export function rowStates(d: PaymentInput): RowView[] {
  const latest = new Map<number, (typeof d.actions)[number]>();
  for (const a of d.actions) if (a.kind === 'pay_row' && a.rowIndex !== null) {
    const prev = latest.get(a.rowIndex);
    if (!prev || a.attempt > prev.attempt) latest.set(a.rowIndex, a);
  }
  return d.rows.map((r) => {
    const a = latest.get(r.rowIndex);
    const status = !a ? 'pending' : a.status === 'succeeded' ? 'paid' : a.status === 'failed' ? 'failed' : a.status === 'unknown' ? 'unknown' : 'inflight';
    return { index: r.rowIndex, line: r.sourceLine, account: r.nearAccountId, name: r.receiverName, amount: r.amount.toString(), status, txHash: a?.txHash ?? null };
  });
}

/**
 * One payment state for the whole run page: badge, counters, banner and timeline all read
 * from this, so they can never disagree. "Paid" requires the version to be Paid AND every
 * row confirmed AND confirmed count and total equal to the approved count and total (PRD A06).
 */
export interface PaymentState {
  rows: RowView[];
  status: RunStatus;
  paidCount: number;
  paidTotal: bigint;
  rowCount: number;
  total: bigint;
  /** Every row confirmed and count and total equal the approved version. */
  complete: boolean;
}

export function paymentState(d: PaymentInput): PaymentState {
  const v = d.version;
  const rows = rowStates(d);
  const paid = rows.filter((r) => r.status === 'paid');
  const paidTotal = paid.reduce((s, r) => s + BigInt(r.amount), 0n);
  const rowCount = v?.rowCount ?? rows.length;
  const total = v?.total ?? 0n;
  const complete = rows.length === rowCount && paid.length === rowCount && paidTotal === total;
  let status: RunStatus;
  if (!v) status = 'draft';
  else if (v.status === 'approved') {
    const release = d.actions.filter((a) => a.kind === 'release').at(-1);
    status = release?.status === 'failed' && /funding|Insufficient/i.test(release.error ?? '') ? 'awaiting_funding' : 'approved';
  } else if (v.status === 'paid') status = complete ? 'paid' : 'releasing'; // never "Paid" before every row is confirmed
  else if (v.status === 'releasing') status = rows.some((r) => r.status === 'failed') ? 'needs_attention' : 'releasing';
  else status = v.status;
  return { rows, status, paidCount: paid.length, paidTotal, rowCount, total, complete };
}

/** Run status for display, including the derived "Awaiting funding" and "Needs attention". */
export function displayStatus(d: PaymentInput): RunStatus {
  return paymentState(d).status;
}

/** The approval step this user may act on now, or null. Mirrors the vault's order rules. */
export function actionableStep(d: RunDetail, userId: string): number | null {
  const v = d.version;
  if (!v || v.status !== 'pending_approval') return null;
  const me = d.approvers.find((a) => a.userId === userId);
  if (!me) return null;
  if (d.events.some((e) => e.approverUserId === userId && e.status !== 'failed')) return null;
  if (d.snapshot?.kind === 'two_sequential' && me.step === 2) {
    const firstConfirmed = d.events.some((e) => e.step === 1 && e.decision === 'approve' && e.status === 'confirmed');
    if (!firstConfirmed) return null;
  }
  return me.step;
}
