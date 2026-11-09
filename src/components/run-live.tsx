'use client';

/** Client pieces of the run detail page: chain auto-refresh, paged rows, maker actions. */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { displayAmount, formatUtcCell, shortHash } from '@/lib/format';
import { CopyValue } from './copy-value';
import { AlertIcon, ClockIcon, ExternalIcon, XIcon } from './icons';

/** While something waits for NEAR, re-reads the vault every 3 s and refreshes the page. */
export function ChainAutoRefresh({ runId, active, csrfToken, label }: { runId: string; active: boolean; csrfToken: string; label: string }) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (!active) return;
    let stop = false;
    const tick = async () => {
      setChecking(true);
      try {
        await fetch(`/api/runs/${runId}/reconcile`, { method: 'POST', headers: { 'x-csrf-token': csrfToken } });
      } finally {
        setChecking(false);
        if (!stop) router.refresh();
      }
    };
    const id = setInterval(tick, 3000);
    void tick();
    return () => { stop = true; clearInterval(id); };
  }, [active, runId, csrfToken, router]);
  if (!active) return null;
  return <div className="result wait live-banner" role="status"><span className="spinner" aria-hidden="true" /><span>{label}{checking ? ' · checking NEAR…' : ''}</span></div>;
}

export interface RowView { index: number; line: number | null; account: string; name: string; amount: string; status: string; txHash: string | null; paidAt: string | null }
const ROW_STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: 'Not paid yet', tone: 'neutral' }, inflight: { label: 'Paying…', tone: 'info' }, paid: { label: 'Paid', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' }, unknown: { label: 'Checking', tone: 'waiting' },
};

export function VersionRows({ rows, explorerTxUrl, total }: { rows: RowView[]; explorerTxUrl: string; total: string }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / 50));
  const slice = rows.slice(page * 50, page * 50 + 50);
  return (
    <section className="card" aria-labelledby="rows-h">
      <div className="panel-title"><h2 id="rows-h">Recipients ({rows.length.toLocaleString('en-US')})</h2><span className="hint">Total <strong className="num">{displayAmount(BigInt(total))} tUSDC</strong> · rows {page * 50 + 1}–{Math.min(rows.length, page * 50 + 50)}</span></div>
      <div className="table-wrap review-scroll" role="region" aria-labelledby="rows-h" tabIndex={0}>
        <table className="data review payouts">
          <thead><tr><th scope="col" title="Row number in the uploaded file (the header is row 1)">File row</th><th scope="col">NEAR account</th><th scope="col">Receiver</th><th scope="col" className="amount">Amount (tUSDC)</th><th scope="col">Payout</th><th scope="col" title="Time of the block that includes the payout, as the explorer shows it">Paid (UTC)</th><th scope="col">Proof</th></tr></thead>
          <tbody>{slice.map((r) => {
            const st = ROW_STATUS[r.status] ?? ROW_STATUS.pending!;
            return (
              <tr key={r.index}>
                <td className="num sub">{r.line ?? r.index + 1}</td>
                <td className="nowrap"><CopyValue value={r.account} label="NEAR account" size="lg" /></td>
                <td>{r.name}</td>
                <td className="amount">{displayAmount(BigInt(r.amount))}</td>
                <td><span className={`chip chip-${st.tone}`}>{st.label}</span></td>
                <td className="sub when">{r.paidAt ? formatUtcCell(new Date(r.paidAt)) : '—'}</td>
                <td>{r.txHash ? <a className="tx" href={`${explorerTxUrl}${r.txHash}`} target="_blank" rel="noreferrer">{shortHash(r.txHash)} <ExternalIcon size={12} /><span className="sr-only">(opens NearBlocks)</span></a> : <span className="muted">—</span>}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      {pages > 1 ? (
        <div className="toolbar pager-bar"><nav className="pager" aria-label="Recipient pages">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPage((p) => p - 1)} disabled={page === 0}>Previous</button>
          <span className="hint">Page {page + 1} of {pages}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPage((p) => p + 1)} disabled={page >= pages - 1}>Next</button>
        </nav></div>
      ) : null}
    </section>
  );
}

/** Maker: cancel a version that has not been released (cancel_run on-chain). */
export function CancelVersion({ runId, versionNo, csrfToken }: { runId: string; versionNo: number; csrfToken: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function cancel() {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/runs/${runId}/cancel`, { method: 'POST', headers: { 'x-csrf-token': csrfToken } });
    const body = (await res.json().catch(() => ({}))) as { error?: { message: string } };
    setPending(false);
    if (!res.ok) return setError(body.error?.message ?? 'Cancellation failed.');
    dialog.current?.close();
    router.refresh();
  }
  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => dialog.current?.showModal()}><XIcon size={16} />Cancel version {versionNo}</button>
      <dialog ref={dialog} className="modal" aria-labelledby="cancel-title">
        <div className="modal-head"><div><h2 id="cancel-title">Cancel version {versionNo}?</h2><p>The vault marks it cancelled; it can never be approved or paid. You can then edit the draft and submit a new version.</p></div></div>
        <div className="modal-body">
          {error ? <div className="form-error" role="alert"><AlertIcon size={18} />{error}</div> : null}
          <div className="form-actions">
            <button type="button" className="btn btn-danger" onClick={cancel} disabled={pending}>{pending ? 'Cancelling on NEAR…' : 'Cancel this version'}</button>
            <button type="button" className="btn btn-secondary" onClick={() => dialog.current?.close()} disabled={pending}>Keep it</button>
          </div>
        </div>
      </dialog>
    </>
  );
}

export function EditDraftLink({ runId, label }: { runId: string; label: string }) {
  return <Link className="btn btn-primary btn-sm" href={`/maker/runs/${runId}`}>{label}</Link>;
}

export function PendingTx({ hash, explorerTxUrl, text }: { hash: string | null; explorerTxUrl: string; text: string }) {
  return (
    <span className="pending-tx"><ClockIcon size={14} /> {text}{hash ? <> · <a className="tx" href={`${explorerTxUrl}${hash}`} target="_blank" rel="noreferrer">{shortHash(hash)} <ExternalIcon size={12} /></a></> : null}</span>
  );
}
