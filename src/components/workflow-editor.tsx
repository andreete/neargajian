'use client';

/**
 * Admin workflow editor: template (one / two in sequence / two in parallel), distinct
 * reviewers, release mode, and a live approval-map preview with a text summary. Saving sends
 * update_workflow to the vault through the server; the new path is shown as active only
 * after the vault confirms it.
 */
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ApprovalMap, type MapKind, type MapRelease } from './approval-map';
import { AlertIcon, CheckIcon, ClockIcon, ExternalIcon } from './icons';

export interface ReviewerOption { id: string; displayName: string; email: string; chainAccountId: string | null }

interface Props {
  active: { revision: number; kind: MapKind; releaseMode: MapRelease; approverUserIds: string[] };
  options: ReviewerOption[];
  pending: { revision: number; chainTxHash: string | null } | null;
  csrfToken: string;
  explorerTxUrl: string;
  initialKind?: MapKind;
}

type Result = { status: 'active' | 'pending' | 'failed'; revision: number; txHash?: string; error?: string }
  | { status: 'invalid'; errors: { field: string; message: string }[] }
  | { status: 'conflict'; message: string };

const TEMPLATES: { kind: MapKind; title: string; desc: string }[] = [
  { kind: 'one', title: 'One approver', desc: 'One assigned reviewer approves.' },
  { kind: 'two_sequential', title: 'Two in sequence', desc: 'Approver 2 acts only after Approver 1.' },
  { kind: 'two_parallel', title: 'Two in parallel', desc: 'Either goes first; both are required.' },
];
const RELEASES: { mode: MapRelease; title: string; desc: string }[] = [
  { mode: 'automatic', title: 'Automatic release', desc: 'The release worker pays once the run is approved and funded.' },
  { mode: 'maker', title: 'Maker releases', desc: 'The maker checks the approved run and clicks Release payments.' },
];

export function WorkflowEditor({ active, options, pending, csrfToken, explorerTxUrl, initialKind }: Props) {
  const router = useRouter();
  const [kind, setKind] = useState<MapKind>(initialKind ?? active.kind);
  const [a1, setA1] = useState(active.approverUserIds[0] ?? options[0]?.id ?? '');
  const [a2, setA2] = useState(active.approverUserIds[1] ?? options.find((o) => o.id !== a1)?.id ?? '');
  const [release, setRelease] = useState<MapRelease>(active.releaseMode);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const two = kind !== 'one';
  const sameReviewer = two && a1 !== '' && a1 === a2;
  const name = (id: string) => options.find((o) => o.id === id)?.displayName ?? 'Not chosen';
  const unchanged = kind === active.kind && release === active.releaseMode && a1 === active.approverUserIds[0] && (!two || a2 === active.approverUserIds[1]);
  const fieldError = (field: string) => (result?.status === 'invalid' ? result.errors.find((e) => e.field === field)?.message : undefined);
  const a2Error = sameReviewer ? 'Choose two different reviewers.' : fieldError('approver2');

  const summary = useMemo(() => {
    const steps = kind === 'one' ? [`${name(a1)} approves.`]
      : kind === 'two_sequential' ? [`${name(a1)} approves first.`, `Then ${name(a2)} approves.`]
        : [`${name(a1)} and ${name(a2)} approve in any order.`, 'Both approvals are required.'];
    return [...steps, release === 'automatic' ? 'The release worker pays automatically.' : 'The maker releases the payment.'];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, a1, a2, release, options]);

  async function save() {
    if (saving || sameReviewer || unchanged) return;
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ kind, approverUserIds: two ? [a1, a2] : [a1], releaseMode: release, expectedRevision: active.revision }),
      });
      const body = (await res.json()) as { result?: Result; error?: { message: string } };
      setResult(body.result ?? { status: 'conflict', message: body.error?.message ?? 'Saving failed.' });
      if (body.result?.status === 'active') router.refresh();
    } catch {
      setResult({ status: 'pending', revision: active.revision + 1, error: 'Network error: the change may or may not have been sent. Refresh the status before trying again.' });
    } finally {
      setSaving(false);
    }
  }

  async function reconcile() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/workflow/reconcile', { method: 'POST', headers: { 'x-csrf-token': csrfToken } });
      const body = (await res.json()) as { result: Result | null };
      setResult(body.result);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const txLink = (hash?: string | null) => hash ? (
    <a className="mono" href={`${explorerTxUrl}${hash}`} target="_blank" rel="noreferrer">{hash.slice(0, 10)}… <ExternalIcon size={12} /><span className="sr-only">(opens NearBlocks)</span></a>
  ) : null;

  return (
    <section className="card" aria-labelledby="editor-title">
      <div className="panel-title">
        <h2 id="editor-title">Approval workflow for new runs</h2>
        <span className="chip chip-info">Active: revision {active.revision}</span>
      </div>
      {pending ? (
        <div className="panel-body">
          <div className="result wait" role="status"><ClockIcon size={16} /><span>Revision {pending.revision} is waiting for confirmation on NEAR {txLink(pending.chainTxHash)}. </span></div>
          <div className="form-actions"><button type="button" className="btn btn-secondary btn-sm" onClick={reconcile} disabled={saving}>Refresh status</button></div>
        </div>
      ) : null}
      <div className="editor">
        <div>
          <fieldset className="choice-group">
            <legend>Approval template</legend>
            <div className="choice-grid">
              {TEMPLATES.map((t) => (
                <label key={t.kind} className="choice">
                  <input type="radio" name="kind" value={t.kind} checked={kind === t.kind} onChange={() => setKind(t.kind)} />
                  <span className="c-title">{t.title}</span><span className="c-desc">{t.desc}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="reviewer-row">
            <div className="field">
              <label htmlFor="approver1">{two ? (kind === 'two_sequential' ? 'Approver 1 (first)' : 'Approver 1') : 'Approver'}</label>
              <select id="approver1" value={a1} onChange={(e) => setA1(e.target.value)} aria-invalid={fieldError('approver1') ? true : undefined}>
                {options.map((o) => <option key={o.id} value={o.id}>{o.displayName} · {o.email}</option>)}
              </select>
              {fieldError('approver1') ? <span className="field-error">{fieldError('approver1')}</span> : null}
            </div>
            {two ? (
              <div className="field">
                <label htmlFor="approver2">{kind === 'two_sequential' ? 'Approver 2 (after Approver 1)' : 'Approver 2'}</label>
                <select id="approver2" value={a2} onChange={(e) => setA2(e.target.value)} aria-invalid={a2Error ? true : undefined} aria-describedby={a2Error ? 'approver2-error' : undefined}>
                  {options.map((o) => <option key={o.id} value={o.id}>{o.displayName} · {o.email}</option>)}
                </select>
                {a2Error ? <span id="approver2-error" className="field-error">{a2Error}</span> : null}
              </div>
            ) : null}
          </div>
          <fieldset className="choice-group">
            <legend>Release</legend>
            <div className="choice-grid two">
              {RELEASES.map((r) => (
                <label key={r.mode} className="choice">
                  <input type="radio" name="release" value={r.mode} checked={release === r.mode} onChange={() => setRelease(r.mode)} />
                  <span className="c-title">{r.title}</span><span className="c-desc">{r.desc}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="notice">Saving sends one transaction from the admin signer to the vault on NEAR testnet. Runs already submitted keep the path they were submitted with.</p>
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving || sameReviewer || unchanged || Boolean(pending)} aria-describedby="save-hint">
              {saving ? 'Saving on NEAR…' : 'Save workflow'}
            </button>
            <span id="save-hint" className="hint">{unchanged ? 'No changes yet.' : sameReviewer ? 'Fix the reviewers first.' : 'Changes apply to new runs only.'}</span>
          </div>
          <div aria-live="polite">
            {result?.status === 'active' ? <div className="result ok" role="status"><CheckIcon size={16} /><span>Active on NEAR testnet as revision {result.revision}. {txLink(result.txHash)}</span></div> : null}
            {result?.status === 'pending' ? <div className="result wait" role="status"><ClockIcon size={16} /><span>{result.error ?? 'Waiting for confirmation.'} {txLink(result.txHash)}</span></div> : null}
            {result?.status === 'failed' ? <div className="result bad" role="alert"><AlertIcon size={16} /><span>The vault rejected the change: {result.error ?? 'unknown reason'}. The previous workflow stays active. {txLink(result.txHash)}</span></div> : null}
            {result?.status === 'conflict' ? <div className="result bad" role="alert"><AlertIcon size={16} /><span>{result.message}</span></div> : null}
            {result?.status === 'invalid' && fieldError('form') ? <div className="result bad" role="alert"><AlertIcon size={16} /><span>{fieldError('form')}</span></div> : null}
          </div>
        </div>
        <div className="preview" aria-labelledby="preview-title">
          <h3 id="preview-title">Preview</h3>
          <ApprovalMap kind={kind} releaseMode={release} approvers={two ? [{ name: name(a1) }, { name: name(a2) }] : [{ name: name(a1) }]} caption="Preview of the approval path" />
          <ol data-testid="workflow-summary">{summary.map((s) => <li key={s}>{s}</li>)}</ol>
        </div>
      </div>
    </section>
  );
}
