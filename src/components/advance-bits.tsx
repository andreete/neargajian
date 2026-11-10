/**
 * Payroll Advance display pieces (Phase 23), server components: status and kind chips, the terms,
 * the repayment schedule, the eligibility checks and the per-row instalment table (gross,
 * "Payroll Advance instalment", net). Amounts via displayAmount; months in UTC.
 */
import type { ReactNode } from 'react';
import type { AdvanceStatus } from '@/server/db/schema';
import type { Eligibility } from '@/server/advance/eligibility';
import type { ScheduleItem } from '@/server/advance/service';
import { monthLabel } from '@/server/advance/terms';
import { displayAmount } from '@/lib/format';
import { AlertIcon, CheckIcon, ClockIcon, InfoIcon, SendIcon, WalletIcon, XIcon } from './icons';

const STATUS: Record<AdvanceStatus, { label: string; tone: string; icon: ReactNode }> = {
  requested: { label: 'Requested', tone: 'waiting', icon: <ClockIcon size={13} /> },
  declined: { label: 'Declined', tone: 'danger', icon: <XIcon size={13} /> },
  submitted: { label: 'Submitted', tone: 'info', icon: <SendIcon size={13} /> },
  approved: { label: 'Approved', tone: 'info', icon: <CheckIcon size={13} /> },
  paid: { label: 'Paid', tone: 'success', icon: <CheckIcon size={13} /> },
  repaid: { label: 'Repaid', tone: 'success', icon: <CheckIcon size={13} /> },
  rejected: { label: 'Rejected', tone: 'danger', icon: <XIcon size={13} /> },
  cancelled: { label: 'Cancelled', tone: 'neutral', icon: <XIcon size={13} /> },
  failed: { label: 'Payout failed', tone: 'danger', icon: <AlertIcon size={13} /> },
};

export function AdvanceStatusChip({ status }: { status: AdvanceStatus }) {
  const s = STATUS[status];
  return <span className={`chip chip-${s.tone}`} data-testid="advance-status">{s.icon}{s.label}</span>;
}

/** "Payroll Advance" label on runs, lines and history. */
export function AdvanceKindChip() {
  return <span className="chip chip-testnet" data-testid="advance-kind"><WalletIcon size={13} />Payroll Advance</span>;
}

export function TermsList({ amount, fee, net, instalment, last, count, feeBps }: { amount: bigint; fee: bigint; net: bigint; instalment: bigint; last: bigint; count: number; feeBps: number }) {
  return (
    <dl className="kv confirm-kv" data-testid="advance-terms">
      <dt>Advance (repaid like a loan)</dt><dd className="num">{displayAmount(amount)} tUSDC</dd>
      <dt>Fee ({(feeBps / 100).toFixed(2).replace(/\.?0+$/, '')}%, taken at payout)</dt><dd className="num">{displayAmount(fee)} tUSDC</dd>
      <dt>Paid out now</dt><dd className="num"><strong>{displayAmount(net)} tUSDC</strong></dd>
      <dt>Repayment</dt><dd className="num">{count} monthly instalments of {displayAmount(instalment)} tUSDC{last !== instalment ? ` (last one ${displayAmount(last)})` : ''}, deducted from payroll</dd>
    </dl>
  );
}

const SCHEDULE_STATUS: Record<ScheduleItem['status'], { label: string; tone: string }> = {
  repaid: { label: 'Repaid', tone: 'success' }, pending: { label: 'In a payroll run', tone: 'info' }, due: { label: 'Due', tone: 'waiting' }, upcoming: { label: 'Upcoming', tone: 'neutral' },
};

export function ScheduleTable({ items, caption }: { items: ScheduleItem[]; caption: string }) {
  return (
    <div className="table-wrap" role="region" aria-label={caption} tabIndex={0}>
      <table className="data" data-testid="advance-schedule">
        <caption className="sr-only">{caption}</caption>
        <thead><tr><th scope="col">Instalment</th><th scope="col">Expected month</th><th scope="col" className="amount">Amount (tUSDC)</th><th scope="col">Status</th></tr></thead>
        <tbody>{items.map((i) => (
          <tr key={i.n}><td>{i.n} of {items.length}</td><td>{monthLabel(i.month)}</td><td className="amount">{displayAmount(i.amount)}</td><td><span className={`chip chip-${SCHEDULE_STATUS[i.status].tone}`}>{SCHEDULE_STATUS[i.status].label}</span></td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/** Expected months as plain items (offer, maker queue, approver note). */
export function MonthsList({ months, amounts }: { months: string[]; amounts: bigint[] }) {
  return <ol className="months-list">{months.map((m, i) => <li key={m}><span>{monthLabel(m)}</span><span className="num">{displayAmount(amounts[i] ?? 0n)} tUSDC</span></li>)}</ol>;
}

export function EligibilityList({ e, title }: { e: Eligibility; title: string }) {
  return (
    <div className="eligibility" data-testid="advance-eligibility">
      <p className="eligibility-title"><strong>{title}</strong> {e.eligible ? <span className="chip chip-success"><CheckIcon size={13} />Eligible</span> : <span className="chip chip-danger"><AlertIcon size={13} />Not eligible</span>}</p>
      <ul className="check-list">
        {e.checks.map((c) => (
          <li key={c.key} className={c.ok ? 'ok' : 'bad'}>{c.ok ? <CheckIcon size={15} /> : <AlertIcon size={15} />}<span><strong>{c.label}</strong><span className="hint">{c.detail}</span></span></li>
        ))}
      </ul>
    </div>
  );
}

export interface InstalmentRow { rowIndex: number; line?: number | null; name: string; gross: bigint; instalment: bigint; net: bigint; carried?: bigint; month?: string }

/** Per row: gross pay, Payroll Advance instalment and net pay (the amount committed on-chain). */
export function InstalmentTable({ rows, title, note }: { rows: InstalmentRow[]; title: string; note: ReactNode }) {
  const sum = (k: 'gross' | 'instalment' | 'net') => rows.reduce((s, r) => s + r[k], 0n);
  return (
    <section className="card" aria-labelledby="instalments-h" data-testid="advance-instalments">
      <div className="panel-title"><h2 id="instalments-h">{title}</h2><AdvanceKindChip /></div>
      <div className="panel-body"><p className="hint"><InfoIcon size={14} /> {note}</p></div>
      <div className="table-wrap" role="region" aria-labelledby="instalments-h" tabIndex={0}>
        <table className="data">
          <thead><tr><th scope="col">Row</th><th scope="col">Recipient</th><th scope="col" className="amount">Gross pay (tUSDC)</th><th scope="col" className="amount">Payroll Advance instalment</th><th scope="col" className="amount">Net pay (tUSDC)</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.rowIndex}>
              <td className="num">{r.line ?? r.rowIndex + 1}</td>
              <td>{r.name}{r.carried ? <div className="sub">{displayAmount(r.carried)} tUSDC carries over to next month (50% rule)</div> : null}</td>
              <td className="amount">{displayAmount(r.gross)}</td>
              <td className="amount">−{displayAmount(r.instalment)}</td>
              <td className="amount"><strong>{displayAmount(r.net)}</strong></td>
            </tr>
          ))}</tbody>
          <tfoot><tr><th scope="row" colSpan={2}>Total of these rows</th><td className="amount">{displayAmount(sum('gross'))}</td><td className="amount">−{displayAmount(sum('instalment'))}</td><td className="amount"><strong>{displayAmount(sum('net'))}</strong></td></tr></tfoot>
        </table>
      </div>
    </section>
  );
}

export const DISCLOSURE = 'Payroll Advance is a salary advance from your employer. It works like a loan: you receive the advance minus a fee now, and you repay the full advance in equal monthly instalments that are deducted from your payroll.';

/** Run page (maker and approvers): this run pays a Payroll Advance. */
export function AdvanceRunNote({ view }: { view: import('@/server/advance/service').RunAdvanceView }) {
  const a = view.advance;
  const amounts = Array.from({ length: a.instalmentCount }, (_, i) => (i === a.instalmentCount - 1 ? a.lastInstalment : a.instalment));
  const feeBps = (JSON.parse(a.policySnapshot) as { feeBps: number }).feeBps;
  return (
    <section className="card advance-note" aria-labelledby="advance-note-h" data-testid="advance-run-note">
      <div className="panel-title"><h2 id="advance-note-h">Payroll Advance for {view.name}</h2><span className="chips"><AdvanceKindChip /><AdvanceStatusChip status={a.status} /></span></div>
      <div className="panel-body stack">
        <p>This run pays a <strong>salary advance repaid like a loan</strong>: {view.name} owes {displayAmount(a.amount)} tUSDC, receives {displayAmount(a.net)} tUSDC now (the {displayAmount(a.fee)} tUSDC fee stays in the vault) and repays it in {a.instalmentCount} monthly instalments deducted from payroll.{a.reason ? ` Reason given: “${a.reason}”.` : ''} Consent “{a.consentText}” recorded with the request.</p>
        {view.problemNow ? <div className="callout callout-warn" role="alert" data-testid="advance-problem"><AlertIcon size={18} /><span>{view.problemNow}</span></div> : null}
        <div className="grid-2">
          <div className="stack">
            <TermsList amount={a.amount} fee={a.fee} net={a.net} instalment={a.instalment} last={a.lastInstalment} count={a.instalmentCount} feeBps={feeBps} />
            <div><p className="hint">Repayment schedule (expected months; it starts with the first payroll after the payout)</p><MonthsList months={view.months} amounts={amounts} /></div>
          </div>
          <div className="stack">
            {view.eligibilityNow ? <EligibilityList e={view.eligibilityNow} title="Eligibility re-checked now" /> : null}
            <p className="hint">Eligible at the request ({view.eligibilityAtRequest.at.slice(0, 16).replace('T', ' ')} UTC, maximum {displayAmount(BigInt(view.eligibilityAtRequest.max))} tUSDC: {view.eligibilityAtRequest.maxBasis}){view.eligibilityAtSubmit ? ` and when the maker submitted it (${view.eligibilityAtSubmit.at.slice(0, 16).replace('T', ' ')} UTC)` : ''}.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
