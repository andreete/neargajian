import type { Metadata } from 'next';
import { AdvanceRequestForm } from '@/components/advance-request';
import { AdvanceWithdraw } from '@/components/advance-withdraw';
import { AdvanceKindChip, AdvanceStatusChip, DISCLOSURE, EligibilityList, ScheduleTable, TermsList } from '@/components/advance-bits';
import { AlertIcon, InfoIcon, WalletIcon } from '@/components/icons';
import { getDb } from '@/server/db/client';
import { employeeView } from '@/server/advance/service';
import { monthLabel } from '@/server/advance/terms';
import { requireRole } from '@/server/web/page-auth';
import { getConfig } from '@/server/config';
import { hostedMode } from '@/server/hosted';
import { getFaceEngine } from '@/server/identity/face';
import { faceCheckBlocker } from '@/server/identity/face-check';
import { specimenManifest } from '@/server/identity/ktp-reader';
import { displayAmount, formatDateTime, formatUtcCell } from '@/lib/format';
import { TestnetChip, TxLink } from '../history-bits';

export const metadata: Metadata = { title: 'My pay and Payroll Advance' };

/**
 * Employee self-service (Phase 23): only the signed-in employee's own linked recipient. Monthly net
 * pay, the Payroll Advance offer with consent, the outstanding advance and its schedule, the
 * requests with their status, and the employee's own paid lines with explorer links.
 */
export default async function EmployeePage() {
  const session = await requireRole(['employee']);
  const v = employeeView(getDb(), session.user);
  const r = v.recipient;
  const cur = v.current;
  const canRequest = v.eligibility.eligible && !cur;
  const db = getDb();
  // Phase 24: the live camera face check before a request.
  const face = {
    name: r.name,
    blocker: getFaceEngine() ? faceCheckBlocker(db, r.id) : 'The face check is off on this copy: the face models are missing (npm run vision:models).',
    demo: hostedMode().demo,
    standIn: getConfig().cameraStandIn ? { defaultKey: specimenManifest().people.find((p) => p.account === r.nearAccountId)?.key ?? 'impostor' } : null,
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My pay and Payroll Advance</h1>
          <p>{r.name} · {r.division} · <span className="mono">{r.nearAccountId}</span></p>
        </div>
      </div>

      <div className="stats">
        <div className="card stat"><div className="label">Monthly net pay</div><div className="value amount">{r.monthlyNetPay ? displayAmount(r.monthlyNetPay) : '—'}<small>tUSDC</small></div><div className="foot">From the recipient directory</div></div>
        <div className="card stat"><div className="label">You can take now</div><div className="value amount" data-testid="advance-available">{displayAmount(BigInt(v.eligibility.max))}<small>tUSDC</small></div><div className="foot">{v.eligibility.eligible ? `Up to ${v.policy.maxPercent}% of your net pay, capped` : cur ? 'One advance at a time' : 'Not eligible now'}</div></div>
        <div className="card stat"><div className="label">Outstanding advance</div><div className="value amount" data-testid="advance-balance">{cur?.status === 'paid' ? displayAmount(cur.schedule.balance) : '0.00'}<small>tUSDC</small></div><div className="foot">{cur?.status === 'paid' ? `${cur.schedule.left} instalment${cur.schedule.left === 1 ? '' : 's'} left` : 'Nothing to repay'}</div></div>
        <div className="card stat"><div className="label">Start date</div><div className="value sm">{r.startDate ?? '—'}</div><div className="foot">{v.eligibility.daysEmployed !== null ? `${v.eligibility.daysEmployed} days ago` : ''}</div></div>
      </div>

      <div className="stack">
        <section className="card" aria-labelledby="offer-h">
          <div className="panel-title"><h2 id="offer-h">Payroll Advance</h2><AdvanceKindChip /></div>
          <div className="panel-body stack">
            <div className="callout" role="note" data-testid="advance-disclosure"><InfoIcon size={18} /><span><strong>Repaid like a loan.</strong> {DISCLOSURE} Up to {v.policy.maxPercent}% of your monthly net pay, a {(v.policy.feeBps / 100).toFixed(2).replace(/\.?0+$/, '')}% fee taken at payout, {v.policy.instalments} equal monthly instalments, one advance at a time. A payroll deducts at most half of that month&apos;s gross pay; the rest carries over.</span></div>
            {canRequest ? (
              <AdvanceRequestForm max={v.eligibility.max} feeBps={v.policy.feeBps} instalments={v.policy.instalments} months={v.expectedMonths} csrfToken={session.csrfToken} face={face} />
            ) : cur ? (
              <div className="callout" role="note"><WalletIcon size={18} /><span>You have a Payroll Advance {cur.status === 'paid' ? 'to repay' : 'in progress'}. A new one is possible once {cur.status === 'paid' ? 'it is fully repaid' : cur.status === 'requested' ? 'you withdraw it, or once it is declined, rejected or fully repaid' : 'it is rejected or fully repaid'}.</span></div>
            ) : (
              <>
                <div className="callout callout-warn" role="note" data-testid="advance-not-eligible"><AlertIcon size={18} /><span>You are not eligible for a Payroll Advance right now. The checks below say why.</span></div>
                <EligibilityList e={v.eligibility} title="Eligibility today" />
              </>
            )}
          </div>
        </section>

        {cur ? (
          <section className="card" aria-labelledby="current-h" data-testid="advance-current">
            <div className="panel-title"><h2 id="current-h">Current Payroll Advance</h2><AdvanceStatusChip status={cur.status} /></div>
            <div className="panel-body stack">
              <TermsList amount={cur.amount} fee={cur.fee} net={cur.net} instalment={cur.instalment} last={cur.lastInstalment} count={cur.instalmentCount} feeBps={(JSON.parse(cur.policySnapshot) as { feeBps: number }).feeBps} />
              {cur.status === 'paid' ? (
                <p data-testid="advance-progress"><strong>{displayAmount(cur.schedule.repaid)} of {displayAmount(cur.amount)} tUSDC repaid</strong>, {displayAmount(cur.schedule.balance)} tUSDC outstanding, {cur.schedule.left} instalment{cur.schedule.left === 1 ? '' : 's'} left.{cur.schedule.firstMonth ? ` Repayment started in ${monthLabel(cur.schedule.firstMonth)}.` : ' Repayment starts with your next payroll.'}</p>
              ) : <p className="hint">Requested {formatDateTime(cur.createdAt)}. The schedule starts with the first payroll after the advance is paid; the months below are estimates.</p>}
              {cur.status === 'requested' ? <AdvanceWithdraw id={cur.id} amount={displayAmount(cur.amount)} csrfToken={session.csrfToken} />
                : cur.status === 'submitted' || cur.status === 'approved' ? <div className="callout" role="note" data-testid="advance-no-withdraw"><InfoIcon size={18} /><span>The payroll maker has submitted this request, so it can no longer be withdrawn.</span></div> : null}
            </div>
            <ScheduleTable items={cur.schedule.items} caption="Repayment schedule" />
          </section>
        ) : null}

        <section className="card" aria-labelledby="requests-h">
          <div className="panel-title"><h2 id="requests-h">My requests</h2><span className="muted">{v.requests.length} total</span></div>
          {v.requests.length === 0 ? <div className="empty"><h3>No requests yet</h3><p>Your Payroll Advance requests and their status appear here.</p></div> : (
            <div className="table-wrap" role="region" aria-labelledby="requests-h" tabIndex={0}>
              <table className="data" data-testid="advance-requests">
                <thead><tr><th scope="col">Requested (UTC)</th><th scope="col" className="amount">Advance</th><th scope="col" className="amount">Fee</th><th scope="col" className="amount">You receive</th><th scope="col">Status</th><th scope="col">Note</th></tr></thead>
                <tbody>{v.requests.map((a) => (
                  <tr key={a.id}>
                    <td className="sub when">{formatUtcCell(a.createdAt)}</td>
                    <td className="amount">{displayAmount(a.amount)}</td>
                    <td className="amount">{displayAmount(a.fee)}</td>
                    <td className="amount">{displayAmount(a.net)}</td>
                    <td><AdvanceStatusChip status={a.status} /></td>
                    <td className="sub">{a.statusDetail ?? (a.status === 'requested' ? 'Waiting for the payroll maker' : a.status === 'submitted' ? 'Waiting for the approvers' : a.status === 'approved' ? 'Approved: being paid by the vault' : a.status === 'paid' ? 'Paid out; repaid through payroll' : a.status === 'repaid' ? 'Fully repaid' : a.status === 'withdrawn' ? 'You withdrew this request' : '')}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card" aria-labelledby="lines-h">
          <div className="panel-title"><h2 id="lines-h">My paid lines</h2><span className="hint">Payouts to your NEAR account, confirmed on testnet. Amounts in tUSDC; the instalment repays your Payroll Advance.</span></div>
          {v.paidLines.length === 0 ? <div className="empty"><h3>No payouts yet</h3></div> : (
            <div className="table-wrap" role="region" aria-labelledby="lines-h" tabIndex={0}>
              <table className="data" data-testid="paid-lines">
                <thead><tr><th scope="col">Paid (UTC)</th><th scope="col">What</th><th scope="col" className="amount">Gross</th><th scope="col" className="amount">Instalment</th><th scope="col" className="amount">Received</th><th scope="col">Proof</th></tr></thead>
                <tbody>{v.paidLines.map((l, i) => (
                  <tr key={`${l.txHash ?? i}`}>
                    <td className="sub when">{l.at ? formatUtcCell(l.at) : '—'}</td>
                    <td>{l.kind === 'advance' ? <AdvanceKindChip /> : <span className="chips"><span className="title">{l.title}</span>{l.kind === 'testnet' ? <TestnetChip /> : null}</span>}</td>
                    <td className="amount">{l.gross !== null ? displayAmount(l.gross) : '—'}</td>
                    <td className="amount">{l.instalment ? `−${displayAmount(l.instalment)}` : '—'}</td>
                    <td className="amount"><strong>{displayAmount(l.received)}</strong></td>
                    <td><TxLink hash={l.txHash} /></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
