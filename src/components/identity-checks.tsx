'use client';

/**
 * Admin identity checks (Phase 21): KTP + face photo per employee, the synthetic specimen demo,
 * bulk checks, manual review and the "Pay identity-verified recipients only" switch. Every
 * action goes through the admin API, which does all the work on the server; this component only
 * collects the images, shows progress and renders the stored result.
 */
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CopyValue } from './copy-value';
import { AlertIcon, CheckIcon, ClockIcon, InfoIcon, ShieldIcon, UploadIcon, XIcon } from './icons';

export type IdentityStatusName = 'unverified' | 'verified' | 'needs_review' | 'failed';
export interface CheckItemView { key: string; label: string; status: 'pass' | 'review' | 'fail'; detail: string }
export interface CheckView {
  id: string; recipientName: string; account: string; at: string; actor: string; source: 'upload' | 'specimen' | 'seed' | 'manual_review';
  dryRun: boolean; outcome: 'verified' | 'needs_review' | 'failed'; nikMasked: string | null; faceScore: number | null;
  checks: CheckItemView[]; reader: string | null; faceEngine: string | null; note: string | null;
}
export interface IdentityRow { id: string; name: string; account: string; division: string; sample: boolean; status: IdentityStatusName; checkedAt: string | null; nikMasked: string | null }

export const STATUS_TEXT: Record<IdentityStatusName, string> = { unverified: 'Not checked', verified: 'Verified', needs_review: 'Needs review', failed: 'Failed' };
const STATUS_TONE: Record<IdentityStatusName, string> = { unverified: 'neutral', verified: 'success', needs_review: 'waiting', failed: 'danger' };
const OUTCOME_TEXT = { verified: 'Identity verified', needs_review: 'Needs review', failed: 'Failed' } as const;
const SOURCE_TEXT = { upload: 'Uploaded images', specimen: 'Synthetic specimen', seed: 'Demo seed', manual_review: 'Manual review' } as const;

async function call(url: string, csrfToken: string, init: { method: string; body?: BodyInit; json?: unknown }) {
  const headers: Record<string, string> = { 'x-csrf-token': csrfToken };
  if (init.json !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { method: init.method, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body ?? null });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, body, message: (body.error as { message?: string } | undefined)?.message };
}

export function IdentityStatusChip({ status }: { status: IdentityStatusName }) {
  const Icon = status === 'verified' ? CheckIcon : status === 'failed' ? XIcon : status === 'needs_review' ? AlertIcon : InfoIcon;
  return <span className={`chip chip-${STATUS_TONE[status]}`} data-testid="identity-status"><Icon size={13} />{STATUS_TEXT[status]}</span>;
}

/** The stored result of one check: outcome, score, masked NIK and every individual check. */
export function CheckResult({ check }: { check: CheckView }) {
  const tone = check.outcome === 'verified' ? 'ok' : check.outcome === 'needs_review' ? 'wait' : 'bad';
  return (
    <div className="id-result" data-testid="identity-result" data-outcome={check.outcome}>
      <div className={`result ${tone}`} role="status">
        {check.outcome === 'verified' ? <ShieldIcon size={18} /> : check.outcome === 'needs_review' ? <AlertIcon size={18} /> : <XIcon size={18} />}
        <span>{OUTCOME_TEXT[check.outcome]}: {check.recipientName}{check.faceScore !== null ? ` · face similarity ${check.faceScore.toFixed(3)}` : ''}{check.nikMasked ? ` · NIK ${check.nikMasked}` : ''}</span>
      </div>
      {check.dryRun ? <p className="hint" data-testid="identity-dry-run"><InfoIcon size={14} /> Public demo: a dry run on synthetic data. The result is logged; {check.recipientName}&apos;s status did not change.</p> : null}
      <ul className="id-checks">
        {check.checks.map((c) => (
          <li key={c.key} className={`is-${c.status}`}>
            <span className="id-mark" aria-hidden="true">{c.status === 'pass' ? <CheckIcon size={14} /> : c.status === 'review' ? <AlertIcon size={14} /> : <XIcon size={14} />}</span>
            <div><strong>{c.label}</strong><span className="sr-only">: {c.status === 'pass' ? 'passed' : c.status === 'review' ? 'needs review' : 'failed'}</span><div className="sub">{c.detail}</div></div>
          </li>
        ))}
      </ul>
      <p className="hint">{SOURCE_TEXT[check.source]} · {new Date(check.at).toISOString().slice(0, 16).replace('T', ' ')} UTC · {check.actor}{check.reader ? ` · KTP read by ${check.reader === 'test-stub' ? 'the test stub reader (browser tests only)' : check.reader}` : ''}{check.faceEngine ? ` · faces: ${check.faceEngine}` : ''}</p>
    </div>
  );
}

export function IdentityOnlySwitch({ on, csrfToken, readOnly }: { on: boolean; csrfToken: string; readOnly: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function toggle() {
    setPending(true);
    setError(null);
    const r = await call('/api/admin/settings', csrfToken, { method: 'POST', json: { identityVerifiedOnly: !on } });
    setPending(false);
    if (!r.ok) return setError(r.message ?? 'The setting was not saved.');
    router.refresh();
  }
  return (
    <section className="card setting-card" aria-labelledby="identity-only-h">
      <div>
        <h2 id="identity-only-h">Pay identity-verified recipients only</h2>
        <p className="hint">When on, a run can only be submitted when every row pays a recipient whose identity check passed (KTP read, NIK consistent, name and face match). The server checks again at submit and approvers see the result. Like the directory, this is an app and approver guardrail, not a vault contract rule.</p>
        {error ? <div className="form-error" role="alert"><AlertIcon size={18} />{error}</div> : null}
      </div>
      <button type="button" role="switch" aria-checked={on} aria-labelledby="identity-only-h" className={`switch ${on ? 'is-on' : ''}`} onClick={toggle} disabled={pending || readOnly}>
        <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
        <span className="switch-text">{pending ? 'Saving…' : on ? 'On' : 'Off'}</span>
      </button>
    </section>
  );
}

const SCENARIOS = [
  { id: 'emma', label: 'Emma Clark', sub: 'her KTP + her face', ktp: 'emma-ktp.jpg', face: 'emma-selfie.jpg' },
  { id: 'daniel', label: 'Daniel Hall', sub: 'his KTP + his face', ktp: 'daniel-ktp.jpg', face: 'daniel-selfie.jpg' },
  { id: 'grace', label: 'Grace Lewis', sub: 'her KTP + her face', ktp: 'grace-ktp.jpg', face: 'grace-selfie.jpg' },
  { id: 'impostor', label: 'Impostor', sub: 'Daniel\'s KTP + another face', ktp: 'daniel-ktp.jpg', face: 'impostor-selfie.jpg' },
] as const;

/** The full pipeline on the committed synthetic specimens (cards marked SPECIMEN, AI-generated faces). */
export function SpecimenDemo({ csrfToken, disabled, dryRun }: { csrfToken: string; disabled: string | null; dryRun: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<CheckView | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run(id: string) {
    setBusy(id);
    setError(null);
    setResult(null);
    const r = await call('/api/admin/identity/specimen', csrfToken, { method: 'POST', json: { scenario: id } });
    setBusy(null);
    if (!r.ok) return setError(r.message ?? 'The check did not run.');
    setResult(r.body.check as CheckView);
    router.refresh();
  }
  return (
    <section className="card card-pad" aria-labelledby="specimen-h" data-testid="specimen-demo">
      <h2 id="specimen-h" className="panel-h">Try it on synthetic specimens</h2>
      <p className="hint">Each card is marked SPECIMEN and the faces are AI-generated (public domain): no real person, no real KTP. The check is the real one: the card text is read by the KTP reader with the photo covered, and the faces are compared on this server.{dryRun ? ' In the public demo these are dry runs: results are logged, statuses do not change.' : ' On this copy a specimen check updates the recipient\'s status.'}</p>
      <div className="specimen-grid">
        {SCENARIOS.map((s) => (
          <div key={s.id} className="specimen">
            <div className="specimen-imgs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/specimens/${s.ktp}`} alt={`Specimen KTP for ${s.id === 'impostor' ? 'Daniel Hall' : s.label}`} width={150} height={95} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/specimens/${s.face}`} alt={s.id === 'impostor' ? 'Face photo of a different, AI-generated person' : `Face photo of ${s.label} (AI-generated)`} width={95} height={95} />
            </div>
            <div className="specimen-text"><strong>{s.label}</strong><span className="sub">{s.sub}</span></div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => run(s.id)} disabled={Boolean(busy) || Boolean(disabled)} data-testid={`specimen-${s.id}`}>
              {busy === s.id ? 'Checking…' : 'Run check'}
            </button>
          </div>
        ))}
      </div>
      {disabled ? <div className="result wait" role="note"><InfoIcon size={16} /><span>{disabled}</span></div> : null}
      {busy ? <div className="result wait" role="status"><ClockIcon size={16} /><span>Reading the KTP and comparing faces… (about 10 seconds)</span></div> : null}
      {error ? <div className="form-error" role="alert"><AlertIcon size={18} />{error}</div> : null}
      {result ? <CheckResult check={result} /> : null}
    </section>
  );
}

/** Camera capture for the face photo (browser camera, same origin only; nothing is kept in the browser). */
function CameraCapture({ onPhoto }: { onPhoto: (file: File) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream]);
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
  async function start() {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false });
      setStream(s);
      if (video.current) { video.current.srcObject = s; await video.current.play(); }
    } catch {
      setError('The camera is not available (permission denied or no camera).');
    }
  }
  function snap() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')?.drawImage(v, 0, 0);
    c.toBlob((b) => { if (b) onPhoto(new File([b], 'camera.jpg', { type: 'image/jpeg' })); }, 'image/jpeg', 0.9);
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
  }
  return (
    <div className="camera">
      <video ref={video} className={stream ? 'camera-video' : 'camera-video is-hidden'} muted playsInline aria-label="Camera preview" />
      {stream ? <button type="button" className="btn btn-secondary btn-sm" onClick={snap}>Take photo</button> : <button type="button" className="btn btn-ghost btn-sm" onClick={start}>Use the camera instead</button>}
      {error ? <div className="field-error">{error}</div> : null}
    </div>
  );
}

function ImagePick({ id, label, hint, file, onFile, camera }: { id: string; label: string; hint: string; file: File | null; onFile: (f: File | null) => void; camera?: boolean }) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      <span className="hint">{hint}</span>
      {camera ? <CameraCapture onPhoto={onFile} /> : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img className="id-preview" src={url} alt={`${label} preview`} /> : null}
    </div>
  );
}

export function IdentityTable({ rows, csrfToken, disabled, readOnly }: { rows: IdentityRow[]; csrfToken: string; disabled: string | null; readOnly: boolean }) {
  const router = useRouter();
  const checkDialog = useRef<HTMLDialogElement>(null);
  const reviewDialog = useRef<HTMLDialogElement>(null);
  const [target, setTarget] = useState<IdentityRow | null>(null);
  const [ktp, setKtp] = useState<File | null>(null);
  const [face, setFace] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckView | null>(null);
  const [decision, setDecision] = useState<'verified' | 'failed'>('verified');
  const [reason, setReason] = useState('');

  function openCheck(r: IdentityRow) {
    setTarget(r); setKtp(null); setFace(null); setError(null); setResult(null);
    checkDialog.current?.showModal();
  }
  function openReview(r: IdentityRow) {
    setTarget(r); setDecision(r.status === 'needs_review' ? 'verified' : 'failed'); setReason(''); setError(null);
    reviewDialog.current?.showModal();
  }
  async function submitCheck(e: FormEvent) {
    e.preventDefault();
    if (!target) return;
    if (!ktp || !face) return setError('Add both images: the KTP and the face photo.');
    setPending(true); setError(null); setResult(null);
    const data = new FormData();
    data.set('recipientId', target.id);
    data.set('ktp', ktp);
    data.set('face', face);
    const r = await call('/api/admin/identity/check', csrfToken, { method: 'POST', body: data });
    setPending(false);
    if (!r.ok) return setError(r.message ?? 'The check did not run.');
    setResult(r.body.check as CheckView);
    router.refresh();
  }
  async function submitReview(e: FormEvent) {
    e.preventDefault();
    if (!target) return;
    setPending(true); setError(null);
    const r = await call('/api/admin/identity/review', csrfToken, { method: 'POST', json: { recipientId: target.id, decision, reason } });
    setPending(false);
    if (!r.ok) return setError(r.message ?? 'The decision was not saved.');
    reviewDialog.current?.close();
    router.refresh();
  }

  return (
    <>
      <div className="card table-card">
        <div className="table-wrap" role="region" aria-label="Identity status of recipients" tabIndex={0}>
          <table className="data">
            <thead><tr><th scope="col">Recipient</th><th scope="col">Division</th><th scope="col">Identity</th><th scope="col">NIK</th><th scope="col">Checked (UTC)</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={6}><div className="empty"><h3>No recipients match</h3></div></td></tr> : rows.map((r) => (
                <tr key={r.id} data-testid="identity-row" data-account={r.account}>
                  <td><div className="title">{r.name}</div><CopyValue value={r.account} label="NEAR account" size="md" /></td>
                  <td>{r.division}{r.sample ? <div className="sub">sample employee</div> : null}</td>
                  <td><IdentityStatusChip status={r.status} /></td>
                  <td className="mono sub">{r.nikMasked ?? '—'}</td>
                  <td className="sub when">{r.checkedAt ? r.checkedAt.slice(0, 16).replace('T', ' ') : '—'}</td>
                  <td className="row-actions">
                    {readOnly ? null : <>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => openCheck(r)} disabled={Boolean(disabled)} aria-label={`Check identity of ${r.name}`}>Check</button>
                      {r.status === 'needs_review' || r.status === 'verified' ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => openReview(r)} aria-label={`Review identity of ${r.name}`}>{r.status === 'needs_review' ? 'Review' : 'Withdraw'}</button> : null}
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <dialog ref={checkDialog} className="modal wide" aria-labelledby="idc-title">
        <form onSubmit={submitCheck}>
          <div className="modal-head"><div><h2 id="idc-title">Check identity: {target?.name}</h2><p>The KTP text is read with the photo covered; the faces are compared on this server. The images are not stored.</p></div></div>
          <div className="modal-body">
            {result ? <CheckResult check={result} /> : <>
              <ImagePick id="idc-ktp" label="KTP (photo or scan of the card)" hint="JPEG, PNG or WebP, up to 8 MB. The whole card, flat, without glare." file={ktp} onFile={setKtp} />
              <ImagePick id="idc-face" label="Face photo of the employee" hint="One face, looking at the camera, good light." file={face} onFile={setFace} camera />
            </>}
            {error ? <div className="form-error" role="alert"><AlertIcon size={18} />{error}</div> : null}
            {pending ? <div className="result wait" role="status"><ClockIcon size={16} /><span>Reading the KTP and comparing faces…</span></div> : null}
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => checkDialog.current?.close()} disabled={pending}>{result ? 'Close' : 'Cancel'}</button>
              {result ? null : <button type="submit" className="btn btn-primary" disabled={pending}><ShieldIcon size={16} />{pending ? 'Checking…' : 'Run identity check'}</button>}
            </div>
          </div>
        </form>
      </dialog>

      <dialog ref={reviewDialog} className="modal" aria-labelledby="idr-title">
        <form onSubmit={submitReview}>
          <div className="modal-head"><div><h2 id="idr-title">{target?.status === 'needs_review' ? 'Review' : 'Withdraw'}: {target?.name}</h2><p>Your decision and reason are logged with your name and the time.</p></div></div>
          <div className="modal-body">
            {target?.status === 'needs_review' ? (
              <fieldset className="field">
                <legend>Decision</legend>
                <label className="radio"><input type="radio" name="decision" checked={decision === 'verified'} onChange={() => setDecision('verified')} /> Approve: I compared the KTP and the photo myself</label>
                <label className="radio"><input type="radio" name="decision" checked={decision === 'failed'} onChange={() => setDecision('failed')} /> Fail the check</label>
              </fieldset>
            ) : <p className="hint">The recipient becomes &ldquo;Failed&rdquo; until a new check passes.</p>}
            <div className="field"><label htmlFor="idr-reason">Reason</label><input id="idr-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} required minLength={5} /></div>
            {error ? <div className="form-error" role="alert"><AlertIcon size={18} />{error}</div> : null}
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => reviewDialog.current?.close()} disabled={pending}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Save decision'}</button>
            </div>
          </div>
        </form>
      </dialog>
    </>
  );
}

interface BulkItem { account: string; ktp?: File; face?: File; state: 'waiting' | 'running' | 'done' | 'skipped' | 'error'; text: string }

/**
 * Check many employees at once: pick image files named `<NEAR account>.ktp.jpg` and
 * `<NEAR account>.face.jpg` (also .png / .webp). Each pair is checked one after another.
 */
export function BulkIdentityCheck({ csrfToken, disabled }: { csrfToken: string; disabled: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<BulkItem[]>([]);
  const [running, setRunning] = useState(false);

  function pick(files: FileList | null) {
    const map = new Map<string, BulkItem>();
    const other: string[] = [];
    for (const f of Array.from(files ?? [])) {
      const m = /^(.+)\.(ktp|face)\.(jpe?g|png|webp)$/i.exec(f.name);
      if (!m) { other.push(f.name); continue; }
      const account = m[1]!.toLowerCase();
      const it = map.get(account) ?? { account, state: 'waiting', text: '' };
      if (m[2]!.toLowerCase() === 'ktp') it.ktp = f; else it.face = f;
      map.set(account, it);
    }
    const list = [...map.values()].map((it) => (it.ktp && it.face ? it : { ...it, state: 'skipped' as const, text: it.ktp ? 'No face photo' : 'No KTP image' }));
    for (const name of other) list.push({ account: name, state: 'skipped', text: 'Name it <NEAR account>.ktp.jpg or <NEAR account>.face.jpg' });
    setItems(list.slice(0, 200));
  }

  async function runAll() {
    setRunning(true);
    const next = [...items];
    for (let i = 0; i < next.length; i++) {
      const it = next[i]!;
      if (it.state !== 'waiting' || !it.ktp || !it.face) continue;
      next[i] = { ...it, state: 'running', text: 'Checking…' };
      setItems([...next]);
      const data = new FormData();
      data.set('nearAccountId', it.account);
      data.set('ktp', it.ktp);
      data.set('face', it.face);
      const r = await call('/api/admin/identity/check', csrfToken, { method: 'POST', body: data });
      const c = r.body.check as CheckView | undefined;
      next[i] = r.ok && c ? { ...it, state: 'done', text: `${OUTCOME_TEXT[c.outcome]}${c.faceScore !== null ? ` (face ${c.faceScore.toFixed(2)})` : ''}` } : { ...it, state: 'error', text: r.message ?? 'Failed' };
      setItems([...next]);
      if (r.status === 429) break;
    }
    setRunning(false);
    router.refresh();
  }

  const ready = items.filter((i) => i.state === 'waiting').length;
  return (
    <section className="card card-pad" aria-labelledby="bulk-id-h">
      <h2 id="bulk-id-h" className="panel-h">Check many employees</h2>
      <p className="hint">Choose image files named <code>&lt;NEAR account&gt;.ktp.jpg</code> and <code>&lt;NEAR account&gt;.face.jpg</code> (PNG and WebP work too), for example <code>recipient1.sentfund-payroll.testnet.ktp.jpg</code>. Each employee is checked in turn (at most 30 per hour per admin).</p>
      <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" id="bulk-id-files" onChange={(e) => pick(e.target.files)} />
      <div className="toolbar-row">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => input.current?.click()} disabled={running || Boolean(disabled)}><UploadIcon size={16} />Choose files</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={runAll} disabled={running || !ready || Boolean(disabled)}>{running ? 'Checking…' : `Check ${ready} employee${ready === 1 ? '' : 's'}`}</button>
      </div>
      {items.length ? (
        <ul className="bulk-list" aria-live="polite">
          {items.map((it) => <li key={it.account} className={`is-${it.state}`}><span className="mono">{it.account}</span><span>{it.state === 'waiting' ? 'Ready' : it.text}</span></li>)}
        </ul>
      ) : null}
    </section>
  );
}
