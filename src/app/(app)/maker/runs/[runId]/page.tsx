import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ManualBuilder } from '@/components/manual-builder';
import { StatusChip } from '@/components/status-chip';
import { getDb } from '@/server/db/client';
import { activeLimits, draftView } from '@/server/runs/draft-service';
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
  const limits = activeLimits(db);
  return (
    <>
      <div className="builder-head">
        <Link href="/maker" className="btn btn-ghost btn-sm">← My runs</Link>
        <h1>{view.run.title}</h1>
        <StatusChip status="draft" />
        <span className="chip chip-neutral">{view.run.source === 'upload' ? 'File upload' : 'Manual entry'}</span>
      </div>
      {view.run.source === 'manual' ? (
        <ManualBuilder runId={view.run.id} title={view.run.title} postingMode={view.run.postingMode} revision={view.run.draftRevision}
          rows={view.rows.map(({ sourceLine: _s, ...r }) => r)} csrfToken={session.csrfToken}
          limits={{ maxRowAmount: limits.maxRowAmount.toString(), maxRunTotal: limits.maxRunTotal.toString() }} />
      ) : (
        <UploadPanel runId={view.run.id} title={view.run.title} postingMode={view.run.postingMode} revision={view.run.draftRevision}
          csrfToken={session.csrfToken} hasDraft={view.rows.length > 0} activeFile={view.run.draftFilename} />
      )}
    </>
  );
}
