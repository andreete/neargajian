'use client';

import { useState, type FormEvent } from 'react';
import { AlertIcon } from './icons';

export function NewRunForm({ csrfToken, defaultTitle }: { csrfToken: string; defaultTitle: string }) {
  const [title, setTitle] = useState(defaultTitle);
  const [postingMode, setPostingMode] = useState<'consolidated' | 'detailed'>('consolidated');
  const [source, setSource] = useState<'manual' | 'upload'>('upload');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (!title.trim()) return setError('Enter a title, e.g. December payroll.');
    setPending(true);
    setError(null);
    const res = await fetch('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ title, postingMode, source }) });
    const body = (await res.json().catch(() => ({}))) as { href?: string; error?: { message: string } };
    if (res.ok && body.href) {
       
      window.location.assign(body.href);
      return;
    }
    setError(body.error?.message ?? 'Could not create the run.');
    setPending(false);
  }

  return (
    <form className="card card-pad new-run" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="run-title">Run title</label>
        <input id="run-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} aria-invalid={error && !title.trim() ? true : undefined} />
      </div>
      <fieldset className="choice-group">
        <legend>How will you add recipients?</legend>
        <div className="choice-grid two">
          <label className="choice"><input type="radio" name="source" checked={source === 'upload'} onChange={() => setSource('upload')} /><span className="c-title">Upload a file</span><span className="c-desc">CSV or tab-delimited TXT, up to 1,000 rows. Rows stay read-only.</span></label>
          <label className="choice"><input type="radio" name="source" checked={source === 'manual'} onChange={() => setSource('manual')} /><span className="c-title">Enter rows manually</span><span className="c-desc">Type one or more recipients and edit them before submitting.</span></label>
        </div>
      </fieldset>
      <fieldset className="choice-group">
        <legend>Company posting</legend>
        <div className="choice-grid two">
          <label className="choice"><input type="radio" name="posting" checked={postingMode === 'consolidated'} onChange={() => setPostingMode('consolidated')} /><span className="c-title">Consolidated</span><span className="c-desc">One company entry for the whole run.</span></label>
          <label className="choice"><input type="radio" name="posting" checked={postingMode === 'detailed'} onChange={() => setPostingMode('detailed')} /><span className="c-title">Detailed</span><span className="c-desc">One company entry per recipient.</span></label>
        </div>
      </fieldset>
      {error ? <div className="form-error" role="alert"><AlertIcon size={18} />{error}</div> : null}
      <div className="form-actions"><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? 'Creating…' : 'Create draft run'}</button><span className="hint">You can change the posting mode until you submit.</span></div>
    </form>
  );
}
