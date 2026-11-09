import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckIcon, FileIcon, InboxIcon } from '@/components/icons';
import { Chip, StatusChip } from '@/components/status-chip';
import { getDb } from '@/server/db/client';
import { historyFor } from '@/server/reports/history';
import { requireRole } from '@/server/web/page-auth';
import { displayAmount, formatDateTime } from '@/lib/format';
import { TxLink } from '../history-bits';

export const metadata: Metadata = { title: 'History and reports' };

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireRole(['maker', 'approver', 'admin']);
  const view = (await searchParams).view === 'detailed' ? 'detailed' : 'consolidated';
  const h = historyFor(getDb(), session.user);
  const isAdmin = session.user.role === 'admin';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{isAdmin ? 'Company reports' : 'History and reports'}</h1>
          <p>Paid payroll from confirmed payouts only. {isAdmin ? 'Company-level view: references and amounts, no recipient details.' : 'Recipient details are shown for runs you made or reviewed.'}</p>
        </div>
      </div>

      <div className="stats">
        <div className="card stat"><div className="label">Paid runs</div><div className="value">{h.totals.runs}</div></div>
        <div className="card stat"><div className="label">Paid lines</div><div className="value">{h.totals.lines}</div></div>
        <div className="card stat"><div className="label">Total paid</div><div className="value amount">{displayAmount(h.totals.consolidatedTotal)}<small>tUSDC</small></div></div>
        <div className="card stat"><div className="label">Reconciliation</div><div className="value sm">{h.totals.reconciles ? <Chip tone="success" icon={<CheckIcon size={13} />}>Both views match</Chip> : <Chip tone="danger">Mismatch</Chip>}</div><div className="foot">consolidated {displayAmount(h.totals.consolidatedTotal)} = detailed {displayAmount(h.totals.detailedTotal)}</div></div>
      </div>

      <section className="card" aria-labelledby="history-title" data-testid="history">
        <div className="panel-title">
          <h2 id="history-title">{view === 'consolidated' ? 'Consolidated view: one line per paid run' : 'Detailed view: one line per paid recipient line'}</h2>
          <nav className="segmented" aria-label="History view">
            <Link href="/history?view=consolidated" aria-current={view === 'consolidated' ? 'page' : undefined}>Consolidated</Link>
            <Link href="/history?view=detailed" aria-current={view === 'detailed' ? 'page' : undefined}>Detailed</Link>
          </nav>
        </div>
        {h.paid.length === 0 ? (
          <div className="empty"><div className="empty-icon"><InboxIcon size={22} /></div><h3>No paid runs yet</h3><p>Runs appear here once every payout is confirmed on NEAR.</p></div>
        ) : view === 'consolidated' ? (
          <div className="table-wrap" role="region" aria-labelledby="history-title" tabIndex={0}>
            <table className="data">
              <thead><tr><th scope="col">Reference</th><th scope="col">Run</th><th scope="col">Posting mode</th><th scope="col" className="amount">Recipients</th><th scope="col" className="amount">Total (tUSDC)</th><th scope="col">Paid (UTC)</th></tr></thead>
              <tbody>{h.paid.map((r) => (
                <tr key={r.versionId}>
                  <td className="mono">{r.reference}</td>
                  <td><div className="title">{isAdmin ? r.title : <Link href={`/runs/${r.runId}`}>{r.title}</Link>}</div><div className="sub">Version {r.versionNo} · <span className="mono">{r.chainRunId}</span></div></td>
                  <td>{r.postingMode === 'detailed' ? 'Detailed' : 'Consolidated'}<div className="sub">{r.postingMode === 'detailed' ? `${r.lines.length} company entries` : '1 company entry'}</div></td>
                  <td className="amount">{r.rowCount}</td>
                  <td className="amount">{displayAmount(r.total)}</td>
                  <td className="sub when">{r.paidAt ? formatDateTime(r.paidAt) : '—'}</td>
                </tr>
              ))}</tbody>
              <tfoot><tr><td colSpan={4}><strong>Total</strong></td><td className="amount"><strong>{displayAmount(h.totals.consolidatedTotal)}</strong></td><td /></tr></tfoot>
            </table>
          </div>
        ) : (
          <div className="table-wrap" role="region" aria-labelledby="history-title" tabIndex={0}>
            <table className="data">
              <thead><tr><th scope="col">Reference</th><th scope="col">Run</th><th scope="col" className="amount">Line</th>{isAdmin ? null : <><th scope="col">Recipient</th><th scope="col">NEAR account</th></>}<th scope="col" className="amount">Amount (tUSDC)</th><th scope="col">Paid (UTC)</th>{isAdmin ? null : <th scope="col">Proof</th>}</tr></thead>
              <tbody>{h.paid.flatMap((r) => r.lines.map((l) => (
                <tr key={`${r.versionId}:${l.rowIndex}`}>
                  <td className="mono">{l.reference}</td>
                  <td><div className="title">{r.title}</div><div className="sub">Version {r.versionNo}</div></td>
                  <td className="amount">{l.lineNo}</td>
                  {isAdmin ? null : <><td>{l.recipient?.name ?? '—'}</td><td className="mono">{l.recipient?.accountId ?? '—'}</td></>}
                  <td className="amount">{displayAmount(l.amount)}</td>
                  <td className="sub when">{l.paidAt ? formatDateTime(l.paidAt) : '—'}</td>
                  {isAdmin ? null : <td><TxLink hash={l.recipient?.txHash ?? null} /></td>}
                </tr>
              )))}</tbody>
              <tfoot><tr><td colSpan={isAdmin ? 3 : 5}><strong>Total</strong></td><td className="amount"><strong>{displayAmount(h.totals.detailedTotal)}</strong></td><td colSpan={isAdmin ? 1 : 2} /></tr></tfoot>
            </table>
          </div>
        )}
      </section>

      {h.inProgress.length ? (
        <>
          <div className="section-gap" />
          <section className="card" aria-labelledby="progress-title">
            <div className="panel-title"><h2 id="progress-title">In progress or partially paid</h2><span className="hint">Not in the company export until every payout is confirmed.</span></div>
            <div className="table-wrap"><table className="data">
              <thead><tr><th scope="col">Run</th><th scope="col">Status</th><th scope="col" className="amount">Confirmed</th><th scope="col" className="amount">Approved total (tUSDC)</th></tr></thead>
              <tbody>{h.inProgress.map((r) => (
                <tr key={r.versionId}><td>{r.title}</td><td><StatusChip status={r.status as 'releasing'} /></td><td className="amount">{r.paidCount} of {r.rowCount} · {displayAmount(r.confirmedTotal)}</td><td className="amount">{displayAmount(r.total)}</td></tr>
              ))}</tbody>
            </table></div>
          </section>
        </>
      ) : null}

      <div className="section-gap" />
      <section className="card" aria-labelledby="export-title" data-testid="export-area">
        <div className="panel-title"><h2 id="export-title">Exports</h2><span className="hint">CSV, UTF-8. Amounts with 6 fixed decimals. Times in UTC.</span></div>
        <ul className="downloads exports">
          <li><a href="/api/reports/company" download><FileIcon size={18} /><span><strong>Company entries (accounting)</strong><span className="sub">Each paid run in its locked posting mode: reference, run, line, paid at, amount. No recipient details.</span></span></a></li>
          {h.canExportRecipients || session.user.role !== 'admin' ? (
            <li><a href="/api/reports/recipients" download><FileIcon size={18} /><span><strong>Recipient detail (restricted)</strong><span className="sub">Per paid line: NEAR account, name, email, amount and the payout transaction. Only runs you made or reviewed.</span></span></a></li>
          ) : (
            <li className="locked"><span><strong>Recipient detail</strong><span className="sub">Only the maker and the assigned approvers of a run can export recipient details.</span></span></li>
          )}
        </ul>
      </section>
    </>
  );
}
