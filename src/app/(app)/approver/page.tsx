import type { Metadata } from 'next';
import { InboxIcon, InfoIcon } from '@/components/icons';
import { Chip, StatusChip } from '@/components/status-chip';
import { CheckIcon, XIcon } from '@/components/icons';
import { getDb } from '@/server/db/client';
import { activeWorkflow, approverQueue, approverTestnetDecisions } from '@/server/dashboard/queries';
import { requireRole } from '@/server/web/page-auth';
import { displayAmount, formatDateTime } from '@/lib/format';
import { SignerPanel, WorkflowPanel } from '../workflow-panel';
import { OperationsTransfers, TestnetChip, TxLink } from '../history-bits';

export const metadata: Metadata = { title: 'Review queue' };

export default async function ApproverDashboard() {
  const session = await requireRole(['approver']);
  const db = getDb();
  const queue = approverQueue(db, session.user.id);
  const allDecisions = approverTestnetDecisions(db, session.user.chainAccountId);
  const decisions = allDecisions.filter((d) => d.category === 'payroll');
  const operations = allDecisions.filter((d) => d.category === 'operations');
  const workflow = activeWorkflow(db);
  const step = workflow?.approvers.findIndex((a) => a.userId === session.user.id) ?? -1;
  const position = step < 0
    ? 'You are not assigned in the active workflow. You still see runs that were submitted while you were assigned.'
    : workflow?.kind === 'two_sequential'
      ? step === 0 ? 'You are Approver 1. You review first; Approver 2 can act only after your approval.' : 'You are Approver 2. You can act after Approver 1 has approved.'
      : workflow?.kind === 'two_parallel'
        ? `You are Approver ${step + 1}. Either approver can go first; both approvals are required.`
        : 'You are the only approver for new runs.';
  const reviewedCount = queue.reviewed.length + decisions.length;

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
        <div className="card stat"><div className="label">Reviewed</div><div className="value">{reviewedCount}</div><div className="foot">incl. {decisions.length} testnet runs</div></div>
        <div className="card stat"><div className="label">Your step</div><div className="value sm">{step >= 0 ? `Approver ${step + 1} of ${workflow?.approvers.length ?? 1}` : 'Not assigned'}</div></div>
      </div>
      <div className="stack">
        <div className="stack">
          <section className="card" aria-labelledby="pending-title">
            <div className="panel-title"><h2 id="pending-title">Pending</h2><span className="muted">{queue.pending.length}</span></div>
            {queue.pending.length === 0 ? (
              <div className="empty">
                <div className="empty-icon"><InboxIcon size={22} /></div>
                <h3>Nothing waiting for you</h3>
                <p>When a maker submits a run that needs your approval, it appears here with its total, row count and version.</p>
                {reviewedCount ? <div className="empty-action"><a className="btn btn-secondary btn-sm" href="#reviewed-title">See runs you reviewed</a></div> : null}
              </div>
            ) : (
              <div className="table-wrap" role="region" aria-labelledby="pending-title" tabIndex={0}>
                <table className="data">
                  <thead><tr><th scope="col">Run</th><th scope="col">Status</th><th scope="col" className="amount">Rows</th><th scope="col" className="amount">Total (tUSDC)</th><th scope="col">Submitted (UTC)</th></tr></thead>
                  <tbody>{queue.pending.map((i) => (
                    <tr key={i.versionId}><td><div className="title">{i.title}</div><div className="sub">Version {i.versionNo} · your step {i.myStep}{i.actionable ? ' · ready for you' : ''}</div></td>
                      <td><StatusChip status={i.status} /></td><td className="amount">{i.rowCount.toLocaleString('en-US')}</td><td className="amount">{displayAmount(i.total)}</td><td className="sub when">{formatDateTime(i.submittedAt)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>
          <section className="card" aria-labelledby="reviewed-title">
            <div className="panel-title"><h2 id="reviewed-title">Reviewed</h2><span className="muted">{reviewedCount}</span></div>
            {reviewedCount === 0 ? (
              <div className="empty">
                <div className="empty-icon"><InboxIcon size={22} /></div>
                <h3>No reviewed runs yet</h3>
                <p>Runs you approved or rejected stay here, so you can check their details and payouts later.</p>
              </div>
            ) : (
              <div className="table-wrap" role="region" aria-labelledby="reviewed-title" tabIndex={0}>
                <table className="data">
                  <thead><tr><th scope="col">Run</th><th scope="col">Your decision</th><th scope="col">Run status</th><th scope="col" className="amount">Total (tUSDC)</th><th scope="col">Decided (UTC)</th><th scope="col">Proof</th></tr></thead>
                  <tbody>{decisions.map((d) => (
                    <tr key={d.id}>
                      <td><div className="title">{d.title}</div><div className="sub mono">{d.id}</div></td>
                      <td>{d.decision === 'approved' ? <Chip tone="success" icon={<CheckIcon size={13} />}>Approved</Chip> : <Chip tone="danger" icon={<XIcon size={13} />}>Rejected</Chip>}</td>
                      <td><span className="chips"><StatusChip status={d.status === 'paid' ? 'paid' : d.status === 'rejected' ? 'rejected' : 'needs_attention'} /><TestnetChip /></span>{d.status === 'rejected' ? <div className="sub">{d.rejectionReason ?? 'No reason recorded (scripted test run before the app existed)'}</div> : null}</td>
                      <td className="amount">{displayAmount(d.total)}</td>
                      <td className="sub when">{formatDateTime(d.decidedAt)}</td>
                      <td><TxLink hash={d.decisionTxHash} /></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
      {operations.length ? <div className="section-gap" /> : null}
      <OperationsTransfers runs={operations} />
      <div className="panels">
          <WorkflowPanel workflow={workflow} meId={session.user.id} />
          <SignerPanel account={session.user.chainAccountId} />
      </div>
    </>
  );
}
