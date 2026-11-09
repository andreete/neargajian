'use client';

/**
 * Manual payroll builder: editable rows with inline validation (same rules as the server),
 * exact totals, duplicate-wallet warnings, posting mode with a live posting preview, draft
 * saving with optimistic concurrency, and an explicit "keep only the valid rows" step.
 * Rows are never dropped silently.
 */
import { useMemo, useRef, useState } from 'react';
import { emptyRow, FIELD_LABEL, validateRows, type Field, type RawRow } from '@/server/payroll/validate';
import { displayAmount } from '@/lib/format';
import { AlertIcon, CheckIcon, PlusIcon, XIcon } from './icons';
import { PostingPreview } from './posting-preview';

interface Props {
  runId: string;
  title: string;
  postingMode: 'consolidated' | 'detailed';
  revision: number;
  rows: RawRow[];
  limits: { maxRowAmount: string; maxRunTotal: string };
  csrfToken: string;
}

const COLUMNS: { field: Field; className: string; placeholder: string; inputMode?: 'decimal' | 'email' | 'tel' }[] = [
  { field: 'near_account_id', className: 'col-account', placeholder: 'name.testnet' },
  { field: 'receiver_name', className: 'col-name', placeholder: 'Full name' },
  { field: 'amount', className: 'col-amount', placeholder: '0.05', inputMode: 'decimal' },
  { field: 'mobile_phone', className: 'col-phone', placeholder: '+44 7700 900123', inputMode: 'tel' },
  { field: 'email', className: 'col-email', placeholder: 'name@example.com', inputMode: 'email' },
];

export function ManualBuilder(props: Props) {
  const [rows, setRows] = useState<RawRow[]>(props.rows.length ? props.rows : [emptyRow()]);
  const [title, setTitle] = useState(props.title);
  const [postingMode, setPostingMode] = useState(props.postingMode);
  const [revision, setRevision] = useState(props.revision);
  const [touched, setTouched] = useState<Set<number>>(() => new Set(props.rows.map((_, i) => i)));
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<{ tone: 'ok' | 'bad' | 'wait'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const limits = useMemo(() => ({ maxRowAmount: BigInt(props.limits.maxRowAmount), maxRunTotal: BigInt(props.limits.maxRunTotal) }), [props.limits]);
  const summary = useMemo(() => validateRows(rows, limits), [rows, limits]);
  const invalidIndexes = summary.rows.filter((r) => !r.valid).map((r) => r.index);
  const duplicateOf = (index: number) => {
    for (const [, idx] of summary.duplicateWallets) if (idx.includes(index)) return idx.filter((x) => x !== index).map((x) => x + 1);
    return [];
  };
  const firstAmounts = summary.rows.flatMap((r) => (r.valid ? [r.valid.amount] : [])).slice(0, 3);

  function update(index: number, field: Field, value: string) {
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
    setDirty(true);
  }
  function addRow() {
    setRows((rs) => [...rs, emptyRow()]);
    setDirty(true);
  }
  function removeRow(index: number) {
    setRows((rs) => (rs.length === 1 ? [emptyRow()] : rs.filter((_, i) => i !== index)));
    setTouched((t) => new Set([...t].filter((i) => i !== index).map((i) => (i > index ? i - 1 : i))));
    setDirty(true);
  }

  async function save(): Promise<number | null> {
    setBusy(true);
    setTouched(new Set(rows.map((_, i) => i)));
    try {
      const res = await fetch(`/api/runs/${props.runId}/draft`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-csrf-token': props.csrfToken },
        body: JSON.stringify({ expectedRevision: revision, title, postingMode, rows }),
      });
      const body = (await res.json()) as { revision?: number; error?: { message: string } };
      if (!res.ok || body.revision === undefined) {
        setStatus({ tone: 'bad', text: body.error?.message ?? 'Saving failed.' });
        return null;
      }
      setRevision(body.revision);
      setDirty(false);
      setStatus({ tone: 'ok', text: `Draft saved (${summary.validCount} valid, ${summary.invalidCount} with errors).` });
      return body.revision;
    } catch {
      setStatus({ tone: 'bad', text: 'Network error. Your changes are not saved yet.' });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function confirmSubset() {
    const rev = dirty ? await save() : revision;
    if (rev === null) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/runs/${props.runId}/draft/confirm-subset`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': props.csrfToken },
        body: JSON.stringify({ expectedRevision: rev, removeIndexes: invalidIndexes }),
      });
      const body = (await res.json()) as { revision?: number; removed?: number; error?: { message: string } };
      if (!res.ok || body.revision === undefined) {
        setStatus({ tone: 'bad', text: body.error?.message ?? 'Could not remove the invalid rows.' });
        return;
      }
      setRows((rs) => rs.filter((_, i) => !invalidIndexes.includes(i)));
      setTouched(new Set());
      setRevision(body.revision);
      setDirty(false);
      setStatus({ tone: 'ok', text: `Removed ${body.removed} invalid row${body.removed === 1 ? '' : 's'}. The draft now has only valid rows.` });
      dialog.current?.close();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="builder-grid">
      <section className="card" aria-labelledby="rows-title">
        <div className="panel-title">
          <h2 id="rows-title">Recipients</h2>
          <div className="field">
            <label className="sr-only" htmlFor="title-input">Run title</label>
            <input id="title-input" value={title} maxLength={120} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} />
          </div>
        </div>
        <div className="table-wrap" role="region" aria-labelledby="rows-title" tabIndex={0}>
          <table className="rows-table">
            <thead>
              <tr>
                <th scope="col" className="col-row">Row</th>
                {COLUMNS.map((c) => <th key={c.field} scope="col" className={c.className}>{c.field === 'amount' ? 'Amount (tUSDC)' : FIELD_LABEL[c.field]}</th>)}
                <th scope="col" className="col-remove"><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const result = summary.rows[i];
                const show = touched.has(i);
                const rowHasError = show && Boolean(result?.errors.length);
                const dups = duplicateOf(i);
                return (
                  <tr key={i} className={rowHasError ? 'has-error' : undefined} data-testid={`row-${i + 1}`}>
                    <td className="rownum">{i + 1}</td>
                    {COLUMNS.map((c) => {
                      const error = show ? (result?.errors.filter((e) => e.field === c.field || (c.field === 'amount' && e.field === 'currency')).map((e) => e.message).join(' ') || undefined) : undefined;
                      const id = `r${i}-${c.field}`;
                      const label = `Row ${i + 1} ${FIELD_LABEL[c.field]}`;
                      return (
                        <td key={c.field} className={c.className}>
                          {c.field === 'currency' ? (
                            <select id={id} aria-label={label} value={row.currency} onChange={(e) => update(i, 'currency', e.target.value)} aria-invalid={error ? true : undefined}>
                              <option value="tUSDC">tUSDC</option>
                              {row.currency && row.currency !== 'tUSDC' ? <option value={row.currency}>{row.currency}</option> : null}
                            </select>
                          ) : (
                            <input id={id} aria-label={label} value={row[c.field]} placeholder={c.placeholder} inputMode={c.inputMode}
                              className={c.field === 'amount' ? 'amount-input' : undefined} spellCheck={false} autoComplete="off"
                              onChange={(e) => update(i, c.field, e.target.value)} onBlur={() => setTouched((t) => new Set(t).add(i))}
                              aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined} />
                          )}
                          {error ? <span id={`${id}-err`} className="cell-error">{error}</span> : null}
                          {c.field === 'near_account_id' && dups.length ? <span className="dup">Same wallet as row {dups.join(', ')} (allowed, check it)</span> : null}
                        </td>
                      );
                    })}
                    <td><button type="button" className="icon-btn" onClick={() => removeRow(i)} aria-label={`Remove row ${i + 1}`}><XIcon size={16} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="toolbar">
          <button type="button" className="btn btn-secondary btn-sm" onClick={addRow} disabled={rows.length >= 1000}><PlusIcon size={16} />Add row</button>
          <span className="hint">Amounts in tUSDC with up to 6 decimals and a dot as decimal separator. Per-row cap {displayAmount(limits.maxRowAmount)} tUSDC.</span>
        </div>
        <div className="summary-bar" aria-live="polite">
          <div className="facts">
            <span><strong>{rows.length}</strong> rows</span>
            <span><strong>{summary.validCount}</strong> valid</span>
            <span><strong>{summary.invalidCount}</strong> with errors</span>
            <span>Total of valid rows <strong>{displayAmount(summary.validTotal)} tUSDC</strong></span>
            {summary.runErrors.map((e) => <span key={e} className="field-error">{e}</span>)}
          </div>
          <div className="actions">
            {status ? <span className={`hint ${status.tone === 'bad' ? 'field-error' : ''}`} role={status.tone === 'bad' ? 'alert' : 'status'}>{status.tone === 'ok' ? <CheckIcon size={14} /> : null} {status.text}</span> : null}
            <button type="button" className="btn btn-secondary btn-sm" onClick={save} disabled={busy}>{busy ? 'Saving…' : dirty ? 'Save draft' : 'Saved'}</button>
            {summary.invalidCount > 0 && summary.validCount > 0 ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => { setTouched(new Set(rows.map((_, i) => i))); dialog.current?.showModal(); }} disabled={busy}>
                Continue with {summary.validCount} valid row{summary.validCount === 1 ? '' : 's'}
              </button>
            ) : (
              summary.validCount > 0 && summary.invalidCount === 0 && summary.runErrors.length === 0 && !dirty
                ? <a className="btn btn-primary btn-sm" href={`/maker/runs/${props.runId}/review`}>Continue to review</a>
                : <button type="button" className="btn btn-primary btn-sm" disabled aria-describedby="review-hint">Continue to review</button>
            )}
            <span id="review-hint" className="sr-only">Save the draft with only valid rows to continue.</span>
          </div>
        </div>
      </section>

      <section aria-labelledby="posting-title">
        <h2 id="posting-title" className="panel-h">Company posting</h2>
        <fieldset className="choice-group">
          <legend className="sr-only">Posting mode</legend>
          <div className="choice-grid two">
            <label className="choice"><input type="radio" name="posting" checked={postingMode === 'consolidated'} onChange={() => { setPostingMode('consolidated'); setDirty(true); }} /><span className="c-title">Consolidated</span><span className="c-desc">One company entry for the run.</span></label>
            <label className="choice"><input type="radio" name="posting" checked={postingMode === 'detailed'} onChange={() => { setPostingMode('detailed'); setDirty(true); }} /><span className="c-title">Detailed</span><span className="c-desc">One company entry per recipient.</span></label>
          </div>
        </fieldset>
        <PostingPreview mode={postingMode} title={title} rowCount={summary.validCount} total={summary.validTotal} firstAmounts={firstAmounts} />
      </section>

      <dialog ref={dialog} className="modal wide" aria-labelledby="subset-title">
        <div className="modal-head">
          <div>
            <h2 id="subset-title">Keep only the valid rows?</h2>
            <p>{summary.invalidCount} row{summary.invalidCount === 1 ? ' has' : 's have'} errors and will be removed from this draft. Nothing else changes.</p>
          </div>
          <button type="button" className="icon-btn" onClick={() => dialog.current?.close()} aria-label="Close"><XIcon size={18} /></button>
        </div>
        <div className="modal-body">
          <ul className="confirm-list">
            <li>Rows to remove: {invalidIndexes.map((i) => i + 1).join(', ')}</li>
            <li>Rows kept: <strong>{summary.validCount}</strong></li>
            <li>Total kept: <strong>{displayAmount(summary.validTotal)} tUSDC</strong></li>
          </ul>
          <div className="result wait"><AlertIcon size={16} /><span>Only the rows listed above are removed, and only after you confirm.</span></div>
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={confirmSubset} disabled={busy}>Remove {summary.invalidCount} row{summary.invalidCount === 1 ? '' : 's'} and keep {summary.validCount}</button>
            <button type="button" className="btn btn-secondary" onClick={() => dialog.current?.close()}>Cancel</button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
