import type { Metadata } from 'next';
import { InboxIcon, InfoIcon } from '@/components/icons';
import { StatusChip } from '@/components/status-chip';
import { getDb } from '@/server/db/client';
import { activeWorkflow, approverQueue, type QueueItem } from '@/server/dashboard/queries';
import { requireRole } from '@/server/web/page-auth';
import { formatAmount } from '@/server/money';
import { formatDateTime } from '@/lib/format';
import { SignerPanel, WorkflowPanel } from '../workflow-panel';

export const metadata: Metadata = { title: 'Review queue' };

function QueueTable({ items, id, empty }: { items: QueueItem[]; id: string; empty: { title: string; text: string } }) {
  if (items.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon"><InboxIcon size={22} /></div>
        <h3>{empty.title}</h3>
        <p>{empty.text}</p>
      </div>
    );
  }
  return (
    <div className="table-wrap" role="region" aria-labelledby={id} tabIndex={0}>
      <table className="data">
        <thead><tr><th scope="col">Run</th><th scope="col">Status</th><th scope="col" className="amount">Rows</th><th scope="col" className="amount">Total (tUSDC)</th><th scope="col">Submitted</th></tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.versionId}>
              <td><div className="title">{i.title}</div><div className="sub">Version {i.versionNo} · your step {i.myStep}{i.actionable ? ' · ready for you' : ''}</div></td>
              <td><StatusChip status={i.status} /></td>
              <td className="amount">{i.rowCount.toLocaleString('en-US')}</td>
              <td className="amount">{formatAmount(i.total)}</td>
              <td className="sub">{formatDateTime(i.submittedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ApproverDashboard() {
  const session = await requireRole(['approver']);
  const db = getDb();
  const queue = approverQueue(db, session.user.id);
  const workflow = activeWorkflow(db);
  const step = workflow?.approvers.findIndex((a) => a.userId === session.user.id) ?? -1;
  const position = step < 0
    ? 'You are not assigned in the active workflow. You still see runs that were submitted while you were assigned.'
    : workflow?.kind === 'two_sequential'
      ? step === 0 ? 'You are Approver 1. You review first; Approver 2 can act only after your approval.' : 'You are Approver 2. You can act after Approver 1 has approved.'
      : workflow?.kind === 'two_parallel'
        ? `You are Approver ${step + 1}. Either approver can go first; both approvals are required.`
        : 'You are the only approver for new runs.';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Review queue</h1>
          <p>Runs assigned to you, with the exact version you approve.</p>
        </div>
      </div>
      <div className="callout" role="note"><InfoIcon size={18} /><span>{position}</span></div>
      <div className="stats">
        <div className="card stat"><div className="label">Waiting for you</div><div className="value">{queue.pending.filter((i) => i.actionable).length}</div></div>
        <div className="card stat"><div className="label">Pending (any step)</div><div className="value">{queue.pending.length}</div></div>
        <div className="card stat"><div className="label">Reviewed</div><div className="value">{queue.reviewed.length}</div></div>
        <div className="card stat"><div className="label">Your step</div><div className="value sm">{step >= 0 ? `Approver ${step + 1} of ${workflow?.approvers.length ?? 1}` : 'Not assigned'}</div></div>
      </div>
      <div className="grid-2">
        <div className="stack">
          <section className="card" aria-labelledby="pending-title">
            <div className="panel-title"><h2 id="pending-title">Pending</h2><span className="muted">{queue.pending.length}</span></div>
            <QueueTable id="pending-title" items={queue.pending} empty={{ title: 'Nothing waiting for you', text: 'When a maker submits a run that needs your approval, it appears here with its total, row count and version.' }} />
          </section>
          <section className="card" aria-labelledby="reviewed-title">
            <div className="panel-title"><h2 id="reviewed-title">Reviewed</h2><span className="muted">{queue.reviewed.length}</span></div>
            <QueueTable id="reviewed-title" items={queue.reviewed} empty={{ title: 'No reviewed runs yet', text: 'Runs you approved or rejected stay here, so you can check their details and payouts later.' }} />
          </section>
        </div>
        <div className="stack">
          <WorkflowPanel workflow={workflow} meId={session.user.id} />
          <SignerPanel account={session.user.chainAccountId} />
        </div>
      </div>
    </>
  );
}
