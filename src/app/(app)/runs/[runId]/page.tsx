import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApprovalMap } from '@/components/approval-map';
import { PostingPreview } from '@/components/posting-preview';
import { StatusChip, type RunStatus } from '@/components/status-chip';
import { CancelVersion, ChainAutoRefresh, EditDraftLink, PendingTx, VersionRows } from '@/components/run-live';
import { DecisionPanel } from '@/components/decision-panel';
import { ReleasePanel } from '@/components/release-panel';
import { getConfig } from '@/server/config';
import { getDb } from '@/server/db/client';
import { DomainError } from '@/server/runs/repository';
import { runDetail, type RunDetail } from '@/server/runs/lifecycle';
import { actionableStep, paymentState, type PaymentState } from '@/server/runs/view';
import { requireRole } from '@/server/web/page-auth';
import { displayAmount, formatDateTime, shortHash } from '@/lib/format';
import { KIND_LABEL, RELEASE_LABEL } from '../../workflow-panel';
import { AssistantNote } from '@/components/assistant-note';
import { DirectoryCheckNote, IdentityCheckNote } from '@/components/directory-check-note';
import { unverifiedRows } from '@/server/identity/service';
import type { DirectoryCheck } from '@/server/recipients/directory';
import { directoryDrift } from '@/server/recipients/directory';

export const metadata: Metadata = { title: 'Payroll run' };

function Tx({ hash }: { hash: string | null }) {
  if (!hash) return null;
  return <a className="tx" href={`${getConfig().explorerTxUrl}${hash}`} target="_blank" rel="noreferrer">{shortHash(hash)}<span className="sr-only"> (opens NearBlocks)</span></a>;
}

function Timeline({ d, pay }: { d: RunDetail; pay: PaymentState }) {
  const v = d.version!;
  const name = (id: string) => d.approvers.find((a) => a.userId === id)?.displayName ?? 'Approver';
  const release = d.actions.filter((a) => a.kind === 'release').at(-1);
  const items: { tone: 'ok' | 'wait' | 'bad' | ''; title: string; detail: string; at: Date | null; tx: string | null }[] = [];
  items.push({ tone: v.status === 'submitting' ? 'wait' : v.status === 'submit_failed' ? 'bad' : 'ok', title: `Version ${v.versionNo} submitted by the maker`,
    detail: v.status === 'submitting' ? 'Waiting for confirmation on NEAR' : v.status === 'submit_failed' ? `Not registered: ${v.statusDetail ?? 'rejected by the vault'}` : `Registered in the vault as ${v.chainRunId}`, at: v.createdAt, tx: v.submitTxHash });
  for (const e of d.events) {
    items.push({ tone: e.status === 'confirmed' ? (e.decision === 'approve' ? 'ok' : 'bad') : e.status === 'pending' ? 'wait' : 'bad',
      title: `${name(e.approverUserId)} ${e.decision === 'approve' ? 'approved' : 'rejected'} (step ${e.step})`,
      detail: e.status === 'pending' ? 'Waiting for confirmation on NEAR' : e.status === 'failed' ? `Refused by the vault: ${e.error ?? ''}` : e.decision === 'reject' ? `Reason: ${e.reason ?? ''}` : 'Confirmed on NEAR',
      at: e.confirmedAt ?? e.createdAt, tx: e.chainTxHash });
  }
  const funding = release?.status === 'failed' && /funding|Insufficient/i.test(release.error ?? '');
  if (release) items.push({ tone: release.status === 'succeeded' ? 'ok' : funding ? 'wait' : release.status === 'failed' ? 'bad' : 'wait', title: funding ? 'Release waiting for funding' : 'Release requested', detail: funding ? `The vault holds less than ${displayAmount(v.total)} tUSDC available; ${d.snapshot?.releaseMode === 'maker' ? 'the maker can release again after funding' : 'the release worker retries every minute'}` : release.status === 'failed' ? release.error ?? 'Refused by the vault' : release.status === 'succeeded' ? `Vault reserved ${displayAmount(v.total)} tUSDC` : 'Waiting for confirmation on NEAR', at: release.chainBlockTime ?? release.updatedAt, tx: release.txHash });
  const lastPaid = pay.rows.reduce<string | null>((m, r) => (r.paidAt && (!m || r.paidAt > m) ? r.paidAt : m), null);
  if (pay.paidCount) items.push({ tone: pay.complete ? 'ok' : 'wait', title: `Payouts: ${pay.paidCount} of ${pay.rowCount} paid`, detail: pay.complete ? `All recipients paid by the vault (ft_transfer), ${displayAmount(pay.paidTotal)} tUSDC confirmed` : `Paying one recipient per transaction, ${displayAmount(pay.paidTotal)} of ${displayAmount(pay.total)} tUSDC confirmed`, at: lastPaid ? new Date(lastPaid) : null, tx: null });
  if (v.status === 'cancelled') items.push({ tone: 'bad', title: 'Cancelled', detail: v.supersededByVersionId ? 'Replaced by a newer version' : 'Cancelled by the maker before release', at: v.statusUpdatedAt, tx: null });
  return (
    <ol className="timeline-list">
      {items.map((it, i) => (
        <li key={i}>
          <span className={`dot ${it.tone}`} aria-hidden="true" />
          <span className="what"><strong>{it.title}</strong><span>{it.detail}{it.tx ? <> · <Tx hash={it.tx} /></> : null}</span></span>
          <span className="when">{it.at ? formatDateTime(it.at) : ''}</span>
        </li>
      ))}
    </ol>
  );
}

export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  const session = await requireRole(['maker', 'approver']);
  const { runId } = await params;
  const db = getDb();
  let d: RunDetail;
  try {
    d = runDetail(db, session.user, runId);
  } catch (error) {
    if (error instanceof DomainError && error.code === 'not_found') notFound();
    throw error;
  }
  const config = getConfig();
  const v = d.version;
  if (!v) {
    return (
      <div className="callout" role="note"><span>This run has no submitted version yet. {session.user.role === 'maker' ? <Link href={`/maker/runs/${runId}`}>Open the draft</Link> : null}</span></div>
    );
  }
  const pay = paymentState(d);
  const rows = pay.rows;
  const status: RunStatus = pay.status;
  const isMaker = session.user.id === d.run.makerUserId;
  const myStep = actionableStep(d, session.user.id);
  const pendingChain = v.status === 'submitting' || v.status === 'releasing' || (v.status === 'paid' && !pay.complete) || d.events.some((e) => e.status === 'pending')
    || (v.status === 'approved' && d.snapshot?.releaseMode === 'automatic');
  const paidCount = pay.paidCount;
  const approvedCount = d.events.filter((e) => e.decision === 'approve' && e.status === 'confirmed').length;
  const amounts = d.rows.map((r) => r.amount);
  const nodeStatus = (userId: string, step: number) => {
    const e = d.events.filter((x) => x.approverUserId === userId && x.status !== 'failed').at(-1);
    if (e?.status === 'pending') return 'Waiting for NEAR';
    if (e?.status === 'confirmed') return e.decision === 'approve' ? 'Approved' : 'Rejected';
    if (v.status !== 'pending_approval') return '—';
    return d.snapshot?.kind === 'two_sequential' && step === 2 && approvedCount === 0 ? 'After step 1' : 'Waiting';
  };

  return (
    <>
      <div className="run-head">
        <Link href={isMaker ? '/maker' : '/approver'} className="btn btn-ghost btn-sm run-back">← {isMaker ? 'My runs' : 'Review queue'}</Link>
        <div className="run-title">
          <h1>{d.run.title}</h1>
          <span className="run-chips"><StatusChip status={status} /><span className="chip chip-neutral">Version {v.versionNo}</span></span>
        </div>
        {/* Page actions always sit here, top right, in every run state. */}
        <div className="action-bar" data-testid="run-actions">
          {isMaker && (v.status === 'pending_approval' || v.status === 'approved') ? <CancelVersion runId={runId} versionNo={v.versionNo} csrfToken={session.csrfToken} /> : null}
          {isMaker && ['rejected', 'cancelled', 'submit_failed'].includes(v.status) ? <EditDraftLink runId={runId} label={`Edit and submit version ${v.versionNo + 1}`} /> : null}
        </div>
      </div>
      <p className="run-sub">Vault run <span className="mono">{v.chainRunId}</span>{v.vaultContractId !== config.vaultContractId ? <> in the earlier vault <span className="mono">{v.vaultContractId}</span></> : null} · {v.postingMode === 'detailed' ? 'Detailed posting' : 'Consolidated posting'} · {v.sourceFilename ? <>file <span className="mono">{v.sourceFilename}</span></> : 'manual entry'} · submitted {formatDateTime(v.createdAt)}</p>

      {d.run.assistantRequestText ? <AssistantNote text={d.run.assistantRequestText} /> : null}
      <DirectoryCheckNote check={v.directoryCheck ? JSON.parse(v.directoryCheck) as { enforced: boolean; matched: number; rows: number } : null}
        driftNow={['pending_approval', 'approved', 'submitting'].includes(v.status) ? directoryDrift(db, d.rows.map((r) => ({ accountId: r.nearAccountId, amount: r.amount }))) : 0} />
      <IdentityCheckNote check={v.directoryCheck ? (JSON.parse(v.directoryCheck) as DirectoryCheck).identity : null} rows={d.rows.length}
        unverifiedNow={['pending_approval', 'approved', 'submitting'].includes(v.status) ? unverifiedRows(db, d.rows.map((r) => ({ accountId: r.nearAccountId }))).length : 0} />

      <ChainAutoRefresh runId={runId} active={pendingChain} csrfToken={session.csrfToken}
        label={v.status === 'submitting' ? 'Submitted: waiting for the vault to confirm on NEAR' : v.status === 'releasing' || v.status === 'paid' ? `Releasing: ${paidCount} of ${pay.rowCount} recipients paid` : status === 'awaiting_funding' ? (d.snapshot?.releaseMode === 'maker' ? 'Awaiting funding: release again once the vault holds enough tUSDC' : 'Awaiting funding: the release worker retries once the vault holds enough tUSDC') : v.status === 'approved' ? 'Approved: the release worker will release this run' : 'Waiting for NEAR to confirm a decision'} />

      {myStep ? <DecisionPanel runId={runId} versionId={v.id} versionNo={v.versionNo} step={myStep} rowCount={v.rowCount} totalDisplay={displayAmount(v.total)} csrfToken={session.csrfToken} /> : null}
      {isMaker && v.status === 'approved' && d.snapshot?.releaseMode === 'maker' ? <ReleasePanel runId={runId} rowCount={v.rowCount} totalDisplay={displayAmount(v.total)} versionNo={v.versionNo} csrfToken={session.csrfToken} /> : null}

      <div className="stats">
        <div className="card stat"><div className="label">Recipients</div><div className="value">{v.rowCount.toLocaleString('en-US')}</div></div>
        <div className="card stat"><div className="label">Exact total</div><div className="value amount">{displayAmount(v.total)}<small>tUSDC</small></div></div>
        <div className="card stat"><div className="label">Approvals</div><div className="value">{approvedCount} of {d.approvers.length}</div><div className="foot">{d.snapshot ? `${KIND_LABEL[d.snapshot.kind]}, ${RELEASE_LABEL[d.snapshot.releaseMode].toLowerCase()}` : ''}</div></div>
        <div className="card stat"><div className="label">Paid</div><div className="value">{paidCount} of {pay.rowCount}</div><div className="foot">{displayAmount(pay.paidTotal)} of {displayAmount(pay.total)} tUSDC confirmed</div></div>
      </div>

      <div className="grid-2">
        <section className="card" aria-labelledby="proof-h">
          <div className="panel-title"><h2 id="proof-h">Proof timeline</h2>{v.status === 'submitting' ? <PendingTx hash={v.submitTxHash} explorerTxUrl={config.explorerTxUrl} text="Waiting for NEAR" /> : null}</div>
          <div className="panel-body"><Timeline d={d} pay={pay} /></div>
        </section>
        <section className="card" aria-labelledby="map-h">
          <div className="panel-title"><h2 id="map-h">Approval map (snapshot)</h2><span className="chip chip-info">Revision {d.snapshot?.revision}</span></div>
          <div className="panel-body">
            {d.snapshot ? <ApprovalMap kind={d.snapshot.kind} releaseMode={d.snapshot.releaseMode} approvers={d.approvers.map((a) => ({ name: a.displayName, status: nodeStatus(a.userId, a.step), isMe: a.userId === session.user.id }))} caption="Approval map of this version" /> : null}
          </div>
        </section>
      </div>
      <div className="section-gap" />
      {d.canViewRecipients ? <VersionRows rows={rows} explorerTxUrl={config.explorerTxUrl} total={v.total.toString()} /> : null}
      <div className="section-gap" />
      <PostingPreview mode={v.postingMode} title={d.run.title} rowCount={v.rowCount} total={v.total} firstAmounts={amounts.slice(0, 3)} />
      {d.versions.length > 1 ? (
        <>
          <div className="section-gap" />
          <section className="card" aria-labelledby="versions-h">
            <div className="panel-title"><h2 id="versions-h">Earlier versions</h2></div>
            <div className="table-wrap"><table className="data"><thead><tr><th scope="col">Version</th><th scope="col">Status</th><th scope="col" className="amount">Total (tUSDC)</th><th scope="col">Submitted (UTC)</th></tr></thead>
              <tbody>{d.versions.slice(1).map((o) => <tr key={o.id}><td>Version {o.versionNo}</td><td><StatusChip status={o.status} /></td><td className="amount">{displayAmount(o.total)}</td><td className="sub when">{formatDateTime(o.createdAt)}</td></tr>)}</tbody></table></div>
          </section>
        </>
      ) : null}
    </>
  );
}
