'use client';

/**
 * "Payroll assistant" on the maker's New run page (Phase 19). The maker types (or dictates with
 * the browser's own speech recognition, English) a request; the server answers with a preview,
 * a follow-up question or a refusal. Nothing is created until the maker presses "Create draft",
 * and the draft is then reviewed and submitted by hand like any other run.
 */
import { useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { AlertIcon, CheckIcon, InfoIcon, MicIcon, SendIcon, SparkIcon } from './icons';

interface PreviewRow { name: string; division: string; accountId: string; amount: string; readiness: string; sample: boolean }
interface Preview { title: string; postingMode: 'consolidated' | 'detailed'; postingDefaulted: boolean; scope: string; amountPerPerson: string; count: number; total: string; rows: PreviewRow[]; notReady: number }
type Reply =
  | { kind: 'preview'; requestId: string; preview: Preview }
  | { kind: 'question'; requestId: string; question: string }
  | { kind: 'refused' | 'error' | 'rate_limited' | 'off'; message: string };
interface Turn { role: 'user' | 'assistant'; text: string }

// Minimal typing for the Web Speech API (Chrome and Edge expose it as webkitSpeechRecognition).
interface Recognition {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
  start(): void; stop(): void;
}
type RecognitionCtor = new () => Recognition;
function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const EXAMPLE = 'Create a disbursement for the Sales division, 0.05 tUSDC each, called November commissions';

export function PayrollAssistant({ enabled, modelId, stub, csrfToken }: { enabled: boolean; modelId: string | null; stub: boolean; csrfToken: string }) {
  const [text, setText] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [reply, setReply] = useState<Reply | null>(null);
  const [pending, setPending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  // The microphone shows only where the browser has speech recognition (false on the server: no mismatch).
  const voiceSupported = useSyncExternalStore(() => () => {}, () => Boolean(recognitionCtor()), () => false);
  const [listening, setListening] = useState(false);
  const voice = !voiceSupported ? 'unsupported' : listening ? 'listening' : 'idle';
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);


  function listen() {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    if (voice === 'listening') { recognition.current?.stop(); return; }
    const r = new Ctor();
    r.lang = 'en-US';
    r.interimResults = true;
    r.continuous = false;
    const before = text ? `${text.trimEnd()} ` : '';
    r.onresult = (e) => {
      let heard = '';
      for (let i = 0; i < e.results.length; i++) heard += e.results[i]?.[0]?.transcript ?? '';
      setText(`${before}${heard}`.slice(0, 500));
    };
    r.onerror = (e) => setVoiceError(e.error === 'not-allowed' ? 'Microphone access was blocked. Allow it in the browser, or type instead.' : 'Voice input stopped. Check the text, or type instead.');
    r.onend = () => { setListening(false); box.current?.focus(); };
    recognition.current = r;
    setVoiceError(null);
    setListening(true);
    r.start();
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    const message = text.trim();
    if (!message || pending) return;
    const next: Turn[] = [...turns, { role: 'user', text: message }];
    setPending(true);
    setCreateError(null);
    let body: Reply;
    try {
      const res = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ messages: next }) });
      const data = (await res.json().catch(() => ({}))) as Reply & { error?: { message: string } };
      body = data.error ? { kind: 'error', message: data.error.message } : data;
    } catch {
      body = { kind: 'error', message: 'Network error. Nothing was created; try again.' };
    }
    setPending(false);
    if (body.kind === 'question') { setTurns([...next, { role: 'assistant', text: body.question }]); setText(''); }
    else if (body.kind === 'preview') { setTurns(next); setText(''); }
    else { setTurns([]); setText(next.filter((t) => t.role === 'user').map((t) => t.text).join(' ').slice(0, 500)); } // refused: the words stay in the box to edit
    setReply(body);
  }

  function change() {
    // Back to editing: the maker's own words return to the box; the conversation starts again.
    setText(turns.filter((t) => t.role === 'user').map((t) => t.text).join(' ').slice(0, 500));
    setTurns([]);
    setReply(null);
    setCreateError(null);
    box.current?.focus();
  }

  async function create(requestId: string) {
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/assistant/drafts', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ requestId }) });
      const data = (await res.json().catch(() => ({}))) as { href?: string; error?: { message: string } };
      if (res.ok && data.href) { window.location.assign(data.href); return; }
      setCreateError(data.error?.message ?? 'The draft was not created.');
    } catch {
      setCreateError('Network error: the draft may or may not exist. Check My runs before trying again.');
    }
    setCreating(false);
  }

  const waitingForAnswer = reply?.kind === 'question';
  return (
    <section className="card assistant" aria-labelledby="assistant-title" data-testid="payroll-assistant">
      <div className="panel-title">
        <h2 id="assistant-title"><SparkIcon size={18} /> Payroll assistant</h2>
        {enabled ? <span className="hint">{stub ? 'Test stub model (browser tests only)' : `Model: ${modelId}`}</span> : null}
      </div>
      <div className="panel-body stack">
        {!enabled ? (
          <div className="callout" role="note" data-testid="assistant-off"><InfoIcon size={18} /><span>The payroll assistant is off on this copy (no API key). Everything else works: create the run below.</span></div>
        ) : (
          <>
            <p className="hint">Describe the run in your own words, for example: <em>&ldquo;{EXAMPLE}&rdquo;</em>. The assistant only prepares a <strong>draft</strong> from the recipient directory. It never submits, approves or pays; you check the draft and submit it yourself. Only your words and the division names are sent to the model.</p>
            {turns.length ? (
              <ol className="assistant-turns" aria-label="Conversation">
                {turns.map((t, i) => <li key={i} className={t.role} data-testid={t.role === 'assistant' && i === turns.length - 1 && reply?.kind === 'question' ? 'assistant-question' : undefined}><span className="who">{t.role === 'user' ? 'You' : 'Assistant'}</span>{t.text}</li>)}
              </ol>
            ) : null}
            <div aria-live="polite">
              {reply && (reply.kind === 'refused' || reply.kind === 'error' || reply.kind === 'rate_limited' || reply.kind === 'off') ? (
                <div className="result bad" role="alert" data-testid="assistant-refusal"><AlertIcon size={16} /><span>{reply.message}</span></div>
              ) : null}
              {reply?.kind === 'question' ? <span className="sr-only" role="status">The assistant asks: {reply.question} Answer below.</span> : null}
            </div>
            {reply?.kind === 'preview' ? (
              <div className="assistant-preview" data-testid="assistant-preview">
                <h3>Preview: nothing is created yet</h3>
                <p className="preview-line"><strong>{reply.preview.scope}</strong>, {reply.preview.count} recipient{reply.preview.count === 1 ? '' : 's'}, {reply.preview.amountPerPerson} tUSDC each, total <strong className="num">{reply.preview.total} tUSDC</strong>, {reply.preview.postingMode} posting{reply.preview.postingDefaulted ? ' (default)' : ''}</p>
                <p className="hint">Run title: <strong>{reply.preview.title}</strong></p>
                {reply.preview.notReady ? <div className="result wait" role="note"><AlertIcon size={16} /><span>{reply.preview.notReady} of {reply.preview.count} recipients are not confirmed &ldquo;Ready to receive tUSDC&rdquo; by the testnet check (see Recipients). Payouts to accounts that do not exist or are not registered fail.</span></div> : null}
                <div className="table-wrap preview-table" role="region" aria-label="Recipients in the preview" tabIndex={0}>
                  <table className="data">
                    <thead><tr><th scope="col">Recipient</th><th scope="col">Division</th><th scope="col">NEAR account</th><th scope="col" className="amount">Amount (tUSDC)</th></tr></thead>
                    <tbody>{reply.preview.rows.slice(0, 50).map((r) => <tr key={r.accountId}><td>{r.name}</td><td>{r.division}</td><td className="mono">{r.accountId}</td><td className="amount">{r.amount}</td></tr>)}</tbody>
                  </table>
                </div>
                {reply.preview.rows.length > 50 ? <p className="hint">Showing 50 of {reply.preview.rows.length}; the draft has all of them.</p> : null}
                {createError ? <div className="form-error" role="alert"><AlertIcon size={18} />{createError}</div> : null}
                <div className="form-actions">
                  <button type="button" className="btn btn-primary" onClick={() => create(reply.requestId)} disabled={creating}><CheckIcon size={16} />{creating ? 'Creating…' : 'Create draft'}</button>
                  <button type="button" className="btn btn-secondary" onClick={change} disabled={creating}>Change</button>
                </div>
              </div>
            ) : null}
            {reply?.kind !== 'preview' ? (
              <form onSubmit={send} className="assistant-form">
                <label htmlFor="assistant-input" className={waitingForAnswer ? undefined : 'sr-only'}>{waitingForAnswer ? 'Your answer' : 'Your request'}</label>
                <div className="assistant-input-row">
                  <textarea id="assistant-input" ref={box} className="textarea" rows={2} maxLength={500} value={text} onChange={(e) => setText(e.target.value)}
                    placeholder={waitingForAnswer ? 'For example: 0.05' : EXAMPLE} disabled={pending} />
                  {voice !== 'unsupported' ? (
                    <button type="button" className={`btn btn-secondary mic ${voice === 'listening' ? 'is-listening' : ''}`} onClick={listen} disabled={pending} aria-pressed={voice === 'listening'} aria-label={voice === 'listening' ? 'Stop voice input' : 'Speak your request (English)'} title="Voice input uses your browser's speech recognition">
                      <MicIcon size={18} /><span className="mic-label">{voice === 'listening' ? 'Listening…' : 'Speak'}</span>
                    </button>
                  ) : null}
                  <button type="submit" className="btn btn-primary" disabled={pending || !text.trim()}><SendIcon size={16} />{pending ? 'Thinking…' : waitingForAnswer ? 'Answer' : 'Send'}</button>
                </div>
                {voiceError ? <span className="field-error" role="alert">{voiceError}</span> : null}
                {voice !== 'unsupported' ? <span className="hint">Voice fills the box so you can check the text before sending. Your browser&apos;s speech recognition sends the audio to the browser vendor&apos;s service.</span> : null}
                {turns.length ? <button type="button" className="btn btn-ghost btn-sm start-over" onClick={() => { setTurns([]); setReply(null); setText(''); }}>Start over</button> : null}
              </form>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
