import type { Metadata } from 'next';
import { desc, eq } from 'drizzle-orm';
import { EditIcon, ExternalIcon } from '@/components/icons';
import { getConfig } from '@/server/config';
import { getDb } from '@/server/db/client';
import { auditEvents, users } from '@/server/db/schema';
import { activeWorkflow } from '@/server/dashboard/queries';
import { requireRole } from '@/server/web/page-auth';
import { formatDateTime } from '@/lib/format';
import { KIND_LABEL, RELEASE_LABEL, SignerPanel, WorkflowPanel } from '../workflow-panel';

export const metadata: Metadata = { title: 'Workflow settings' };

const ACTION_LABEL: Record<string, string> = {
  'auth.login': 'Signed in', 'auth.logout': 'Signed out', 'auth.login_failed': 'Failed sign-in attempt', 'workflow.updated': 'Workflow updated',
};

export default async function AdminDashboard() {
  const session = await requireRole(['admin']);
  const db = getDb();
  const config = getConfig();
  const workflow = activeWorkflow(db);
  const events = db.select({ at: auditEvents.at, action: auditEvents.action, actor: users.displayName })
    .from(auditEvents).leftJoin(users, eq(auditEvents.actorUserId, users.id)).orderBy(desc(auditEvents.id)).limit(8).all();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Workflow settings</h1>
          <p>The approval path and release mode for new payroll runs. Submitted runs keep the settings they were created with.</p>
        </div>
        <div className="page-head-actions">
          <button type="button" className="btn btn-primary" disabled aria-describedby="edit-hint"><EditIcon size={18} />Edit workflow</button>
          <span id="edit-hint" className="hint">Editing arrives in the next build (Phase 07).</span>
        </div>
      </div>

      <div className="stats">
        <div className="card stat"><div className="label">Policy</div><div className="value sm">{workflow ? KIND_LABEL[workflow.kind] : '—'}</div></div>
        <div className="card stat"><div className="label">Release</div><div className="value sm">{workflow ? RELEASE_LABEL[workflow.releaseMode] : '—'}</div></div>
        <div className="card stat"><div className="label">Workflow revision</div><div className="value">{workflow?.revision ?? '—'}</div></div>
        <div className="card stat"><div className="label">Network</div><div className="value sm">NEAR testnet</div></div>
      </div>

      <div className="grid-2">
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
            <div className="table-wrap" role="region" aria-labelledby="audit-title" tabIndex={0}>
              <table className="data">
                <thead><tr><th scope="col">Event</th><th scope="col">User</th><th scope="col">When</th></tr></thead>
                <tbody>
                  {events.map((e, i) => (
                    <tr key={i}><td>{ACTION_LABEL[e.action] ?? e.action}</td><td>{e.actor ?? '—'}</td><td className="sub">{formatDateTime(e.at)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
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
