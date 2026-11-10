import type { Metadata } from 'next';
import Link from 'next/link';
import { FileIcon, PlusIcon } from '@/components/icons';
import { StatusChip } from '@/components/status-chip';
import { getDb } from '@/server/db/client';
import { activeWorkflow, makerRuns, makerTestnetRuns } from '@/server/dashboard/queries';
import { requireRole } from '@/server/web/page-auth';
import { displayAmount, formatDateTime } from '@/lib/format';
import { SignerPanel, WorkflowPanel } from '../workflow-panel';
import { OperationsTransfers, TestnetChip, TxLink } from '../history-bits';
import { AdvanceKindChip } from '@/components/advance-bits';

export const metadata: Metadata = { title: 'My runs' };

const KIND = { one: 'One approver', two_sequential: 'Two in sequence', two_parallel: 'Two in parallel' } as const;

function NewRunButton() {
  return (
    <div className="page-head-actions">
      <Link className="btn btn-primary" href="/maker/runs/new"><PlusIcon size={18} />New run</Link>
    </div>
  );
}

export default async function MakerDashboard() {
  const session = await requireRole(['maker']);
  const db = getDb();
  const runs = makerRuns(db, session.user.id);
  const allTestnet = makerTestnetRuns(db, session.user.id);
  const testnet = allTestnet.filter((r) => r.category === 'payroll');
  const operations = allTestnet.filter((r) => r.category === 'operations');
  const workflow = activeWorkflow(db);
  const paidRuns = runs.filter((r) => r.status === 'paid').length + testnet.filter((r) => r.status === 'paid').length;
  const paidTotal = testnet.reduce((s, r) => s + r.paidTotal, 0n) + runs.filter((r) => r.status === 'paid').reduce((s, r) => s + r.total, 0n);
  const rows = [
    ...runs.map((r) => ({ key: r.id, at: r.updatedAt, node: (
      <tr key={r.id}>
        <td><div className="title"><Link href={r.kind === 'advance' ? (r.versionNo ? `/runs/${r.id}` : '/maker/advances') : r.status === 'draft' || ['rejected', 'cancelled', 'submit_failed'].includes(r.status) ? `/maker/runs/${r.id}` : `/runs/${r.id}`}>{r.title}</Link>{r.kind === 'advance' ? <> <AdvanceKindChip /></> : null}</div><div className="sub">{r.kind === 'advance' ? 'From an employee request' : r.source === 'upload' ? 'Upload' : 'Manual'} · {r.postingMode === 'detailed' ? 'Detailed posting' : 'Consolidated posting'}{r.versionNo ? ` · Version ${r.versionNo}` : ''}</div></td>
        <td><StatusChip status={r.status} /></td>
        <td className="amount">{r.rowCount.toLocaleString('en-US')}{r.invalidRows ? <div className="sub">{r.invalidRows} invalid</div> : null}</td>
        <td className="amount">{displayAmount(r.total)}</td>
        <td className="sub when">{formatDateTime(r.updatedAt)}</td>
        <td><span className="muted">—</span></td>
      </tr>
    ) })),
    ...testnet.map((r) => ({ key: r.id, at: r.createdAt, node: (
      <tr key={r.id}>
        <td><div className="title">{r.title}</div><div className="sub mono">{r.id}</div><div className="sub">{KIND[r.kind]} · {r.releaseMode === 'automatic' ? 'automatic release' : 'maker release'}</div></td>
        <td><span className="chips"><StatusChip status={r.status === 'paid' ? 'paid' : r.status === 'rejected' ? 'rejected' : 'needs_attention'} /><TestnetChip /></span></td>
        <td className="amount">{r.rowCount}</td>
        <td className="amount">{displayAmount(r.total)}</td>
        <td className="sub when">{formatDateTime(r.createdAt)}</td>
        <td><TxLink hash={r.lastPaidTxHash ?? r.createdTxHash} label={r.lastPaidTxHash ? 'Last payout' : 'Created'} /></td>
      </tr>
    ) })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My runs</h1>
          <p>Prepare runs, submit them for approval and follow their payouts.</p>
        </div>
        <NewRunButton />
      </div>

      <div className="stats">
        <div className="card stat"><div className="label">Drafts</div><div className="value">{runs.filter((r) => r.status === 'draft').length}</div></div>
        <div className="card stat"><div className="label">Awaiting approval</div><div className="value">{runs.filter((r) => r.status === 'pending_approval' || r.status === 'submitting').length}</div></div>
        <div className="card stat"><div className="label">Paid runs</div><div className="value">{paidRuns}</div><div className="foot">incl. {testnet.filter((r) => r.status === 'paid').length} testnet runs</div></div>
        <div className="card stat"><div className="label">Paid total</div><div className="value amount">{displayAmount(paidTotal)}<small>tUSDC</small></div></div>
      </div>

      <div className="stack">
        <section className="card" aria-labelledby="runs-title">
          <div className="panel-title"><h2 id="runs-title">Runs</h2><span className="muted">{rows.length} total</span></div>
          {rows.length === 0 ? (
            <div className="empty">
              <div className="empty-icon"><FileIcon size={22} /></div>
              <h3>No payroll runs yet</h3>
              <p>Create a run by adding rows or uploading a CSV. It stays a draft until you submit it for approval.</p>
              <div className="empty-action"><Link className="btn btn-primary btn-sm" href="/maker/runs/new">New run</Link></div>
            </div>
          ) : (
            <div className="table-wrap" role="region" aria-labelledby="runs-title" tabIndex={0}>
              <table className="data">
                <thead><tr><th scope="col">Run</th><th scope="col">Status</th><th scope="col" className="amount">Rows</th><th scope="col" className="amount">Total (tUSDC)</th><th scope="col">Updated (UTC)</th><th scope="col">Proof</th></tr></thead>
                <tbody>{rows.map((r) => r.node)}</tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      {operations.length ? <div className="section-gap" /> : null}
      <OperationsTransfers runs={operations} />
      <div className="panels">
          <WorkflowPanel workflow={workflow} />
          <SignerPanel account={session.user.chainAccountId} />
      </div>
    </>
  );
}
