'use client';

/**
 * Maker actions on a Payroll Advance request (Phase 23): decline with a reason, or submit it for
 * approval as a one-row run. Money action dialog: the net payout, the fee and the run title are
 * confirmed before anything is sent; duplicate clicks are disabled while pending.
 */
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { AlertIcon, SendIcon, XIcon } from './icons';

export function AdvanceActions({ id, name, amount, fee, net, title, approvalSummary, csrfToken, canSubmit }: {
  id: string; name: string; amount: string; fee: string; net: string; title: string; approvalSummary: string; csrfToken: string; canSubmit: boolean;
}) {
  const router = useRouter();
  const submitDialog = useRef<HTMLDialogElement>(null);
  const declineDialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(url: string, body: unknown) {
    setPending(true);
    setError(null);
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify(body) }).catch(() => null);
    const json = (await res?.json().catch(() => ({})) ?? {}) as { runId?: string; error?: string | { message?: string } };
    return { res, json };
  }

  async function submit() {
    if (pending) return;
    const { res, json } = await post(`/api/advances/${id}/submit`, {});
    if (res && (res.ok || res.status === 502) && json.runId) {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/runs/${json.runId}`);
      return;
    }
    setPending(false);
    setError(typeof json.error === 'object' ? json.error.message ?? 'Not submitted.' : json.error ?? 'Network error: reload to see whether the request was submitted.');
  }

  async function decline() {
    if (pending) return;
    const { res, json } = await post(`/api/advances/${id}/decline`, { reason });
    setPending(false);
    if (!res?.ok) { setError(typeof json.error === 'object' ? json.error.message ?? 'Not saved.' : 'Not saved.'); return; }
    declineDialog.current?.close();
    router.refresh();
  }

  return (
    <>
      <div className="form-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => { setError(null); submitDialog.current?.showModal(); }} disabled={!canSubmit}><SendIcon size={16} />Submit for approval</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setError(null); declineDialog.current?.showModal(); }}><XIcon size={16} />Decline</button>
      </div>
      <dialog ref={submitDialog} className="modal wide" aria-labelledby={`adv-submit-${id}`}>
        <div className="modal-head">
          <div><h2 id={`adv-submit-${id}`}>Submit this Payroll Advance for approval?</h2><p>A one-row run is created and registered with the vault on NEAR testnet through the normal approvals.</p></div>
          <button type="button" className="icon-btn" onClick={() => submitDialog.current?.close()} aria-label="Close" disabled={pending}><XIcon size={18} /></button>
        </div>
        <div className="modal-body">
          <dl className="kv confirm-kv">
            <dt>Run title</dt><dd>{title}</dd>
            <dt>Recipient</dt><dd>{name}</dd>
            <dt>Advance owed by the employee</dt><dd className="num">{amount} tUSDC</dd>
            <dt>Fee (stays in the vault)</dt><dd className="num">{fee} tUSDC</dd>
            <dt>Net payout committed on-chain</dt><dd className="num"><strong>{net} tUSDC</strong></dd>
            <dt>Approval</dt><dd>{approvalSummary}</dd>
          </dl>
          <div className="result wait"><AlertIcon size={16} /><span>Nothing is paid now. The server checks the eligibility again; payment happens only after the required approvals, from the vault contract.</span></div>
          {error ? <div className="form-error" role="alert"><AlertIcon size={18} />{error}</div> : null}
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={submit} disabled={pending} autoFocus>{pending ? 'Submitting to NEAR…' : `Submit ${net} tUSDC for approval`}</button>
            <button type="button" className="btn btn-secondary" onClick={() => submitDialog.current?.close()} disabled={pending}>Cancel</button>
          </div>
        </div>
      </dialog>
      <dialog ref={declineDialog} className="modal" aria-labelledby={`adv-decline-${id}`}>
        <div className="modal-head">
          <div><h2 id={`adv-decline-${id}`}>Decline {name}&apos;s request?</h2><p>The employee sees your reason. Nothing is sent to NEAR.</p></div>
          <button type="button" className="icon-btn" onClick={() => declineDialog.current?.close()} aria-label="Close" disabled={pending}><XIcon size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label htmlFor={`adv-reason-${id}`}>Reason</label>
            <textarea id={`adv-reason-${id}`} className="textarea" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          {error ? <div className="form-error" role="alert"><AlertIcon size={18} />{error}</div> : null}
          <div className="form-actions">
            <button type="button" className="btn btn-danger" onClick={decline} disabled={pending || reason.trim().length < 3}>{pending ? 'Saving…' : 'Decline request'}</button>
            <button type="button" className="btn btn-secondary" onClick={() => declineDialog.current?.close()} disabled={pending}>Cancel</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
