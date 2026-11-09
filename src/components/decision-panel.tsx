'use client';

/**
 * Approve / reject for the assigned approver. Each action names the exact version and total
 * and is signed with the approver's restricted key; the decision shows as "waiting for NEAR"
 * until the vault confirms it. Rejection needs a reason (kept off-chain).
 */
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { AlertIcon, CheckIcon, XIcon } from './icons';

export function DecisionPanel({ runId, versionId, versionNo, step, rowCount, totalDisplay, csrfToken }: {
  runId: string; versionId: string; versionNo: number; step: number; rowCount: number; totalDisplay: string; csrfToken: string;
}) {
  const router = useRouter();
  const approveDialog = useRef<HTMLDialogElement>(null);
  const rejectDialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(decision: 'approve' | 'reject') {
    if (pending) return;
    if (decision === 'reject' && reason.trim().length < 3) return setError('Give a reason (at least 3 characters).');
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/runs/${runId}/decision`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ versionId, decision, reason }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: { message: string } };
      if (!res.ok) {
        setError(body.error?.message ?? 'The decision was not recorded.');
        setPending(false);
        return;
      }
      approveDialog.current?.close();
      rejectDialog.current?.close();
      router.refresh();
    } catch {
      setError('Network error: the decision may or may not have been sent. The page will show it once NEAR confirms.');
      setPending(false);
    }
  }

  return (
    <section className="card decision" aria-labelledby="decision-h">
      <div className="decision-body">
        <div>
          <h2 id="decision-h">Your decision (step {step})</h2>
          <p>Version {versionNo} · {rowCount.toLocaleString('en-US')} recipients · <strong className="num">{totalDisplay} tUSDC</strong>. Check the recipients below before you decide.</p>
        </div>
        <div className="decision-actions">
          <button type="button" className="btn btn-secondary" onClick={() => { setError(null); rejectDialog.current?.showModal(); }}><XIcon size={16} />Reject</button>
          <button type="button" className="btn btn-primary" onClick={() => { setError(null); approveDialog.current?.showModal(); }}><CheckIcon size={16} />Approve version {versionNo}</button>
        </div>
      </div>
      <dialog ref={approveDialog} className="modal" aria-labelledby="approve-title">
        <div className="modal-head"><div><h2 id="approve-title">Approve version {versionNo}?</h2><p>{rowCount.toLocaleString('en-US')} recipients, exact total {totalDisplay} tUSDC. Your approval is signed with your approver key and checked by the vault.</p></div></div>
        <div className="modal-body">
          {error ? <div className="form-error" role="alert"><AlertIcon size={18} />{error}</div> : null}
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={() => send('approve')} disabled={pending} autoFocus>{pending ? 'Sending to NEAR…' : `Approve ${totalDisplay} tUSDC`}</button>
            <button type="button" className="btn btn-secondary" onClick={() => approveDialog.current?.close()} disabled={pending}>Back</button>
          </div>
        </div>
      </dialog>
      <dialog ref={rejectDialog} className="modal" aria-labelledby="reject-title">
        <div className="modal-head"><div><h2 id="reject-title">Reject version {versionNo}?</h2><p>The vault marks it rejected and it can never be paid. The maker can correct the run and submit a new version.</p></div></div>
        <div className="modal-body">
          <div className="field">
            <label htmlFor="reject-reason">Reason (shown to the maker, not stored on-chain)</label>
            <textarea id="reject-reason" className="textarea" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={error ? true : undefined} />
          </div>
          {error ? <div className="form-error" role="alert"><AlertIcon size={18} />{error}</div> : null}
          <div className="form-actions">
            <button type="button" className="btn btn-danger" onClick={() => send('reject')} disabled={pending}>{pending ? 'Sending to NEAR…' : 'Reject this version'}</button>
            <button type="button" className="btn btn-secondary" onClick={() => rejectDialog.current?.close()} disabled={pending}>Back</button>
          </div>
        </div>
      </dialog>
    </section>
  );
}
