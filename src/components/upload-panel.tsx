'use client';

/**
 * Upload experience (kickoff §4): downloads area, drag-and-drop zone + file picker with the
 * limits shown up front, progress while validating, accepted summary or an error panel with
 * row/column/reason and a downloadable CSV report, the read-only review table (50 rows per
 * page, file order, source row numbers) and the company posting preview. A rejected file
 * never replaces the previously accepted version.
 */
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState, type DragEvent } from 'react';
import { parseAmount } from '@/server/money';
import { errorReportCsv, type ReportError } from '@/server/payroll/error-report';
import { FIELD_LABEL, type Field, type RawRow } from '@/server/payroll/validate';
import { displayAmount } from '@/lib/format';
import { AlertIcon, CheckIcon, FileIcon, UploadIcon } from './icons';
import { PostingPreview } from './posting-preview';

type Row = RawRow & { sourceLine: number | null };
interface Rejected { accepted: false; filename: string; errorCount: number; summary: string; errors: ReportError[]; recordCount: number | null }
interface Accepted { accepted: true; filename: string; rowCount: number; total: string; delimiter: string; duplicateWallets: { accountId: string; lines: number[] }[] }

const DOWNLOADS = [
  { href: '/templates/gajian-payroll-template-blank.csv', name: 'Blank CSV template', meta: 'Header row only' },
  { href: '/templates/gajian-payroll-template.xlsx', name: 'Excel template with sample rows', meta: '.xlsx, no macros, 1,000 sample rows' },
  { href: '/templates/gajian-payroll-sample-1000.csv', name: 'Sample CSV', meta: '1,000 rows · 56.69086 tUSDC' },
  { href: '/templates/gajian-payroll-sample-1000.txt', name: 'Sample TXT', meta: 'Tab-delimited, same 1,000 rows' },
];
const PAGE = 50;

export function UploadPanel(props: {
  runId: string; title: string; postingMode: 'consolidated' | 'detailed'; revision: number; csrfToken: string;
  rows: Row[]; activeFile: { name: string; sha256: string | null } | null;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Accepted | Rejected | { error: string } | null>(null);
  const [postingMode, setPostingMode] = useState(props.postingMode);
  const amounts = useMemo(() => props.rows.map((r) => { const p = parseAmount(r.amount); return p.ok ? p.value : 0n; }), [props.rows]);
  const total = amounts.reduce((s, a) => s + a, 0n);

  async function send(file: File) {
    setBusy(`Validating ${file.name}…`);
    setOutcome(null);
    const form = new FormData();
    form.set('file', file);
    form.set('expectedRevision', String(props.revision));
    try {
      const res = await fetch(`/api/runs/${props.runId}/upload`, { method: 'POST', headers: { 'x-csrf-token': props.csrfToken }, body: form });
      const body = (await res.json()) as Accepted | Rejected | { error?: { message: string } };
      if ('accepted' in body) {
        setOutcome(body);
        if (body.accepted) router.refresh();
      } else {
        setOutcome({ error: body.error?.message ?? 'Upload failed.' });
      }
    } catch {
      setOutcome({ error: 'Network error. The previous version is unchanged.' });
    } finally {
      setBusy(null);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files[0];
    if (file) void send(file);
  }

  function downloadReport(r: Rejected) {
    const blob = new Blob([errorReportCsv(r.filename, r.errors)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${r.filename.replace(/\.[^.]+$/, '')}-errors.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function changePosting(mode: 'consolidated' | 'detailed') {
    setPostingMode(mode);
    await fetch(`/api/runs/${props.runId}/posting-mode`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': props.csrfToken }, body: JSON.stringify({ postingMode: mode }) });
  }

  const rejected = outcome && 'accepted' in outcome && !outcome.accepted ? outcome : null;
  const accepted = outcome && 'accepted' in outcome && outcome.accepted ? outcome : null;

  return (
    <div className="builder-grid">
      <section className="card" aria-labelledby="downloads-title">
        <div className="panel-title"><h2 id="downloads-title">Templates and samples</h2><span className="hint">Fill one in, then upload it below.</span></div>
        <ul className="downloads">
          {DOWNLOADS.map((d) => (
            <li key={d.href}><a href={d.href} download><FileIcon size={18} /><span><strong>{d.name}</strong><span className="sub">{d.meta}</span></span></a></li>
          ))}
        </ul>
      </section>

      <section className="card" aria-labelledby="upload-title">
        <div className="panel-title">
          <h2 id="upload-title">Upload payroll file</h2>
          <span className="hint" data-testid="active-file">{props.activeFile ? <>Active file: <strong className="mono">{props.activeFile.name}</strong> · {props.rows.length.toLocaleString('en-US')} rows</> : 'No file accepted yet'}</span>
        </div>
        <div className="panel-body stack">
          <div className={`drop ${drag ? 'is-drag' : ''}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop} data-testid="dropzone">
            <span className="file-icon"><UploadIcon size={24} /></span>
            <div>
              <strong>Drag and drop your file here</strong>
              <p className="hint">CSV (comma or semicolon) or TXT (tab-delimited), UTF-8 · up to 1,000 rows and 2 MB · columns near_account_id, receiver_name, currency, amount, mobile_phone, email</p>
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => input.current?.click()} disabled={Boolean(busy)}>Choose file</button>
            <input ref={input} type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" className="sr-only" aria-label="Choose a payroll file"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void send(f); e.target.value = ''; }} />
          </div>
          <div aria-live="polite">
            {busy ? <div className="result wait" role="status"><span className="spinner" aria-hidden="true" />{busy}<progress className="bar" aria-label="Validating" /></div> : null}
            {accepted ? (
              <div className="result ok" role="status"><CheckIcon size={16} /><span>Accepted <span className="mono">{accepted.filename}</span>: {accepted.rowCount.toLocaleString('en-US')} rows, exact total {displayAmount(parseAmountOrZero(accepted.total))} tUSDC ({accepted.delimiter}-separated).{accepted.duplicateWallets.length ? ` ${accepted.duplicateWallets.length} wallet${accepted.duplicateWallets.length === 1 ? ' appears' : 's appear'} more than once: check them in the review.` : ''}</span></div>
            ) : null}
            {outcome && 'error' in outcome ? <div className="result bad" role="alert"><AlertIcon size={16} /><span>{outcome.error}</span></div> : null}
          </div>
          {rejected ? (
            <div className="error-panel" role="alert" aria-labelledby="rejected-title" data-testid="error-panel">
              <div className="error-panel-head">
                <div>
                  <h3 id="rejected-title"><AlertIcon size={18} /> File rejected: {rejected.errorCount.toLocaleString('en-US')} problem{rejected.errorCount === 1 ? '' : 's'} in <span className="mono">{rejected.filename}</span></h3>
                  <p>{rejected.summary}</p>
                  <p className="hint">{props.activeFile ? <>Nothing changed: the previous version (<span className="mono">{props.activeFile.name}</span>) remains active.</> : 'Nothing was imported.'}</p>
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => downloadReport(rejected)}>Download error report (CSV)</button>
              </div>
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th scope="col">File row</th><th scope="col">Column</th><th scope="col">Problem</th></tr></thead>
                  <tbody>{rejected.errors.slice(0, 100).map((e, i) => (
                    <tr key={i}><td className="num">{e.line ?? '—'}</td><td>{e.column ? FIELD_LABEL[e.column as Field] ?? e.column : 'File'}</td><td>{e.message}</td></tr>
                  ))}</tbody>
                </table>
              </div>
              {rejected.errorCount > 100 ? <p className="hint">Showing the first 100 of {rejected.errorCount.toLocaleString('en-US')} problems. The report has all of them.</p> : null}
            </div>
          ) : null}
        </div>
      </section>

      {props.rows.length ? (
        <div className="continue-bar card card-pad">
          <span><strong>{props.rows.length.toLocaleString('en-US')}</strong> rows accepted · exact total <strong className="num">{displayAmount(total)} tUSDC</strong></span>
          <a className="btn btn-primary" href={`/maker/runs/${props.runId}/review`}>Continue to review</a>
        </div>
      ) : null}
      {props.rows.length ? <ReviewTable rows={props.rows} total={total} /> : null}

      {props.rows.length ? (
        <section aria-labelledby="posting-title">
          <h2 id="posting-title" className="panel-h">Company posting</h2>
          <fieldset className="choice-group">
            <legend className="sr-only">Posting mode</legend>
            <div className="choice-grid two">
              <label className="choice"><input type="radio" name="posting" checked={postingMode === 'consolidated'} onChange={() => changePosting('consolidated')} /><span className="c-title">Consolidated</span><span className="c-desc">One company entry for the run.</span></label>
              <label className="choice"><input type="radio" name="posting" checked={postingMode === 'detailed'} onChange={() => changePosting('detailed')} /><span className="c-title">Detailed</span><span className="c-desc">One company entry per recipient.</span></label>
            </div>
          </fieldset>
          <PostingPreview mode={postingMode} title={props.title} rowCount={props.rows.length} total={total} firstAmounts={amounts.slice(0, 3)} />
        </section>
      ) : null}
    </div>
  );
}

function parseAmountOrZero(s: string): bigint {
  const p = parseAmount(s);
  return p.ok ? p.value : 0n;
}

/** Read-only review table: 50 rows per page in file order, source row numbers first. */
export function ReviewTable({ rows, total }: { rows: Row[]; total: bigint }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const slice = rows.slice(page * PAGE, page * PAGE + PAGE);
  const from = page * PAGE + 1;
  const to = Math.min(rows.length, from + PAGE - 1);
  const nav = (
    <nav className="pager" aria-label="Review table pages">
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPage(0)} disabled={page === 0}>First</button>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPage((p) => p - 1)} disabled={page === 0}>Previous</button>
      <label className="pager-select">Page
        <select value={page} onChange={(e) => setPage(Number(e.target.value))} aria-label="Go to page">
          {Array.from({ length: pages }, (_, i) => <option key={i} value={i}>{i + 1}</option>)}
        </select>
        of {pages}</label>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPage((p) => p + 1)} disabled={page >= pages - 1}>Next</button>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPage(pages - 1)} disabled={page >= pages - 1}>Last</button>
    </nav>
  );
  return (
    <section className="card" aria-labelledby="review-title">
      <div className="panel-title">
        <h2 id="review-title">Review ({rows.length.toLocaleString('en-US')} rows, read-only)</h2>
        <span className="hint">Total <strong className="num">{displayAmount(total)} tUSDC</strong> · rows {from.toLocaleString('en-US')}–{to.toLocaleString('en-US')} of {rows.length.toLocaleString('en-US')}</span>
      </div>
      <p className="hint review-hint" id="file-row-hint">File row is the row number in the uploaded file (the header is row 1), the same number used in error messages. Every row is in tUSDC, the only accepted currency.</p>
      <div className="table-wrap review-scroll" role="region" aria-labelledby="review-title" aria-describedby="file-row-hint" tabIndex={0}>
        <table className="data review" data-testid="review-table">
          <thead><tr><th scope="col" title="Row number in the uploaded file (the header is row 1)">File row</th><th scope="col">NEAR account</th><th scope="col">Receiver and email</th><th scope="col" className="amount">Amount (tUSDC)</th><th scope="col">Mobile phone</th></tr></thead>
          <tbody>{slice.map((r, i) => (
            <tr key={from + i}>
              <td className="num sub">{r.sourceLine ?? from + i}</td>
              <td className="mono acct" title={r.near_account_id}>{r.near_account_id}</td>
              <td className="who"><span className="trunc" title={r.receiver_name}>{r.receiver_name}</span><span className="sub trunc" title={r.email}>{r.email}</span></td>
              <td className="amount">{displayAmount(parseAmountOrZero(r.amount))}</td>
              <td className="num">{r.mobile_phone}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="toolbar pager-bar">{nav}</div>
    </section>
  );
}
