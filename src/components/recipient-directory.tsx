'use client';

/**
 * Admin recipient directory (Phase 19): "Pay registered recipients only" switch, add / edit /
 * deactivate / reactivate, read-only testnet check, and bulk import. Every action goes through
 * the admin API (server-side validation, authorization, change log); this component only
 * renders the result and refreshes the page.
 */
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { CopyValue } from './copy-value';
import { AlertIcon, CheckIcon, EditIcon, InfoIcon, PlusIcon, UploadIcon } from './icons';

export interface RecipientRow {
  id: string; nearAccountId: string; name: string; division: string; email: string; mobilePhone: string;
  maxAmount: string; maxDisplay: string; active: boolean; sample: boolean;
  readiness: 'unchecked' | 'ready' | 'no_account' | 'not_registered' | 'check_failed'; readinessLabel: string; readinessCheckedAt: string | null; updatedAt: number;
}

type Field = 'nearAccountId' | 'name' | 'division' | 'email' | 'mobilePhone' | 'maxAmount';
const EMPTY: Record<Field, string> = { nearAccountId: '', name: '', division: '', email: '', mobilePhone: '', maxAmount: '' };
const LABEL: Record<Field, string> = { nearAccountId: 'NEAR account', name: 'Name', division: 'Division', email: 'Email', mobilePhone: 'Phone', maxAmount: 'Maximum per payout (tUSDC)' };
const COLUMN_LABEL: Record<string, string> = { near_account_id: 'NEAR account ID', receiver_name: 'Receiver name', currency: 'Currency', amount: 'Amount (maximum)', mobile_phone: 'Mobile phone', email: 'Email', division: 'Division' };

const READINESS_TONE: Record<RecipientRow['readiness'], string> = { ready: 'success', no_account: 'danger', not_registered: 'danger', check_failed: 'waiting', unchecked: 'neutral' };
const READINESS_SHORT: Record<RecipientRow['readiness'], string> = { ready: 'Ready', no_account: 'No account', not_registered: 'Not registered', check_failed: 'Check failed', unchecked: 'Not checked' };

/** One status per row: Inactive, or the result of the read-only testnet check (full text in the tooltip). */
function StatusCell({ r }: { r: RecipientRow }) {
  if (!r.active) return <span className="chip chip-neutral" title="Inactive: rows for this account are rejected">Inactive</span>;
  if (r.sample && r.readiness === 'unchecked') return <span className="chip chip-neutral" title="Synthetic sample employee for the 1,000-row import check; the account is not on testnet and is never paid."><InfoIcon size={13} />Sample</span>;
  return <span className={`chip chip-${READINESS_TONE[r.readiness]}`} title={r.readinessLabel}>{r.readiness === 'ready' ? <CheckIcon size={13} /> : r.readiness === 'unchecked' ? <InfoIcon size={13} /> : <AlertIcon size={13} />}{READINESS_SHORT[r.readiness]}<span className="sr-only">: {r.readinessLabel}</span></span>;
}

async function call(url: string, csrfToken: string, init: { method: string; body?: BodyInit; json?: unknown }) {
  const headers: Record<string, string> = { 'x-csrf-token': csrfToken };
  if (init.json !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { method: init.method, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body ?? null });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, body };
}

export function RegisteredOnlySwitch({ on, csrfToken }: { on: boolean; csrfToken: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function toggle() {
    setPending(true);
    setError(null);
    const r = await call('/api/admin/settings', csrfToken, { method: 'POST', json: { registeredRecipientsOnly: !on } });
    setPending(false);
    if (!r.ok) return setError((r.body.error as { message?: string } | undefined)?.message ?? 'The setting was not saved.');
    router.refresh();
  }
  return (
    <section className="card setting-card" aria-labelledby="registered-only-h">
      <div>
        <h2 id="registered-only-h">Pay registered recipients only</h2>
        <p className="hint">When on, every uploaded or manual payroll row must match an <strong>active</strong> recipient below (same NEAR account) and stay within that recipient&apos;s maximum. The server checks again when the maker submits, and approvers see the result. This guardrail is enforced by the app and the approvers, not by the vault contract.</p>
        {error ? <div className="form-error" role="alert"><AlertIcon size={18} />{error}</div> : null}
      </div>
      <button type="button" role="switch" aria-checked={on} aria-labelledby="registered-only-h" className={`switch ${on ? 'is-on' : ''}`} onClick={toggle} disabled={pending}>
        <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
        <span className="switch-text">{pending ? 'Saving…' : on ? 'On' : 'Off'}</span>
      </button>
    </section>
  );
}

export function RecipientDirectory({ rows, csrfToken, divisions, cap }: { rows: RecipientRow[]; csrfToken: string; divisions: string[]; cap: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState<RecipientRow | null>(null);
  const [form, setForm] = useState<Record<Field, string>>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busyRow, setBusyRow] = useState<string | null>(null);

  function open(row: RecipientRow | null) {
    setEditing(row);
    setForm(row ? { nearAccountId: row.nearAccountId, name: row.name, division: row.division, email: row.email, mobilePhone: row.mobilePhone, maxAmount: row.maxAmount } : EMPTY);
    setErrors({});
    setFormError(null);
    dialog.current?.showModal();
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setFormError(null);
    const r = editing
      ? await call(`/api/admin/recipients/${editing.id}`, csrfToken, { method: 'PATCH', json: { ...form, expectedUpdatedAt: editing.updatedAt } })
      : await call('/api/admin/recipients', csrfToken, { method: 'POST', json: form });
    setPending(false);
    if (r.status === 422 && Array.isArray(r.body.errors)) {
      const next: Partial<Record<Field, string>> = {};
      for (const x of r.body.errors as { field: Field; message: string }[]) next[x.field] = next[x.field] ? `${next[x.field]} ${x.message}` : x.message;
      return setErrors(next);
    }
    if (!r.ok) return setFormError((r.body.error as { message?: string } | undefined)?.message ?? 'Not saved.');
    const saved = r.body.recipient as RecipientRow;
    dialog.current?.close();
    setNotice({ tone: saved.readiness === 'ready' || editing ? 'ok' : 'bad', text: editing ? `Saved ${saved.name}.` : `Added ${saved.name} (${saved.nearAccountId}): ${saved.readinessLabel}.` });
    router.refresh();
  }

  async function rowAction(row: RecipientRow, action: 'deactivate' | 'reactivate' | 'check') {
    setBusyRow(row.id);
    const r = action === 'check'
      ? await call(`/api/admin/recipients/${row.id}/check`, csrfToken, { method: 'POST' })
      : await call(`/api/admin/recipients/${row.id}/status`, csrfToken, { method: 'POST', json: { active: action === 'reactivate' } });
    setBusyRow(null);
    if (!r.ok) return setNotice({ tone: 'bad', text: (r.body.error as { message?: string } | undefined)?.message ?? 'Not saved.' });
    const saved = r.body.recipient as RecipientRow;
    dialog.current?.close();
    setNotice({ tone: action === 'check' && saved.readiness !== 'ready' ? 'bad' : 'ok', text: action === 'check' ? `${saved.name} (${saved.nearAccountId}): ${saved.readinessLabel}.` : `${saved.name} is now ${saved.active ? 'active' : 'inactive'}.` });
    router.refresh();
  }

  const field = (f: Field, extra: { type?: string; inputMode?: 'decimal'; list?: string; readOnly?: boolean; hint?: string } = {}) => (
    <div className="field">
      <label htmlFor={`rcp-${f}`}>{LABEL[f]}</label>
      <input id={`rcp-${f}`} type={extra.type ?? 'text'} value={form[f]} inputMode={extra.inputMode} list={extra.list} readOnly={extra.readOnly}
        onChange={(e) => setForm({ ...form, [f]: e.target.value })} aria-invalid={errors[f] ? true : undefined} aria-describedby={errors[f] ? `rcp-${f}-err` : extra.hint ? `rcp-${f}-hint` : undefined} />
      {extra.hint && !errors[f] ? <span className="hint" id={`rcp-${f}-hint`}>{extra.hint}</span> : null}
      {errors[f] ? <span className="field-error" id={`rcp-${f}-err`}>{errors[f]}</span> : null}
    </div>
  );

  return (
    <section className="card" aria-labelledby="directory-title">
      <div className="panel-title">
        <h2 id="directory-title">Directory</h2>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => open(null)}><PlusIcon size={16} />Add recipient</button>
      </div>
      <div aria-live="polite">{notice ? <div className={`result ${notice.tone} inset`} role="status" data-testid="directory-notice">{notice.tone === 'ok' ? <CheckIcon size={16} /> : <AlertIcon size={16} />}<span>{notice.text}</span></div> : null}</div>
      {rows.length === 0 ? (
        <div className="empty"><h3>No recipients match</h3><p>Change the search or the filters, or add a recipient.</p></div>
      ) : (
        <div className="table-wrap" role="region" aria-labelledby="directory-title" tabIndex={0}>
          <table className="data directory">
            <thead><tr><th scope="col">Recipient</th><th scope="col">Division</th><th scope="col">NEAR account</th><th scope="col" className="amount">Max (tUSDC)</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} className={r.active ? undefined : 'is-inactive'}>
                <td><div className="title">{r.name}</div><div className="sub rcp-email" title={r.email}>{r.email}</div></td>
                <td>{r.division}</td>
                <td><CopyValue value={r.nearAccountId} label="NEAR account" size="md" /></td>
                <td className="amount">{r.maxDisplay}</td>
                <td><StatusCell r={r} /></td>
                <td className="row-actions"><button type="button" className="btn btn-ghost btn-sm" onClick={() => open(r)} aria-label={`Edit ${r.name}`}><EditIcon size={14} />Edit</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <dialog ref={dialog} className="modal wide" aria-labelledby="rcp-dialog-title">
        <form onSubmit={save} noValidate>
          <div className="modal-head"><div><h2 id="rcp-dialog-title">{editing ? `Edit ${editing.name}` : 'Add recipient'}</h2><p>{editing ? 'The NEAR account never changes; add a new recipient for a new account. Every change is logged with who and when.' : 'The account is checked on NEAR testnet (read-only) after it is added.'}</p></div></div>
          <div className="modal-body">
            {field('name')}
            {field('division', { list: 'rcp-divisions', hint: 'For example Sales, Operations, Engineering.' })}
            <datalist id="rcp-divisions">{divisions.map((d) => <option key={d} value={d} />)}</datalist>
            {field('nearAccountId', { readOnly: Boolean(editing), hint: editing ? 'Fixed for this recipient.' : 'For example name.testnet' })}
            {field('email', { type: 'email' })}
            {field('mobilePhone', { type: 'tel', hint: 'For example +44 7700 900123' })}
            {field('maxAmount', { inputMode: 'decimal', hint: `At most the workflow's per-row cap of ${cap} tUSDC.` })}
            {editing ? (
              <div className="rcp-state">
                <span>{editing.active ? 'Active' : 'Inactive'} · Testnet check: <strong>{editing.readinessLabel}</strong>{editing.readinessCheckedAt ? ` (${editing.readinessCheckedAt.slice(0, 16).replace('T', ' ')} UTC)` : ''}</span>
                <span className="rcp-state-actions">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => rowAction(editing, 'check')} disabled={busyRow === editing.id || pending}>{busyRow === editing.id ? 'Checking…' : 'Check on testnet'}</button>
                  {editing.active
                    ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => rowAction(editing, 'deactivate')} disabled={busyRow === editing.id || pending}>Deactivate</button>
                    : <button type="button" className="btn btn-secondary btn-sm" onClick={() => rowAction(editing, 'reactivate')} disabled={busyRow === editing.id || pending}>Reactivate</button>}
                </span>
              </div>
            ) : null}
            {formError ? <div className="form-error" role="alert"><AlertIcon size={18} />{formError}</div> : null}
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : editing ? 'Save changes' : 'Add and check on testnet'}</button>
              <button type="button" className="btn btn-secondary" onClick={() => dialog.current?.close()} disabled={pending}>Cancel</button>
            </div>
          </div>
        </form>
      </dialog>
    </section>
  );
}

interface ImportProblem { line: number | null; column: string | null; message: string }

export function RecipientImport({ csrfToken }: { csrfToken: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: true; text: string } | { ok: false; filename: string; summary: string; errorCount: number; errors: ImportProblem[] } | null>(null);

  async function send(file: File) {
    setBusy(true);
    setResult(null);
    const data = new FormData();
    data.set('file', file);
    const r = await call('/api/admin/recipients/import', csrfToken, { method: 'POST', body: data });
    setBusy(false);
    if (r.status === 422 && Array.isArray(r.body.errors)) {
      return setResult({ ok: false, filename: String(r.body.filename), summary: String(r.body.summary), errorCount: Number(r.body.errorCount), errors: r.body.errors as ImportProblem[] });
    }
    if (!r.ok) return setResult({ ok: false, filename: file.name, summary: (r.body.error as { message?: string } | undefined)?.message ?? 'Import failed.', errorCount: 0, errors: [] });
    const b = r.body as { rows: number; created: number; updated: number; unchanged: number; inactiveKept: number; checkedOnTestnet: boolean };
    setResult({ ok: true, text: `Imported ${b.rows.toLocaleString('en-US')} rows: ${b.created} added, ${b.updated} updated, ${b.unchanged} unchanged${b.inactiveKept ? ` (${b.inactiveKept} inactive recipients stay inactive)` : ''}. ${b.created ? (b.checkedOnTestnet ? 'New accounts were checked on testnet.' : 'More than 25 new accounts: use Check on a recipient to check it on testnet.') : ''}` });
    router.refresh();
  }

  return (
    <section className="card" aria-labelledby="rcp-import-title">
      <div className="panel-title"><h2 id="rcp-import-title">Bulk import</h2></div>
      <div className="panel-body stack">
        <p className="hint">A CSV or tab-delimited TXT in the payroll format plus a <span className="mono">division</span> column: <span className="mono">near_account_id, receiver_name, currency, amount, mobile_phone, email, division</span>. In this file <strong>amount is the maximum per payout</strong>. New accounts are added as active; existing accounts are updated and keep their status. All-or-nothing: any problem rejects the whole file with its row and column.</p>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => input.current?.click()} disabled={busy}><UploadIcon size={16} />{busy ? 'Importing…' : 'Choose directory file'}</button>
          <input ref={input} type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" className="sr-only" aria-label="Choose a recipient directory file"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void send(f); e.target.value = ''; }} />
        </div>
        <div aria-live="polite">
          {result?.ok ? <div className="result ok" role="status"><CheckIcon size={16} /><span>{result.text}</span></div> : null}
        </div>
        {result && !result.ok ? (
          <div className="error-panel" role="alert" data-testid="directory-import-errors">
            <div className="error-panel-head"><div><h3><AlertIcon size={18} /> File rejected{result.errorCount ? `: ${result.errorCount} problem${result.errorCount === 1 ? '' : 's'}` : ''} in <span className="mono">{result.filename}</span></h3><p>{result.summary}</p><p className="hint">Nothing was imported.</p></div></div>
            {result.errors.length ? (
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th scope="col">File row</th><th scope="col">Column</th><th scope="col">Problem</th></tr></thead>
                  <tbody>{result.errors.slice(0, 100).map((e, i) => <tr key={i}><td className="num">{e.line ?? '—'}</td><td>{e.column ? COLUMN_LABEL[e.column] ?? e.column : 'File'}</td><td>{e.message}</td></tr>)}</tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
