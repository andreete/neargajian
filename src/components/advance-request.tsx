'use client';

/**
 * Employee: the Payroll Advance offer (Phase 23). The terms are previewed here with the same pure
 * money rules the server uses (advance/terms.ts); the server checks everything again when the
 * request is sent. Requesting needs the explicit consent tick. Phase 23b: "25%", "50%" and "Max"
 * fill in that share of the maximum, rounded down to 0.01; the deduction months are estimates.
 */
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { formatAmountShort, parseAmount } from '@/server/money';
import { AMOUNT_SHORTCUTS, CONSENT_TEXT, MIN_ADVANCE, shareOfMax, termsFor } from '@/server/advance/terms';
import { displayAmount } from '@/lib/format';
import { MonthsList } from './advance-bits';
import { AlertIcon, CheckIcon, WalletIcon } from './icons';

export function AdvanceRequestForm({ max, feeBps, instalments, months, csrfToken }: {
  /** Base units, decimal string. */
  max: string; feeBps: number; instalments: number; months: string[]; csrfToken: string;
}) {
  const router = useRouter();
  const maxUnits = BigInt(max);
  const [amount, setAmount] = useState(displayAmount(maxUnits));
  const [reason, setReason] = useState('');
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const amountErr = useId();

  const parsed = parseAmount(amount.trim());
  const valueError = !parsed.ok ? parsed.message : parsed.value < MIN_ADVANCE || parsed.value > maxUnits ? `Choose from 0.01 to ${displayAmount(maxUnits)} tUSDC.` : null;
  const terms = parsed.ok && !valueError ? termsFor(parsed.value, { feeBps, instalments }) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending || !terms) return;
    if (!consent) { setError(`Tick “${CONSENT_TEXT(instalments)}” to request the advance.`); return; }
    setPending(true);
    setError(null);
    const res = await fetch('/api/employee/advances', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ amount: amount.trim(), reason, consent }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({})) ?? {}) as { error?: { message?: string } };
    setPending(false);
    if (!res || !res.ok) { setError(body.error?.message ?? 'Network error: reload the page to see whether the request was recorded.'); return; }
    setDone('Request sent. The payroll maker reviews it; you can follow its status below.');
    router.refresh();
  }

  if (done) return <div className="result ok" role="status" data-testid="advance-requested"><CheckIcon size={16} /><span>{done}</span></div>;

  return (
    <form onSubmit={submit} noValidate className="advance-form" data-testid="advance-offer">
      <div className="field">
        <label htmlFor="adv-amount">Amount (tUSDC)</label>
        <div className="amount-row">
          <input id="adv-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={valueError ? true : undefined} aria-describedby={amountErr} />
          <div className="amount-shortcuts" role="group" aria-label="Amount shortcuts" data-testid="advance-shortcuts">
            {AMOUNT_SHORTCUTS.map((sc) => {
              const v = shareOfMax(maxUnits, sc.percent);
              const usable = v >= MIN_ADVANCE;
              return (
                <button key={sc.label} type="button" className="btn btn-secondary btn-sm" disabled={!usable} aria-pressed={usable && parsed.ok && parsed.value === v}
                  title={usable ? `${sc.percent}% of your maximum, rounded down to 0.01: ${formatAmountShort(v)} tUSDC` : 'Below the 0.01 tUSDC minimum'}
                  onClick={() => { setAmount(formatAmountShort(v)); setError(null); }}>{sc.label}</button>
              );
            })}
          </div>
        </div>
        <span id={amountErr} className={valueError ? 'field-error' : 'hint'}>{valueError ?? `From 0.01 up to ${displayAmount(maxUnits)} tUSDC.`}</span>
      </div>
      <div className="field">
        <label htmlFor="adv-reason">Reason (optional)</label>
        <input id="adv-reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
        <span className="hint">Seen by the payroll maker and the approvers.</span>
      </div>
      {terms ? (
        <div className="advance-terms" aria-live="polite">
          <dl className="kv confirm-kv" data-testid="advance-terms">
            <dt>Advance (you repay this)</dt><dd className="num">{displayAmount(terms.amount)} tUSDC</dd>
            <dt>Fee ({(feeBps / 100).toFixed(2).replace(/\.?0+$/, '')}%, taken at payout)</dt><dd className="num">{displayAmount(terms.fee)} tUSDC</dd>
            <dt>You receive</dt><dd className="num"><strong data-testid="advance-receive">{displayAmount(terms.net)} tUSDC</strong></dd>
            <dt>Monthly instalment</dt><dd className="num" data-testid="advance-instalment">{displayAmount(terms.schedule.regular)} tUSDC{terms.schedule.last !== terms.schedule.regular ? ` (last one ${displayAmount(terms.schedule.last)})` : ''} for {instalments} months</dd>
          </dl>
          <MonthsList months={months} amounts={terms.schedule.amounts} title="Estimated salary deductions" />
        </div>
      ) : null}
      <label className="consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>{CONSENT_TEXT(instalments)}</span>
      </label>
      {error ? <div className="form-error" role="alert"><AlertIcon size={18} />{error}</div> : null}
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={pending || !terms || !consent}><WalletIcon size={18} />{pending ? 'Sending…' : terms ? `Request ${displayAmount(terms.amount)} tUSDC` : 'Request Payroll Advance'}</button>
        <span className="hint">Nothing is paid until the maker submits it and both approvers approve it on NEAR.</span>
      </div>
    </form>
  );
}
