import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckIcon, FileIcon, InboxIcon } from '@/components/icons';
import { Chip, StatusChip } from '@/components/status-chip';
import { getDb } from '@/server/db/client';
import { historyFor, type HistoryRun, type PaidLine } from '@/server/reports/history';
import { requireRole } from '@/server/web/page-auth';
import { displayAmount, formatUtcCell } from '@/lib/format';
import { CopyValue } from '@/components/copy-value';
import { TxLink } from '../history-bits';
import { AdvanceKindChip } from '@/components/advance-bits';

/** Under a net amount: how it was made (payroll gross − instalment, or advance − fee). */
function Breakdown({ gross, instalment, advance, fee }: { gross: bigint; instalment: bigint; advance: bigint; fee: bigint }) {
  // Two short lines (each kept whole), so the breakdown never widens the narrow name/reference column.
  if (advance > 0n) return <div className="sub breakdown" data-testid="breakdown"><span>advance {displayAmount(advance)}</span>{' '}<span>− fee {displayAmount(fee)}</span></div>;
  if (instalment > 0n) return <div className="sub breakdown" data-testid="breakdown"><span>gross {displayAmount(gross)}</span>{' '}<span>− instalment {displayAmount(instalment)}</span></div>;
  return null;
}
const sumOf = (r: HistoryRun) => ({ gross: r.lines.reduce((s, l) => s + l.gross, 0n), instalment: r.lines.reduce((s, l) => s + l.instalment, 0n), advance: r.lines.reduce((s, l) => s + l.advance, 0n), fee: r.lines.reduce((s, l) => s + l.fee, 0n) });

export const metadata: Metadata = { title: 'History and reports' };

const PAGE = 100;

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireRole(['maker', 'approver', 'admin']);
  const sp = await searchParams;
  const view = sp.view === 'detailed' ? 'detailed' : 'consolidated';
  const h = historyFor(getDb(), session.user);
  const isAdmin = session.user.role === 'admin';
  // Detailed view: 100 lines per page, grouped under their run.
  const allLines = h.paid.flatMap((run) => run.lines.map((line) => ({ run, line })));
  const pages = Math.max(1, Math.ceil(allLines.length / PAGE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(String(sp.page ?? '1'), 10) || 1));
  const from = (page - 1) * PAGE;
  const groups: { run: HistoryRun; lines: PaidLine[]; continued: boolean }[] = [];
  for (const { run, line } of allLines.slice(from, from + PAGE)) {
    const last = groups.at(-1);
    if (last?.run === run) last.lines.push(line);
    else groups.push({ run, lines: [line], continued: run.lines[0] !== line });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{isAdmin ? 'Company reports' : 'History and reports'}</h1>
          <p>Paid payroll from confirmed payouts only. {isAdmin ? 'Company-level view: references and amounts, no recipient details.' : 'Recipient details are shown for runs you made or reviewed.'}</p>
        </div>
      </div>

      <div className="stats">
        <div className="card stat"><div className="label">Paid runs</div><div className="value">{h.totals.runs.toLocaleString('en-US')}</div></div>
        <div className="card stat"><div className="label">Paid lines</div><div className="value">{h.totals.lines.toLocaleString('en-US')}</div></div>
        <div className="card stat"><div className="label">Total paid</div><div className="value amount">{displayAmount(h.totals.consolidatedTotal)}<small>tUSDC</small></div></div>
        <div className="card stat"><div className="label">Reconciliation</div><div className="value sm">{h.totals.reconciles ? <Chip tone="success" icon={<CheckIcon size={13} />}>Both views match</Chip> : <Chip tone="danger">Mismatch</Chip>}</div><div className="foot">consolidated {displayAmount(h.totals.consolidatedTotal)} = detailed {displayAmount(h.totals.detailedTotal)}</div></div>
      </div>
      {h.totals.advanceTotal > 0n || h.totals.instalmentTotal > 0n ? (
        <div className="stats" data-testid="advance-totals">
          <div className="card stat"><div className="label">Payroll gross</div><div className="value amount">{displayAmount(h.totals.grossTotal)}<small>tUSDC</small></div><div className="foot">− instalments {displayAmount(h.totals.instalmentTotal)} = payroll net</div></div>
          <div className="card stat"><div className="label">Payroll Advance paid</div><div className="value amount">{displayAmount(h.totals.advanceTotal)}<small>tUSDC</small></div><div className="foot">Owed by employees; fees {displayAmount(h.totals.feeTotal)} (income)</div></div>
          <div className="card stat"><div className="label">Instalments repaid</div><div className="value amount">{displayAmount(h.totals.instalmentTotal)}<small>tUSDC</small></div><div className="foot">Deducted from paid payroll rows</div></div>
          <div className="card stat"><div className="label">Advances outstanding</div><div className="value amount" data-testid="history-outstanding">{displayAmount(h.totals.outstanding)}<small>tUSDC</small></div><div className="foot">{h.totals.ledgerMatches ? 'Advances − instalments repaid; matches the ledger' : 'Does not match the ledger'}</div></div>
        </div>
      ) : null}

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
            <table className="data history-table">
              <thead><tr><th scope="col">Reference</th><th scope="col">Run and vault run ID</th><th scope="col">Posting</th><th scope="col" className="amount">Recipients</th><th scope="col" className="amount" title="Net: the amount paid on-chain">Total (tUSDC)</th><th scope="col">Paid (UTC)</th></tr></thead>
              <tbody>{h.paid.map((r) => (
                <tr key={r.versionId}>
                  <td className="nowrap"><CopyValue value={r.reference} label="reference" size="fit" /></td>
                  <td><div className="title trunc run-title" title={isAdmin ? r.companyTitle : r.title}>{isAdmin ? r.companyTitle : <Link href={`/runs/${r.runId}`}>{r.title}</Link>}</div><div className="sub nowrap">Version {r.versionNo} · <CopyValue value={r.chainRunId} label="vault run ID" size="sm" /></div><Breakdown {...sumOf(r)} /></td>
                  <td className="nowrap">{r.kind === 'advance' ? <AdvanceKindChip /> : r.postingMode === 'detailed' ? 'Detailed' : 'Consolidated'}<div className="sub">{r.kind === 'advance' ? 'Detailed, 1 entry' : r.postingMode === 'detailed' ? `${r.lines.length.toLocaleString('en-US')} ${r.lines.length === 1 ? 'entry' : 'entries'}` : '1 entry'}</div></td>
                  <td className="amount">{r.rowCount.toLocaleString('en-US')}</td>
                  <td className="amount">{displayAmount(r.total)}</td>
                  <td className="sub when">{r.paidAt ? formatUtcCell(r.paidAt) : '—'}</td>
                </tr>
              ))}</tbody>
              <tfoot><tr><td colSpan={4}><strong>Total</strong></td><td className="amount"><strong>{displayAmount(h.totals.consolidatedTotal)}</strong></td><td /></tr></tfoot>
            </table>
          </div>
        ) : (
          <>
            <div className="table-wrap" role="region" aria-labelledby="history-title" tabIndex={0}>
              <table className="data history-table detailed">
                <thead><tr><th scope="col" title="The last four digits are the line number">Reference</th>{isAdmin ? null : <><th scope="col">Recipient</th><th scope="col">NEAR account</th></>}<th scope="col" className="amount">Amount (tUSDC)</th><th scope="col">Paid (UTC)</th>{isAdmin ? null : <th scope="col">Proof</th>}</tr></thead>
                {groups.map((g) => (
                  <tbody key={`${g.run.versionId}:${g.lines[0]?.rowIndex}`}>
                    <tr className="group-row">
                      <th scope="colgroup" colSpan={isAdmin ? 3 : 6}>
                        <span className="group-title trunc" title={isAdmin ? g.run.companyTitle : g.run.title}>{isAdmin ? g.run.companyTitle : <Link href={`/runs/${g.run.runId}`}>{g.run.title}</Link>}</span>{g.run.kind === 'advance' ? <AdvanceKindChip /> : null}
                        <span className="group-meta">Version {g.run.versionNo} · {g.run.postingMode === 'detailed' ? 'detailed' : 'consolidated'} posting · {g.run.lines.length.toLocaleString('en-US')} lines · {displayAmount(g.run.total)} tUSDC{g.continued ? ' · continued' : ''}</span>
                      </th>
                    </tr>
                    {g.lines.map((l) => (
                      <tr key={`${g.run.versionId}:${l.rowIndex}`}>
                        <td className="nowrap"><CopyValue value={l.reference} label="reference" size="fit" />{isAdmin ? <Breakdown gross={l.gross} instalment={l.instalment} advance={l.advance} fee={l.fee} /> : null}</td>
                        {isAdmin ? null : <><td className="nowrap"><span className="trunc cell-name" title={l.recipient?.name ?? ''}>{l.recipient?.name ?? '—'}</span><Breakdown gross={l.gross} instalment={l.instalment} advance={l.advance} fee={l.fee} /></td><td className="nowrap">{l.recipient ? <CopyValue value={l.recipient.accountId} label="NEAR account" size="lg" /> : '—'}</td></>}
                        <td className="amount">{displayAmount(l.amount)}</td>
                        <td className="sub when">{l.paidAt ? formatUtcCell(l.paidAt) : '—'}</td>
                        {isAdmin ? null : <td className="nowrap"><TxLink hash={l.recipient?.txHash ?? null} /></td>}
                      </tr>
                    ))}
                  </tbody>
                ))}
                <tfoot><tr><td colSpan={isAdmin ? 1 : 3}><strong>Total, all {h.totals.lines.toLocaleString('en-US')} lines</strong></td><td className="amount"><strong>{displayAmount(h.totals.detailedTotal)}</strong></td><td colSpan={isAdmin ? 1 : 2} /></tr></tfoot>
              </table>
            </div>
            {pages > 1 ? (
              <div className="toolbar pager-bar">
                <nav className="pager" aria-label="Detailed history pages">
                  {page > 1 ? <Link className="btn btn-secondary btn-sm" href={`/history?view=detailed&page=${page - 1}`}>Previous</Link> : <span className="btn btn-secondary btn-sm" aria-disabled="true">Previous</span>}
                  <span className="hint">Lines {(from + 1).toLocaleString('en-US')}–{Math.min(allLines.length, from + PAGE).toLocaleString('en-US')} of {allLines.length.toLocaleString('en-US')} · page {page} of {pages}</span>
                  {page < pages ? <Link className="btn btn-secondary btn-sm" href={`/history?view=detailed&page=${page + 1}`}>Next</Link> : <span className="btn btn-secondary btn-sm" aria-disabled="true">Next</span>}
                </nav>
              </div>
            ) : null}
          </>
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
                <tr key={r.versionId}><td>{r.title}</td><td><StatusChip status={r.displayStatus} /></td><td className="amount">{r.paidCount} of {r.rowCount} · {displayAmount(r.confirmedTotal)}</td><td className="amount">{displayAmount(r.total)}</td></tr>
              ))}</tbody>
            </table></div>
          </section>
        </>
      ) : null}

      <div className="section-gap" />
      <section className="card" aria-labelledby="export-title" data-testid="export-area">
        <div className="panel-title"><h2 id="export-title">Exports</h2><span className="hint">CSV, UTF-8. Amounts with 6 fixed decimals. Times in UTC.</span></div>
        <ul className="downloads exports">
          <li><a href="/api/reports/company" download><FileIcon size={18} /><span><strong>Company entries (accounting)</strong><span className="sub">Each paid run in its locked posting mode: reference, run kind, run, line, paid at, gross, Payroll Advance instalment, advance, fee and the amount paid on-chain. No recipient details.</span></span></a></li>
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
