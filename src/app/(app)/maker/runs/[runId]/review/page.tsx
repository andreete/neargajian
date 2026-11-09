import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApprovalMap } from '@/components/approval-map';
import { PostingPreview } from '@/components/posting-preview';
import { StatusChip } from '@/components/status-chip';
import { SubmitPanel } from '@/components/submit-panel';
import { ReviewTable } from '@/components/upload-panel';
import { AlertIcon } from '@/components/icons';
import { getDb } from '@/server/db/client';
import { activeWorkflow } from '@/server/dashboard/queries';
import { draftLock, draftView } from '@/server/runs/draft-service';
import { latestVersion } from '@/server/runs/lifecycle';
import { DomainError } from '@/server/runs/repository';
import { requireRole } from '@/server/web/page-auth';
import { displayAmount } from '@/lib/format';
import { KIND_LABEL, RELEASE_LABEL } from '../../../../workflow-panel';

export const metadata: Metadata = { title: 'Review before submitting' };

export default async function ReviewPage({ params }: { params: Promise<{ runId: string }> }) {
  const session = await requireRole(['maker']);
  const { runId } = await params;
  const db = getDb();
  let view;
  try {
    view = draftView(db, session.user, runId);
  } catch (error) {
    if (error instanceof DomainError && error.code === 'not_found') notFound();
    throw error;
  }
  const lock = draftLock(db, runId);
  const latest = latestVersion(db, runId);
  const wf = activeWorkflow(db);
  const s = view.summary;
  const ready = !lock && s.invalidCount === 0 && s.runErrors.length === 0 && s.validCount > 0 && wf;
  const amounts = s.rows.flatMap((r) => (r.valid ? [r.valid.amount] : []));
  const names = wf?.approvers.map((a) => a.displayName) ?? [];
  const approvalSummary = wf ? `${KIND_LABEL[wf.kind]} (${names.join(wf.kind === 'two_sequential' ? ' then ' : ' and ')}), ${RELEASE_LABEL[wf.releaseMode].toLowerCase()}` : 'No active workflow';

  return (
    <>
      <div className="builder-head">
        <Link href={`/maker/runs/${runId}`} className="btn btn-ghost btn-sm">← Back to the draft</Link>
        <h1>Review: {view.run.title}</h1>
        <StatusChip status="draft" />
      </div>
      {!ready ? (
        <div className="callout" role="note"><AlertIcon size={18} /><span>{lock ?? (s.validCount === 0 ? 'Add at least one row first.' : s.invalidCount ? `${s.invalidCount} row${s.invalidCount === 1 ? ' has' : 's have'} errors. Fix them or keep only the valid rows before submitting.` : 'An admin must activate an approval workflow first.')}</span></div>
      ) : null}
      <div className="stats">
        <div className="card stat"><div className="label">Recipients</div><div className="value">{s.validCount.toLocaleString('en-US')}</div></div>
        <div className="card stat"><div className="label">Exact total</div><div className="value amount">{displayAmount(s.validTotal)}<small>tUSDC</small></div></div>
        <div className="card stat"><div className="label">Posting</div><div className="value sm">{view.run.postingMode === 'detailed' ? 'Detailed (one entry per recipient)' : 'Consolidated (one entry)'}</div></div>
        <div className="card stat"><div className="label">Source</div><div className="value sm">{view.run.source === 'upload' ? <span className="mono">{view.run.draftFilename}</span> : 'Manual entry'}</div>{view.run.draftFileSha256 ? <div className="foot mono">SHA-256 {view.run.draftFileSha256.slice(0, 16)}…</div> : null}</div>
      </div>
      <div className="stack">
        {wf ? (
          <section className="card" aria-labelledby="path-title">
            <div className="panel-title"><h2 id="path-title">Approval path for this version</h2><span className="chip chip-info">Workflow revision {wf.revision}</span></div>
            <div className="panel-body"><ApprovalMap kind={wf.kind} releaseMode={wf.releaseMode} approvers={wf.approvers.map((a) => ({ name: a.displayName }))} caption="Approval path" /></div>
          </section>
        ) : null}
        <div className="posting-pair">
          <div className={view.run.postingMode === 'consolidated' ? 'is-selected-wrap' : undefined}><PostingPreview mode="consolidated" title={view.run.title} rowCount={s.validCount} total={s.validTotal} firstAmounts={amounts.slice(0, 3)} /></div>
          <div className={view.run.postingMode === 'detailed' ? 'is-selected-wrap' : undefined}><PostingPreview mode="detailed" title={view.run.title} rowCount={s.validCount} total={s.validTotal} firstAmounts={amounts.slice(0, 3)} /></div>
        </div>
        <ReviewTable rows={view.rows} total={s.validTotal} />
        {ready ? (
          <section className="card card-pad" aria-labelledby="submit-h">
            <h2 id="submit-h" className="panel-h">Submit</h2>
            <SubmitPanel runId={runId} revision={view.run.draftRevision} rowCount={s.validCount} totalDisplay={displayAmount(s.validTotal)}
              nextVersion={(latest?.versionNo ?? 0) + 1} replaces={null} approvalSummary={approvalSummary} csrfToken={session.csrfToken} />
          </section>
        ) : null}
      </div>
    </>
  );
}
