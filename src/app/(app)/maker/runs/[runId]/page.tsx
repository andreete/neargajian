import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ManualBuilder } from '@/components/manual-builder';
import { StatusChip } from '@/components/status-chip';
import { getDb } from '@/server/db/client';
import { activeLimits, draftLock, draftView } from '@/server/runs/draft-service';
import { latestVersion } from '@/server/runs/lifecycle';
import { AlertIcon } from '@/components/icons';
import { DomainError } from '@/server/runs/repository';
import { requireRole } from '@/server/web/page-auth';
import { UploadPanel } from '@/components/upload-panel';

export const metadata: Metadata = { title: 'Run builder' };

export default async function RunBuilderPage({ params }: { params: Promise<{ runId: string }> }) {
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
  if (draftLock(db, runId)) redirect(`/runs/${runId}`);
  const latest = latestVersion(db, runId);
  const limits = activeLimits(db);
  return (
    <>
      <div className="builder-head">
        <Link href="/maker" className="btn btn-ghost btn-sm">← My runs</Link>
        <h1>{view.run.title}</h1>
        <StatusChip status="draft" />
        <span className="chip chip-neutral">{view.run.source === 'upload' ? 'File upload' : 'Manual entry'}</span>
      </div>
      {latest ? (
        <div className="callout" role="note"><AlertIcon size={18} /><span>Version {latest.versionNo} was {latest.status === 'rejected' ? 'rejected' : latest.status === 'cancelled' ? 'cancelled' : 'not registered by the vault'}{latest.statusDetail ? ` (${latest.statusDetail})` : ''}. Edit the draft and submit version {latest.versionNo + 1}; it needs fresh approvals. <a href={`/runs/${runId}`}>See version {latest.versionNo}</a></span></div>
      ) : null}
      {view.run.source === 'manual' ? (
        <ManualBuilder runId={view.run.id} title={view.run.title} postingMode={view.run.postingMode} revision={view.run.draftRevision}
          rows={view.rows.map(({ sourceLine: _s, ...r }) => r)} csrfToken={session.csrfToken}
          limits={{ maxRowAmount: limits.maxRowAmount.toString(), maxRunTotal: limits.maxRunTotal.toString() }} />
      ) : (
        <UploadPanel key={view.run.draftRevision} runId={view.run.id} title={view.run.title} postingMode={view.run.postingMode} revision={view.run.draftRevision}
          csrfToken={session.csrfToken} rows={view.rows}
          activeFile={view.run.draftFilename ? { name: view.run.draftFilename, sha256: view.run.draftFileSha256 } : null} />
      )}
    </>
  );
}
