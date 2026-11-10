'use client';

/**
 * Money action dialog for submission (design system): count, exact total, token, version and
 * consequence before submit; duplicate clicks disabled while pending; an uncertain outcome
 * keeps the version and offers a refresh instead of starting again.
 */
import { useRef, useState } from 'react';
import { AlertIcon, SendIcon, XIcon } from './icons';

/** Phase 23: the Payroll Advance instalments this run would carry (all display strings + the plan fingerprint). */
export interface InstalmentSummary { count: number; total: string; netTotal: string; fingerprint: string }

export function SubmitPanel({ runId, revision, rowCount, totalDisplay, nextVersion, replaces, approvalSummary, csrfToken, instalments = null }: {
  runId: string; revision: number; rowCount: number; totalDisplay: string; nextVersion: number; replaces: number | null;
  approvalSummary: string; csrfToken: string; instalments?: InstalmentSummary | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apply, setApply] = useState(true);
  const committed = instalments && apply ? instalments.netTotal : totalDisplay;

  async function submit() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/runs/${runId}/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ expectedRevision: revision, supersede: replaces !== null, ...(instalments ? { applyInstalments: apply, expectedInstalments: instalments.fingerprint } : {}) }),
      });
      const body = (await res.json()) as { status?: string; error?: string | { message: string } };
      if (res.ok || res.status === 502) {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(`/runs/${runId}`);
        return;
      }
      setError(typeof body.error === 'object' ? body.error.message : body.error ?? 'Submission failed.');
      setPending(false);
    } catch {
      setError('Network error: the submission may or may not have been sent. Open the run to check its status before trying again.');
      setPending(false);
    }
  }

  return (
    <>
      {instalments ? (
        <label className="consent" data-testid="apply-instalments">
          <input type="checkbox" checked={apply} onChange={(e) => setApply(e.target.checked)} />
          <span><strong>Apply Payroll Advance instalments</strong>: deduct {instalments.total} tUSDC from {instalments.count} row{instalments.count === 1 ? '' : 's'} (net total {instalments.netTotal} tUSDC is committed on-chain). Turn off only to pay this run without deductions; the instalment then stays due.</span>
        </label>
      ) : null}
      <div className="form-actions">
        <button type="button" className="btn btn-primary btn-lg" onClick={() => dialog.current?.showModal()}><SendIcon size={18} />Submit for approval</button>
        <span className="hint">You will confirm the total before anything is sent.</span>
      </div>
      <dialog ref={dialog} className="modal wide" aria-labelledby="submit-title">
        <div className="modal-head">
          <div>
            <h2 id="submit-title">Submit version {nextVersion} for approval?</h2>
            <p>The rows below are frozen into an immutable version and registered with the vault on NEAR testnet.</p>
          </div>
          <button type="button" className="icon-btn" onClick={() => dialog.current?.close()} aria-label="Close" disabled={pending}><XIcon size={18} /></button>
        </div>
        <div className="modal-body">
          <dl className="kv confirm-kv">
            <dt>Recipients</dt><dd className="num">{rowCount.toLocaleString('en-US')}</dd>
            {instalments ? (
              <>
                <dt>Gross total</dt><dd className="num">{totalDisplay} tUSDC</dd>
                <dt>Payroll Advance instalments</dt><dd className="num">{apply ? `−${instalments.total} tUSDC (${instalments.count} row${instalments.count === 1 ? '' : 's'})` : 'Not applied'}</dd>
                <dt>Exact total committed</dt><dd className="num"><strong>{committed} tUSDC</strong></dd>
              </>
            ) : <><dt>Exact total</dt><dd className="num">{totalDisplay} tUSDC</dd></>}
            <dt>Token</dt><dd>tUSDC (zero-value test token, 6 decimals)</dd>
            <dt>Version</dt><dd>{nextVersion}{replaces !== null ? ` (replaces version ${replaces}, which is cancelled on-chain)` : ''}</dd>
            <dt>Approval</dt><dd>{approvalSummary}</dd>
          </dl>
          <div className="result wait"><AlertIcon size={16} /><span>Nothing is paid now. Payment happens only after the required approvals, from the vault contract.</span></div>
          {error ? <div className="form-error" role="alert"><AlertIcon size={18} />{error}</div> : null}
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={submit} disabled={pending} autoFocus>{pending ? 'Submitting to NEAR…' : `Submit ${committed} tUSDC for approval`}</button>
            <button type="button" className="btn btn-secondary" onClick={() => dialog.current?.close()} disabled={pending}>Cancel</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
