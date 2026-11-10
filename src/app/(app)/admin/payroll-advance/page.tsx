import type { Metadata } from 'next';
import { AdvancePolicyForm } from '@/components/advance-policy';
import { AdvanceKindChip } from '@/components/advance-bits';
import { AlertIcon, InfoIcon } from '@/components/icons';
import { getDb } from '@/server/db/client';
import { describePolicyValue, getPolicy, POLICY_LABEL, policyLog, type PolicyField } from '@/server/advance/policy';
import { outstandingAdvances } from '@/server/advance/service';
import { companyLedgerTotals } from '@/server/advance/ledger';
import { hostedMode } from '@/server/hosted';
import { requireRole } from '@/server/web/page-auth';
import { displayAmount, formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Payroll Advance' };

/** Admin (Phase 23): the policy, its change log, and the advances outstanding (company view). */
export default async function PayrollAdvanceAdminPage() {
  const session = await requireRole(['admin']);
  const db = getDb();
  const policy = getPolicy(db);
  const log = policyLog(db);
  const outstanding = outstandingAdvances(db);
  const totals = companyLedgerTotals(db);
  const toSettle = outstanding.filter((o) => !o.active);
  const readOnly = hostedMode().demo;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Payroll Advance</h1>
          <p>A salary advance repaid like a loan: eligible employees request it, the maker submits it as a one-row run, the approvers approve it on NEAR, and the instalments come back through payroll.</p>
        </div>
      </div>
      {toSettle.length ? (
        <div className="callout callout-warn" role="note" data-testid="advance-settle-outside"><AlertIcon size={18} /><span><strong>To settle outside SentFund:</strong> {toSettle.map((o) => `${o.name} owes ${displayAmount(o.balance)} tUSDC`).join('; ')}. {toSettle.length === 1 ? 'This employee is' : 'These employees are'} inactive, so no payroll will deduct the balance.</span></div>
      ) : null}
      <div className="stats">
        <div className="card stat"><div className="label">Advances paid</div><div className="value amount">{displayAmount(totals.advances)}<small>tUSDC</small></div><div className="foot">Ledger, confirmed on-chain</div></div>
        <div className="card stat"><div className="label">Instalments repaid</div><div className="value amount">{displayAmount(totals.instalments)}<small>tUSDC</small></div></div>
        <div className="card stat"><div className="label">Outstanding</div><div className="value amount" data-testid="advance-outstanding-total">{displayAmount(totals.outstanding)}<small>tUSDC</small></div><div className="foot">Advances − instalments repaid</div></div>
        <div className="card stat"><div className="label">Status</div><div className="value sm">{policy.enabled ? 'Offered' : 'Off'}</div><div className="foot">{readOnly ? 'Read-only in the public demo' : 'Admin setting'}</div></div>
      </div>
      <div className="stack">
        <section className="card" aria-labelledby="policy-h">
          <div className="panel-title"><h2 id="policy-h">Policy</h2><AdvanceKindChip /></div>
          <div className="panel-body"><AdvancePolicyForm policy={policy} csrfToken={session.csrfToken} readOnly={readOnly} /></div>
        </section>
        <section className="card" aria-labelledby="out-h">
          <div className="panel-title"><h2 id="out-h">Outstanding advances</h2><span className="muted">{outstanding.length}</span></div>
          {outstanding.length === 0 ? <div className="empty"><h3>Nothing outstanding</h3></div> : (
            <div className="table-wrap" role="region" aria-labelledby="out-h" tabIndex={0}>
              <table className="data" data-testid="advance-outstanding">
                <thead><tr><th scope="col">Employee</th><th scope="col">Paid (UTC)</th><th scope="col" className="amount">Advance</th><th scope="col" className="amount">Repaid</th><th scope="col" className="amount">Outstanding</th><th scope="col">Instalments left</th><th scope="col">Note</th></tr></thead>
                <tbody>{outstanding.map((o) => (
                  <tr key={o.advance.id}>
                    <td><div className="title">{o.name}</div><div className="sub mono">{o.account}</div></td>
                    <td className="sub when">{o.advance.paidAt ? formatDateTime(o.advance.paidAt) : '—'}</td>
                    <td className="amount">{displayAmount(o.advance.amount)}</td>
                    <td className="amount">{displayAmount(o.repaid)}</td>
                    <td className="amount"><strong>{displayAmount(o.balance)}</strong></td>
                    <td>{o.left}</td>
                    <td>{o.active ? <span className="muted">Repaid through payroll</span> : <span className="chip chip-waiting">To settle outside SentFund</span>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
        <section className="card" aria-labelledby="log-h">
          <div className="panel-title"><h2 id="log-h">Policy changes</h2></div>
          {log.length === 0 ? <div className="panel-body"><p className="hint"><InfoIcon size={14} /> No changes yet: the defaults apply (on, 300%, 2%, 6 months, 90 days).</p></div> : (
            <ul className="change-log" data-testid="advance-policy-log">{log.map((c, i) => (
              <li key={i}><span className="when">{formatDateTime(c.at)}</span> <strong>{c.actor}</strong>: {Object.entries(c.changes).map(([k, [a, b]]) => `${POLICY_LABEL[k as PolicyField] ?? k} ${describePolicyValue(k, a)} → ${describePolicyValue(k, b)}`).join('; ')}</li>
            ))}</ul>
          )}
        </section>
      </div>
    </>
  );
}
