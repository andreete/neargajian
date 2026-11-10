'use client';

/**
 * Employee (Phase 23b): withdraw a Payroll Advance request while it is still "Requested", after a
 * confirmation. The server decides (it refuses once the maker has submitted the request); nothing
 * is sent to NEAR. Duplicate clicks are disabled while pending.
 */
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { AlertIcon, XIcon } from './icons';

export function AdvanceWithdraw({ id, amount, csrfToken }: { id: string; amount: string; csrfToken: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withdraw() {
    if (pending) return;
    setPending(true);
    setError(null);
    const res = await fetch(`/api/employee/advances/${encodeURIComponent(id)}/withdraw`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken }, body: '{}',
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({})) ?? {}) as { error?: { message?: string } };
    setPending(false);
    if (!res || !res.ok) {
      setError(body.error?.message ?? 'Network error: reload the page to see whether the request was withdrawn.');
      router.refresh();
      return;
    }
    dialog.current?.close();
    router.refresh();
  }

  return (
    <>
      <div className="form-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setError(null); dialog.current?.showModal(); }}><XIcon size={16} />Withdraw request</button>
        <span className="hint">Possible until the payroll maker submits it.</span>
      </div>
      <dialog ref={dialog} className="modal" aria-labelledby={`adv-withdraw-${id}`}>
        <div className="modal-head">
          <div><h2 id={`adv-withdraw-${id}`}>Withdraw your Payroll Advance request?</h2><p>Your request for {amount} tUSDC is cancelled before the payroll maker submits it. Nothing has been paid and nothing is sent to NEAR.</p></div>
          <button type="button" className="icon-btn" onClick={() => dialog.current?.close()} aria-label="Close" disabled={pending}><XIcon size={18} /></button>
        </div>
        <div className="modal-body">
          <p>The request then shows as Withdrawn, no salary is deducted for it, and you can request a new Payroll Advance.</p>
          {error ? <div className="form-error" role="alert"><AlertIcon size={18} />{error}</div> : null}
          <div className="form-actions">
            <button type="button" className="btn btn-danger" onClick={withdraw} disabled={pending} autoFocus>{pending ? 'Withdrawing…' : 'Yes, withdraw request'}</button>
            <button type="button" className="btn btn-secondary" onClick={() => dialog.current?.close()} disabled={pending}>Keep the request</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
