'use client';

/**
 * Employee: the live camera face check before a Payroll Advance request (Phase 24).
 *
 * "Verify it's you" opens the front camera with a short notice. The server issues a one-time
 * challenge (random turn order, nonce valid 60 s); the page guides "look at the camera", then "turn
 * your head slowly to the left/right" and grabs small JPEG frames (480 px wide, RAW, not mirrored;
 * only the preview is mirrored), sends them once with the nonce, and stops the camera. The server
 * checks and discards the frames; nothing is kept in the browser either.
 *
 * TEST-ONLY stand-in (FACE_CAMERA_STANDIN=browser-tests on a local test server, never online):
 * this server has no camera, so the stand-in sends SYNTHETIC specimen frames
 * (public/specimens/turn/) instead of camera frames. Everything after that is the real check.
 */
import { useEffect, useRef, useState } from 'react';
import { AlertIcon, CameraIcon, CheckIcon, InfoIcon, ShieldIcon } from './icons';

export interface FaceCheckSetup {
  /** The employee's name as in the directory ("This doesn't look like <name>"). */
  name: string;
  /** Why the check cannot start (no template, no key, engine off); null when it can. */
  blocker: string | null;
  /** Public demo (HOSTED_DEMO=true): a failed match with a passed head turn may continue as a demo. */
  demo: boolean;
  /** TEST-ONLY camera stand-in: the specimen to send by default; null = the real camera. */
  standIn: { defaultKey: string } | null;
}

export interface FaceAttempt {
  attemptId: string; outcome: string; passed: boolean; similarity: number | null; threshold: number;
  livenessPassed: boolean; order: 'left_right' | 'right_left' | null; message: string; overrideAvailable: boolean; attemptsLeft: number;
}

export const FACE_NOTICE = 'What is checked: that you are the employee whose identity the admin verified (your face is compared with your encrypted face template) and that a real person is in front of the camera (you turn your head as asked). Camera images are processed in memory on the SentFund server and never stored. The result (passed or not, the similarity score and the time) is shown to the payroll maker and the approvers with your request.';

const STANDIN_PEOPLE = [
  { key: 'emma', label: 'Emma Clark (specimen)' }, { key: 'daniel', label: 'Daniel Hall (specimen)' },
  { key: 'grace', label: 'Grace Lewis (specimen)' }, { key: 'impostor', label: 'Impostor (someone else)' },
] as const;

type Dir = 'left' | 'right';
type Phase = 'opening' | 'ready' | 'running' | 'checking' | 'result' | 'camera_error' | 'sending' | 'done';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function cameraHelp(error: unknown): string {
  const name = error instanceof DOMException ? error.name : error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'The camera is blocked for this site. To allow it, click the camera or lock icon in the address bar, choose Allow for the camera, then press Try again. On a phone: open your browser settings, Site settings, Camera, and allow this site.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found. Use a phone, or a laptop with a front camera.';
  if (name === 'NotReadableError') return 'The camera is in use by another app. Close that app, then press Try again.';
  return 'This browser cannot open the camera on this page. Use a current browser (Chrome, Safari, Firefox or Edge) over HTTPS.';
}

export function FaceCheckPanel({ setup, csrfToken, onVerified, onCancel }: {
  setup: FaceCheckSetup; csrfToken: string;
  /** Sends the request with this attempt; resolves to an error message, or null when it was sent. */
  onVerified: (attemptId: string, demoOverride: boolean) => Promise<string | null>;
  onCancel: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>(setup.standIn ? 'ready' : 'opening');
  const [step, setStep] = useState<{ text: string; dir: Dir | null } | null>(null);
  const [attempt, setAttempt] = useState<FaceAttempt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState<string | null>(null);
  const [standInKey, setStandInKey] = useState(setup.standIn?.defaultKey ?? 'emma');

  const stop = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  };

  async function open() {
    setHelp(null);
    setError(null);
    if (setup.standIn) { setPhase('ready'); return; }
    setPhase('opening');
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) { setHelp(cameraHelp(null)); setPhase('camera_error'); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      stream.current = s;
      if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => undefined); }
      setPhase('ready');
    } catch (e) {
      stop();
      setHelp(cameraHelp(e));
      setPhase('camera_error');
    }
  }

  useEffect(() => {
    // Opens the camera when the panel appears (scrolled into view on a phone); stops it when the panel goes away.
    panel.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void open();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function grab(pose: 'center' | Dir): Promise<Blob | null> {
    if (setup.standIn) {
      const r = await fetch(`/specimens/turn/${standInKey}-${pose}.jpg`).catch(() => null);
      return r && r.ok ? r.blob() : null;
    }
    const v = video.current;
    if (!v || !v.videoWidth) return null;
    const w = 480, h = Math.round((v.videoHeight / v.videoWidth) * w);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d')?.drawImage(v, 0, 0, w, h);
    return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/jpeg', 0.8));
  }

  async function run() {
    setError(null);
    setAttempt(null);
    setPhase('running');
    setStep({ text: 'Getting ready…', dir: null });
    const res = await fetch('/api/employee/face-check/challenge', { method: 'POST', headers: { 'x-csrf-token': csrfToken } }).catch(() => null);
    const body = (await res?.json().catch(() => ({})) ?? {}) as { challenge?: { challengeId: string; nonce: string; steps: [Dir, Dir] }; error?: { message?: string } };
    if (!res || !res.ok || !body.challenge) { setError(body.error?.message ?? 'Network error. Try again.'); setPhase('ready'); setStep(null); return; }
    const { challengeId, nonce, steps } = body.challenge;
    const fast = Boolean(setup.standIn);
    const plan: { text: string; pose: 'center' | Dir; n: number; ms: number }[] = [
      { text: 'Look straight at the camera', pose: 'center', n: 2, ms: fast ? 200 : 900 },
      { text: `Turn your head slowly to the ${steps[0]}`, pose: steps[0], n: 6, ms: fast ? 300 : 2700 },
      { text: `Now slowly to the ${steps[1]}`, pose: steps[1], n: 6, ms: fast ? 300 : 2700 },
    ];
    const frames: Blob[] = [];
    for (const p of plan) {
      setStep({ text: p.text, dir: p.pose === 'center' ? null : p.pose });
      for (let i = 0; i < p.n; i++) {
        await sleep(p.ms / p.n);
        const b = await grab(p.pose);
        if (b) frames.push(b);
      }
    }
    stop();
    setStep(null);
    setPhase('checking');
    const form = new FormData();
    form.set('challengeId', challengeId);
    form.set('nonce', nonce);
    frames.forEach((f, i) => form.append('frames', f, `frame-${i}.jpg`));
    frames.length = 0;
    const r2 = await fetch('/api/employee/face-check', { method: 'POST', headers: { 'x-csrf-token': csrfToken }, body: form }).catch(() => null);
    const b2 = (await r2?.json().catch(() => ({})) ?? {}) as { attempt?: FaceAttempt; error?: { message?: string } };
    if (!r2 || !r2.ok || !b2.attempt) { setError(b2.error?.message ?? 'Network error. Try again.'); setPhase('result'); return; }
    setAttempt(b2.attempt);
    if (b2.attempt.passed) await send(b2.attempt.attemptId, false);
    else setPhase('result');
  }

  async function send(attemptId: string, override: boolean) {
    setPhase('sending');
    const err = await onVerified(attemptId, override);
    if (err) { setError(err); setPhase('result'); } else setPhase('done');
  }

  async function again() {
    setAttempt(null);
    setError(null);
    await open();
  }

  const sim = attempt?.similarity != null ? attempt.similarity.toFixed(2) : null;
  const prompt = phase === 'opening' ? 'Opening the camera…' : phase === 'running' && step ? step.text : phase === 'checking' ? 'Checking…'
    : phase === 'sending' ? 'Face verified. Sending the request…' : phase === 'ready' ? 'When you are ready, press Start. You will be asked to turn your head slowly one way, then the other.' : '';

  return (
    <div ref={panel} className="face-check" data-testid="face-check" role="region" aria-label="Face check">
      <div className="callout" role="note" data-testid="face-notice"><InfoIcon size={18} /><span>{FACE_NOTICE}</span></div>
      {setup.standIn ? (
        <div className="callout callout-warn" role="note" data-testid="face-standin">
          <AlertIcon size={18} />
          <span><strong>Stand-in camera (browser tests only).</strong> This test server has no camera, so the check sends synthetic specimen frames instead of camera frames. The face check itself is the real one.
            <label className="face-standin-pick">Frames of <select value={standInKey} onChange={(e) => setStandInKey(e.target.value)} disabled={phase !== 'ready' && phase !== 'result'}>{STANDIN_PEOPLE.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select></label>
          </span>
        </div>
      ) : (
        <div className={phase === 'camera_error' || phase === 'done' ? 'face-stage is-hidden' : 'face-stage'}>
          <video ref={video} className="face-video" muted playsInline aria-label="Camera preview (mirrored)" />
          {step ? <div className="face-step" aria-hidden="true">{step.dir === 'left' ? '←' : step.dir === 'right' ? '→' : '•'}</div> : null}
        </div>
      )}
      <p className={prompt ? 'face-prompt' : 'face-prompt is-empty'} aria-live="assertive" data-testid="face-step">{prompt}</p>

      {phase === 'camera_error' ? (
        <div className="form-error" role="alert" data-testid="face-camera-help"><CameraIcon size={18} /><span>{help} The request cannot be sent without the face check.</span></div>
      ) : null}

      {attempt && !attempt.passed ? (
        <div className="result bad" role="alert" data-testid="face-result"><AlertIcon size={16} /><span>{[
          attempt.message,
          sim ? `(similarity ${sim}; ${attempt.threshold} or more is a match)` : '',
          attempt.attemptsLeft === 0 ? 'No attempts left this hour.' : `${attempt.attemptsLeft} attempt${attempt.attemptsLeft === 1 ? '' : 's'} left this hour.`,
        ].filter(Boolean).join(' ')}</span></div>
      ) : null}
      {attempt?.passed && phase !== 'result' ? (
        <div className="result ok" role="status" data-testid="face-result"><CheckIcon size={16} /><span>{attempt.message} Similarity {sim}.</span></div>
      ) : null}
      {error ? <div className="form-error" role="alert"><AlertIcon size={18} />{error}</div> : null}

      {attempt?.overrideAvailable && phase === 'result' ? (
        <div className="callout callout-warn" role="note" data-testid="face-override">
          <AlertIcon size={18} />
          <span><strong>Public demo.</strong> You are not the synthetic employee, so the face did not match: that is the real result. Your head turn passed, so you can continue as a demo. The request is then marked “Face check: demo override (the camera face did not match; public demo only)” for the maker and the approvers. Outside the public demo a face that does not match is always refused.</span>
        </div>
      ) : null}

      <div className="form-actions">
        {phase === 'ready' ? <button type="button" className="btn btn-primary" onClick={() => void run()}><ShieldIcon size={18} />Start</button> : null}
        {phase === 'camera_error' || (phase === 'result' && (attempt?.attemptsLeft ?? 1) > 0) ? <button type="button" className="btn btn-secondary" onClick={() => void again()}>Try again</button> : null}
        {attempt?.overrideAvailable && phase === 'result' ? <button type="button" className="btn btn-warning" onClick={() => void send(attempt.attemptId, true)}>Continue as a demo</button> : null}
        {phase !== 'running' && phase !== 'checking' && phase !== 'sending' && phase !== 'done' ? <button type="button" className="btn btn-ghost" onClick={() => { stop(); onCancel(); }}>Cancel</button> : null}
      </div>
    </div>
  );
}
