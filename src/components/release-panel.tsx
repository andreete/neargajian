'use client';

/** Maker release (maker-release runs): money action dialog with count, total and consequence. */
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { AlertIcon, SendIcon } from './icons';

export function ReleasePanel({ runId, rowCount, totalDisplay, versionNo, csrfToken }: { runId: string; rowCount: number; totalDisplay: string; versionNo: number; csrfToken: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function release() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/runs/${runId}/release`, { method: 'POST', headers: { 'x-csrf-token': csrfToken } });
      const body = (await res.json().catch(() => ({}))) as { error?: { message: string } };
      if (!res.ok) { setError(body.error?.message ?? 'Release failed.'); setPending(false); return; }
      dialog.current?.close();
      router.refresh();
    } catch {
      setError('Network error: the release may or may not have been sent. The page shows the vault state once confirmed.');
      setPending(false);
    }
  }
  return (
    <section className="card decision" aria-labelledby="release-h">
      <div className="decision-body">
        <div><h2 id="release-h">Ready to release</h2><p>Version {versionNo} is approved. Releasing reserves {totalDisplay} tUSDC in the vault; the release worker then pays each recipient.</p></div>
        <div className="decision-actions"><button type="button" className="btn btn-primary" onClick={() => dialog.current?.showModal()}><SendIcon size={16} />Release payments</button></div>
      </div>
      <dialog ref={dialog} className="modal" aria-labelledby="release-title">
        <div className="modal-head"><div><h2 id="release-title">Release {totalDisplay} tUSDC?</h2><p>{rowCount.toLocaleString('en-US')} recipients, version {versionNo}. The vault reserves the full total now and pays one recipient per transaction. This cannot be undone.</p></div></div>
        <div className="modal-body">
          {error ? <div className="form-error" role="alert"><AlertIcon size={18} />{error}</div> : null}
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={release} disabled={pending} autoFocus>{pending ? 'Releasing on NEAR…' : `Release ${totalDisplay} tUSDC`}</button>
            <button type="button" className="btn btn-secondary" onClick={() => dialog.current?.close()} disabled={pending}>Not now</button>
          </div>
        </div>
      </dialog>
    </section>
  );
}
