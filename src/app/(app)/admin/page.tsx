import type { Metadata } from 'next';
import { desc, eq } from 'drizzle-orm';
import { ExternalIcon } from '@/components/icons';
import { WorkflowEditor } from '@/components/workflow-editor';
import { approverOptions, pendingWorkflow } from '@/server/workflow/service';
import { StatusChip } from '@/components/status-chip';
import { getConfig } from '@/server/config';
import { getDb } from '@/server/db/client';
import { auditEvents, users } from '@/server/db/schema';
import { activeWorkflow, allTestnetRuns, operationsTransfers, testnetTotals } from '@/server/dashboard/queries';
import { requireRole } from '@/server/web/page-auth';
import { displayAmount, formatDateTime } from '@/lib/format';
import { KIND_LABEL, KIND_SHORT, RELEASE_LABEL, SignerPanel, WorkflowPanel } from '../workflow-panel';
import { OperationsTransfers, TestnetChip, TxLink } from '../history-bits';

export const metadata: Metadata = { title: 'Workflow settings' };

const ACTION_LABEL: Record<string, string> = {
  'auth.login': 'Signed in', 'auth.logout': 'Signed out', 'auth.login_failed': 'Failed sign-in attempt', 'workflow.updated': 'Workflow updated',
  'recipient.created': 'Recipient added', 'recipient.updated': 'Recipient edited', 'recipient.deactivated': 'Recipient deactivated',
  'recipient.reactivated': 'Recipient reactivated', 'recipients.imported': 'Recipients imported',
  'settings.registered_only_on': '"Pay registered recipients only" turned on', 'settings.registered_only_off': '"Pay registered recipients only" turned off',
};

export default async function AdminDashboard() {
  const session = await requireRole(['admin']);
  const db = getDb();
  const config = getConfig();
  const workflow = activeWorkflow(db);
  const pending = pendingWorkflow(db);
  const totals = testnetTotals(db);
  const runs = allTestnetRuns(db).filter((r) => r.category === 'payroll');
  const operations = operationsTransfers(db);
  const events = db.select({ at: auditEvents.at, action: auditEvents.action, actor: users.displayName })
    .from(auditEvents).leftJoin(users, eq(auditEvents.actorUserId, users.id)).orderBy(desc(auditEvents.id)).limit(6).all();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Workflow settings</h1>
          <p>The approval path and release mode for new payroll runs. Submitted runs keep the settings they were created with.</p>
        </div>
      </div>

      {workflow ? (
        <div className="stack">
          <WorkflowEditor
            active={{ revision: workflow.revision, kind: workflow.kind, releaseMode: workflow.releaseMode, approverUserIds: workflow.approvers.map((a) => a.userId) }}
            options={approverOptions(db)}
            pending={pending ? { revision: pending.revision, chainTxHash: pending.chainTxHash } : null}
            csrfToken={session.csrfToken}
            explorerTxUrl={config.explorerTxUrl}
          />
        </div>
      ) : null}
      <div className="section-gap" />

      <div className="stats">
        <div className="card stat"><div className="label">Active policy</div><div className="value sm">{workflow ? KIND_SHORT[workflow.kind] : '—'}</div>{workflow ? <div className="foot">{KIND_LABEL[workflow.kind]}, {RELEASE_LABEL[workflow.releaseMode].toLowerCase()}</div> : null}</div>
        <div className="card stat"><div className="label">Paid on testnet</div><div className="value amount">{displayAmount(totals.paidTotal)}<small>tUSDC</small></div><div className="foot">{totals.payouts} payouts in {totals.paidRuns} runs</div></div>
        <div className="card stat"><div className="label">Rejected runs</div><div className="value">{totals.rejectedRuns}</div></div>
        <div className="card stat"><div className="label">Refused on-chain</div><div className="value">{totals.refusedAttempts}</div><div className="foot">out-of-order, wrong-role or repeat attempts</div></div>
      </div>

      <section className="card" aria-labelledby="testnet-title">
            <div className="panel-title"><h2 id="testnet-title">Testnet payroll runs</h2><span className="muted">{runs.length}</span></div>
            <div className="table-wrap" role="region" aria-labelledby="testnet-title" tabIndex={0}>
              <table className="data">
                <thead><tr><th scope="col">Run</th><th scope="col">Status</th><th scope="col" className="amount">Rows</th><th scope="col" className="amount">Total (tUSDC)</th><th scope="col">Created (UTC)</th><th scope="col">Proof</th></tr></thead>
                <tbody>{runs.map((r) => (
                  <tr key={r.id}>
                    <td><div className="title">{r.title}</div><div className="sub mono">{r.id}</div></td>
                    <td><span className="chips"><StatusChip status={r.status === 'paid' ? 'paid' : r.status === 'rejected' ? 'rejected' : 'needs_attention'} /><TestnetChip /></span></td>
                    <td className="amount">{r.rowCount}</td>
                    <td className="amount">{displayAmount(r.total)}</td>
                    <td className="sub when">{formatDateTime(r.createdAt)}</td>
                    <td><TxLink hash={r.createdTxHash} label="Created" /></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
      </section>
      {operations.length ? <div className="section-gap" /> : null}
      <OperationsTransfers runs={operations} />
      <div className="grid-2 panels">
        <div className="stack">
          <section className="card" aria-labelledby="reviewers-title">
            <div className="panel-title"><h2 id="reviewers-title">Assigned reviewers</h2></div>
            <div className="table-wrap" role="region" aria-labelledby="reviewers-title" tabIndex={0}>
              <table className="data">
                <thead><tr><th scope="col">Step</th><th scope="col">Reviewer</th><th scope="col">Signer account</th></tr></thead>
                <tbody>
                  {(workflow?.approvers ?? []).map((a, i) => (
                    <tr key={a.userId}>
                      <td>{workflow?.kind === 'two_parallel' ? 'Either order' : `Step ${i + 1}`}</td>
                      <td><div className="title">{a.displayName}</div><div className="sub">{a.email}</div></td>
                      <td>{a.chainAccountId ? <a className="mono" href={`${config.explorerAccountUrl}${a.chainAccountId}`} target="_blank" rel="noreferrer">{a.chainAccountId} <ExternalIcon size={12} /><span className="sr-only">(opens NearBlocks)</span></a> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="card" aria-labelledby="audit-title">
            <div className="panel-title"><h2 id="audit-title">Recent security events</h2></div>
            {events.length === 0 ? (
              <div className="empty"><h3>No security events yet</h3><p>Sign-ins, sign-outs and workflow changes appear here.</p></div>
            ) : (
              <div className="table-wrap" role="region" aria-labelledby="audit-title" tabIndex={0}>
                <table className="data">
                  <thead><tr><th scope="col">Event</th><th scope="col">User</th><th scope="col">When (UTC)</th></tr></thead>
                  <tbody>{events.map((e, i) => <tr key={i}><td>{ACTION_LABEL[e.action] ?? e.action}</td><td>{e.actor ?? '—'}</td><td className="sub when">{formatDateTime(e.at)}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </section>
        </div>
        <div className="stack">
          <WorkflowPanel workflow={workflow} title="Active approval path" />
          <section className="card" aria-labelledby="contracts-title">
            <div className="panel-title"><h2 id="contracts-title">Contracts</h2></div>
            <div className="panel-body">
              <dl className="kv">
                <dt>Vault</dt><dd><a className="mono" href={`${config.explorerAccountUrl}${config.vaultContractId}`} target="_blank" rel="noreferrer">{config.vaultContractId}</a></dd>
                <dt>Token</dt><dd><a className="mono" href={`${config.explorerAccountUrl}${config.tokenContractId}`} target="_blank" rel="noreferrer">{config.tokenContractId}</a></dd>
              </dl>
            </div>
          </section>
          <SignerPanel account={session.user.chainAccountId} />
        </div>
      </div>
    </>
  );
}
