import type { Metadata } from 'next';
import Link from 'next/link';
import { AdvanceActions } from '@/components/advance-actions';
import { AdvanceKindChip, AdvanceStatusChip, EligibilityList, MonthsList, TermsList } from '@/components/advance-bits';
import { WalletIcon } from '@/components/icons';
import { getDb } from '@/server/db/client';
import { activeWorkflow } from '@/server/dashboard/queries';
import { advanceQueue, advanceRunTitle } from '@/server/advance/service';
import { requireRole } from '@/server/web/page-auth';
import { displayAmount, formatDateTime, formatUtcCell } from '@/lib/format';
import { KIND_LABEL, RELEASE_LABEL } from '../../workflow-panel';

export const metadata: Metadata = { title: 'Payroll Advance requests' };

/** Maker (Phase 23): requests with the eligibility snapshot and today's re-check, fee, net payout and schedule. */
export default async function AdvanceRequestsPage() {
  const session = await requireRole(['maker']);
  const db = getDb();
  const now = new Date();
  const q = advanceQueue(db, session.user, now);
  const wf = activeWorkflow(db);
  const approvalSummary = wf ? `${KIND_LABEL[wf.kind]} (${wf.approvers.map((a) => a.displayName).join(wf.kind === 'two_sequential' ? ' then ' : ' and ')}), ${RELEASE_LABEL[wf.releaseMode].toLowerCase()}` : 'No active workflow';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Payroll Advance requests</h1>
          <p>Salary advances requested by employees, repaid like a loan through payroll. Submit one as a one-row run through the normal approvals, or decline it with a reason.</p>
        </div>
      </div>
      <div className="stack">
        {q.open.length === 0 ? (
          <section className="card"><div className="empty"><div className="empty-icon"><WalletIcon size={22} /></div><h3>No requests waiting</h3><p>When an employee requests a Payroll Advance it appears here.</p></div></section>
        ) : q.open.map((e) => {
          const a = e.advance;
          const amounts = Array.from({ length: a.instalmentCount }, (_, i) => (i === a.instalmentCount - 1 ? a.lastInstalment : a.instalment));
          const feeBps = (JSON.parse(a.policySnapshot) as { feeBps: number }).feeBps;
          return (
            <section key={a.id} className="card" aria-labelledby={`req-${a.id}`} data-testid="advance-request">
              <div className="panel-title">
                <h2 id={`req-${a.id}`}>{e.name} · {displayAmount(a.amount)} tUSDC</h2>
                <span className="chips"><AdvanceKindChip /><AdvanceStatusChip status={a.status} /></span>
              </div>
              <div className="panel-body stack">
                <p className="hint">{e.division} · <span className="mono">{e.account}</span> · requested {formatDateTime(a.createdAt)}{a.reason ? <> · reason: “{a.reason}”</> : null} · consent “{a.consentText}” ticked {formatDateTime(a.consentedAt)}</p>
                {a.statusDetail ? <div className="callout callout-warn" role="note"><span>{a.statusDetail}</span></div> : null}
                <div className="grid-2">
                  <div className="stack">
                    <TermsList amount={a.amount} fee={a.fee} net={a.net} instalment={a.instalment} last={a.lastInstalment} count={a.instalmentCount} feeBps={feeBps} />
                    <MonthsList months={e.months} amounts={amounts} title="Estimated salary deductions" />
                  </div>
                  <div className="stack">
                    <EligibilityList e={e.eligibilityNow} title="Eligibility re-checked now" />
                    <p className="hint">At the request ({formatDateTime(new Date(e.eligibilityAtRequest.at))}): {e.eligibilityAtRequest.eligible ? 'eligible' : 'not eligible'}, maximum {displayAmount(BigInt(e.eligibilityAtRequest.max))} tUSDC ({e.eligibilityAtRequest.maxBasis}).</p>
                  </div>
                </div>
                <AdvanceActions id={a.id} name={e.name} amount={displayAmount(a.amount)} fee={displayAmount(a.fee)} net={displayAmount(a.net)} title={advanceRunTitle(e.name, now)}
                  approvalSummary={approvalSummary} csrfToken={session.csrfToken} canSubmit={e.eligibilityNow.eligible && a.amount <= BigInt(e.eligibilityNow.max)} />
              </div>
            </section>
          );
        })}

        <section className="card" aria-labelledby="done-h">
          <div className="panel-title"><h2 id="done-h">Handled requests</h2><span className="muted">{q.done.length} total</span></div>
          {q.done.length === 0 ? <div className="empty"><h3>None yet</h3></div> : (
            <div className="table-wrap" role="region" aria-labelledby="done-h" tabIndex={0}>
              <table className="data" data-testid="advance-handled">
                <thead><tr><th scope="col">Employee</th><th scope="col">Requested (UTC)</th><th scope="col" className="amount">Advance</th><th scope="col" className="amount">Fee</th><th scope="col" className="amount">Net payout</th><th scope="col">Status</th><th scope="col">Run</th></tr></thead>
                <tbody>{q.done.map((e) => (
                  <tr key={e.advance.id}>
                    <td><div className="title">{e.name}</div><div className="sub">{e.advance.statusDetail ?? (e.advance.status === 'withdrawn' ? 'Withdrawn by the employee before submission' : '')}</div></td>
                    <td className="sub when">{formatUtcCell(e.advance.createdAt)}</td>
                    <td className="amount">{displayAmount(e.advance.amount)}</td>
                    <td className="amount">{displayAmount(e.advance.fee)}</td>
                    <td className="amount">{displayAmount(e.advance.net)}</td>
                    <td><AdvanceStatusChip status={e.advance.status} /></td>
                    <td>{e.advance.runId && e.runVersionStatus ? <Link href={`/runs/${e.advance.runId}`}>Open run</Link> : <span className="muted">—</span>}</td>
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
