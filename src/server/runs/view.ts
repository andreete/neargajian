/** Derived views of a run detail: row payout states, display status, actionable approval step. */
import type { RunStatus } from '../../components/status-chip.tsx';
import type { RunDetail } from './lifecycle.ts';

export interface RowView { index: number; line: number | null; account: string; name: string; amount: string; status: 'pending' | 'inflight' | 'paid' | 'failed' | 'unknown'; txHash: string | null }

export function rowStates(d: RunDetail): RowView[] {
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

/** Run status for display, including the derived "Awaiting funding" and "Needs attention". */
export function displayStatus(d: RunDetail): RunStatus {
  const v = d.version;
  if (!v) return 'draft';
  if (v.status === 'approved') {
    const release = d.actions.filter((a) => a.kind === 'release').at(-1);
    if (release?.status === 'failed' && /funding|Insufficient/i.test(release.error ?? '')) return 'awaiting_funding';
  }
  if (v.status === 'releasing' && rowStates(d).some((r) => r.status === 'failed')) return 'needs_attention';
  return v.status;
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
