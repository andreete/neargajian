import type { Metadata } from 'next';
import { FileIcon, PlusIcon } from '@/components/icons';
import { StatusChip } from '@/components/status-chip';
import { getDb } from '@/server/db/client';
import { activeWorkflow, makerRuns } from '@/server/dashboard/queries';
import { requireRole } from '@/server/web/page-auth';
import { formatAmount } from '@/server/money';
import { formatDateTime } from '@/lib/format';
import { SignerPanel, WorkflowPanel } from '../workflow-panel';

export const metadata: Metadata = { title: 'My payroll runs' };

export default async function MakerDashboard() {
  const session = await requireRole(['maker']);
  const db = getDb();
  const runs = makerRuns(db, session.user.id);
  const workflow = activeWorkflow(db);
  const count = (pred: (s: string) => boolean) => runs.filter((r) => pred(r.status)).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My payroll runs</h1>
          <p>Prepare runs, submit them for approval and follow their payouts.</p>
        </div>
        <div className="page-head-actions">
          <button type="button" className="btn btn-primary" disabled aria-describedby="new-run-hint"><PlusIcon size={18} />New payroll run</button>
          <span id="new-run-hint" className="hint">Run builder arrives in the next build (Phase 08).</span>
        </div>
      </div>

      <div className="stats">
        <div className="card stat"><div className="label">Drafts</div><div className="value">{count((s) => s === 'draft')}</div></div>
        <div className="card stat"><div className="label">Awaiting approval</div><div className="value">{count((s) => s === 'pending_approval' || s === 'submitting')}</div></div>
        <div className="card stat"><div className="label">Paid</div><div className="value">{count((s) => s === 'paid')}</div></div>
        <div className="card stat"><div className="label">Approval path</div><div className="value sm">{workflow ? `${workflow.approvers.length === 1 ? 'One approver' : 'Two approvers'}, ${workflow.kind === 'two_parallel' ? 'parallel' : workflow.kind === 'two_sequential' ? 'in sequence' : 'single step'}` : '—'}</div></div>
      </div>

      <div className="grid-2">
        <section className="card" aria-labelledby="runs-title">
          <div className="panel-title"><h2 id="runs-title">Runs</h2><span className="muted">{runs.length} total</span></div>
          {runs.length === 0 ? (
            <div className="empty">
              <div className="empty-icon"><FileIcon size={22} /></div>
              <h3>No payroll runs yet</h3>
              <p>Create a run by adding rows or uploading a CSV. It stays a draft until you submit it for approval.</p>
            </div>
          ) : (
            <div className="table-wrap" role="region" aria-labelledby="runs-title" tabIndex={0}>
              <table className="data">
                <thead>
                  <tr><th scope="col">Run</th><th scope="col">Status</th><th scope="col" className="amount">Rows</th><th scope="col" className="amount">Total (tUSDC)</th><th scope="col">Updated</th></tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div className="title">{r.title}</div>
                        <div className="sub">{r.source === 'upload' ? 'Upload' : 'Manual'} · {r.postingMode === 'detailed' ? 'Detailed posting' : 'Consolidated posting'}{r.versionNo ? ` · Version ${r.versionNo}` : ''}</div>
                      </td>
                      <td><StatusChip status={r.status} /></td>
                      <td className="amount">{r.rowCount.toLocaleString('en-US')}{r.invalidRows ? <div className="sub">{r.invalidRows} invalid</div> : null}</td>
                      <td className="amount">{formatAmount(r.total)}</td>
                      <td className="sub">{formatDateTime(r.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <div className="stack">
          <WorkflowPanel workflow={workflow} />
          <SignerPanel account={session.user.chainAccountId} />
        </div>
      </div>
    </>
  );
}
