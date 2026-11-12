'use client';

/**
 * Accessible sign-in dialog: native modal <dialog> plus an explicit Tab focus trap, Escape
 * to close, focus restored to the control that opened it, labelled fields with visible
 * errors, and a live region for form errors. In demo mode (only) a "Demo accounts" box lists
 * each demo sign-in with a "Fill" button (Phase 25) that puts its email and the demo password
 * into the fields and moves the focus to "Sign in"; it never signs in by itself. The server
 * decides the role and dashboard, with the same lockout and CSRF checks as typed credentials.
 */
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AlertIcon, CheckIcon, XIcon } from './icons';

/** Demo credentials (demo mode only): one row per account. The server picks the role. */
export interface DemoInfo {
  accounts: { email: string; role: string; name: string }[];
  password: string;
}

const OpenContext = createContext<(() => void) | null>(null);

export function useOpenSignIn(): () => void {
  const open = useContext(OpenContext);
  if (!open) throw new Error('SignInButton must be inside LoginDialogProvider');
  return open;
}

export function SignInButton({ className = 'btn btn-primary', children }: { className?: string; children: ReactNode }) {
  const open = useOpenSignIn();
  return <button type="button" className={className} onClick={open} aria-haspopup="dialog">{children}</button>;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';

export function LoginDialogProvider({ children, demo, autoOpen = false, notice }: {
  children: ReactNode; demo: DemoInfo | null; autoOpen?: boolean; notice?: string | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [pending, setPending] = useState(false);
  const titleId = useId();
  const descId = useId();
  const emailErrId = useId();
  const passwordErrId = useId();

  const open = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setErrors(notice ? { form: notice } : {});
    dialog.showModal();
    emailRef.current?.focus();
  }, [notice]);

  const close = useCallback(() => dialogRef.current?.close(), []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClose = () => {
      setPending(false);
      opener.current?.focus();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (e.target === dialog) dialog.close(); // click on the backdrop
    };
    dialog.addEventListener('close', onClose);
    dialog.addEventListener('keydown', onKeyDown);
    dialog.addEventListener('click', onClick);
    return () => {
      dialog.removeEventListener('close', onClose);
      dialog.removeEventListener('keydown', onKeyDown);
      dialog.removeEventListener('click', onClick);
    };
  }, []);

  useEffect(() => {
    if (autoOpen) open();
  }, [autoOpen, open]);

  /** Fill: both fields from a demo row, clear old errors, focus "Sign in" (Enter signs in). Never submits. */
  function fill(account: string) {
    if (!demo || pending) return;
    setEmail(account);
    setPassword(demo.password);
    setErrors({});
    submitRef.current?.focus();
  }
  const selected = demo?.accounts.find((a) => a.email === email.trim() && password === demo.password)?.email ?? null;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const next: typeof errors = {};
    if (!email.trim()) next.email = 'Enter your email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'Enter a valid email address, e.g. maker@sentfund.my.id.';
    if (!password) next.password = 'Enter your password.';
    setErrors(next);
    if (next.email) return document.getElementById('login-email')?.focus();
    if (next.password) return document.getElementById('login-password')?.focus();
    setPending(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
        credentials: 'same-origin',
      });
      const body = (await res.json().catch(() => ({}))) as { redirectTo?: string; error?: { message?: string } };
      if (res.ok && body.redirectTo) {
        window.location.assign(body.redirectTo);
        return;
      }
      setErrors({ form: body.error?.message ?? 'Sign-in failed. Try again.' });
      setPending(false);
    } catch {
      setErrors({ form: 'Network error. Check your connection and try again.' });
      setPending(false);
    }
  }

  return (
    <OpenContext.Provider value={open}>
      {children}
      <dialog ref={dialogRef} className={demo ? 'modal signin-demo' : 'modal'} aria-labelledby={titleId} aria-describedby={descId}>
        <div className="modal-head">
          <div>
            <h2 id={titleId}>Sign in to SentFund</h2>
            <p id={descId}>Use your work email and password. We open the dashboard for your role.</p>
          </div>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close sign-in dialog"><XIcon size={18} /></button>
        </div>
        <form className="modal-body signin-body" onSubmit={onSubmit} noValidate aria-busy={pending}>
          <div className="signin-fields">
            <div aria-live="assertive" aria-atomic="true">
              {errors.form ? <div className="form-error" role="alert"><AlertIcon size={18} />{errors.form}</div> : null}
            </div>
            <div className="field">
              <label htmlFor="login-email">Email</label>
              <input id="login-email" ref={emailRef} name="email" type="email" autoComplete="username" value={email}
                onChange={(e) => setEmail(e.target.value)} aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? emailErrId : undefined} />
              {errors.email ? <span id={emailErrId} className="field-error">{errors.email}</span> : null}
            </div>
            <div className="field">
              <label htmlFor="login-password">Password</label>
              <input id="login-password" name="password" type="password" autoComplete="current-password" value={password}
                onChange={(e) => setPassword(e.target.value)} aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? passwordErrId : undefined} />
              {errors.password ? <span id={passwordErrId} className="field-error">{errors.password}</span> : null}
            </div>
            <button type="submit" ref={submitRef} className="btn btn-primary" disabled={pending}>
              {pending ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
          {demo ? (
            <section className="demo-accounts" aria-labelledby="demo-accounts-title">
              <h3 id="demo-accounts-title">Demo accounts</h3>
              <ul>
                {demo.accounts.map((a) => (
                  <li key={a.email} className={a.email === selected ? 'is-selected' : undefined} aria-current={a.email === selected ? 'true' : undefined}>
                    <span className="demo-account">
                      <span className="mono">{a.email}</span>
                      <span className="demo-account-role">{a.role} · {a.name}</span>
                    </span>
                    <button type="button" className="btn btn-secondary btn-fill" aria-label={`Fill ${a.email}`}
                      aria-pressed={a.email === selected} disabled={pending} onClick={() => fill(a.email)}>
                      {a.email === selected ? <CheckIcon size={14} /> : null}Fill
                    </button>
                  </li>
                ))}
              </ul>
              <p>Fill enters the email and the shared demo password <span className="mono">{demo.password}</span>; then press Sign in. Synthetic data, zero-value tUSDC on NEAR testnet.</p>
            </section>
          ) : null}
        </form>
      </dialog>
    </OpenContext.Provider>
  );
}
