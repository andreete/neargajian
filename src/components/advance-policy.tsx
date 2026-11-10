'use client';

/** Admin: the Payroll Advance policy form (Phase 23). Saved through the admin API (validated, logged). */
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AlertIcon, CheckIcon } from './icons';

export interface PolicyValue { enabled: boolean; maxPercent: number; feeBps: number; instalments: number; minDays: number }
type Field = Exclude<keyof PolicyValue, 'enabled'>;

const FIELDS: { key: Field; label: string; hint: string }[] = [
  { key: 'maxPercent', label: 'Maximum advance (% of monthly net pay)', hint: '10 to 300. Also capped by the recipient’s maximum per payout and the per-row cap.' },
  { key: 'feeBps', label: 'Fee (basis points of the advance, 200 = 2%)', hint: '0 to 1,000. Taken at payout; stays in the vault as employer income.' },
  { key: 'instalments', label: 'Repayment (equal monthly instalments)', hint: '1 to 12. The last instalment absorbs the rounding.' },
  { key: 'minDays', label: 'Minimum days since the start date', hint: '0 to 730.' },
];

export function AdvancePolicyForm({ policy, csrfToken, readOnly }: { policy: PolicyValue; csrfToken: string; readOnly: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(policy.enabled);
  const [values, setValues] = useState<Record<Field, string>>({ maxPercent: String(policy.maxPercent), feeBps: String(policy.feeBps), instalments: String(policy.instalments), minDays: String(policy.minDays) });
  const [errors, setErrors] = useState<Partial<Record<keyof PolicyValue, string>>>({});
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (pending || readOnly) return;
    setPending(true);
    setNotice(null);
    setErrors({});
    const body = { enabled, ...Object.fromEntries(FIELDS.map((f) => [f.key, Number(values[f.key])])) };
    const res = await fetch('/api/admin/payroll-advance', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify(body) }).catch(() => null);
    const json = (await res?.json().catch(() => ({})) ?? {}) as { errors?: { field: keyof PolicyValue; message: string }[]; changed?: string[]; error?: { message?: string } };
    setPending(false);
    if (res?.status === 422 && json.errors) { setErrors(Object.fromEntries(json.errors.map((x) => [x.field, x.message]))); return; }
    if (!res?.ok) { setNotice({ ok: false, text: json.error?.message ?? 'Not saved.' }); return; }
    setNotice({ ok: true, text: json.changed?.length ? 'Saved. The change is logged with your name and the time.' : 'Nothing changed.' });
    router.refresh();
  }

  return (
    <form onSubmit={save} noValidate className="stack" data-testid="advance-policy">
      <div className="setting-card-inline">
        <button type="button" role="switch" aria-checked={enabled} aria-label="Offer Payroll Advance" className={`switch ${enabled ? 'is-on' : ''}`} onClick={() => setEnabled(!enabled)} disabled={readOnly || pending}>
          <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
          <span className="switch-text">{enabled ? 'On' : 'Off'}</span>
        </button>
        <span>Offer Payroll Advance to eligible employees</span>
      </div>
      <div className="policy-grid">
        {FIELDS.map((f) => (
          <div className="field" key={f.key}>
            <label htmlFor={`pol-${f.key}`}>{f.label}</label>
            <input id={`pol-${f.key}`} inputMode="numeric" value={values[f.key]} readOnly={readOnly} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} aria-invalid={errors[f.key] ? true : undefined} aria-describedby={`pol-${f.key}-h`} />
            <span id={`pol-${f.key}-h`} className={errors[f.key] ? 'field-error' : 'hint'}>{errors[f.key] ?? f.hint}</span>
          </div>
        ))}
      </div>
      <ul className="hint fixed-rules">
        <li>Always: one advance at a time per employee (a new one only after the previous one is fully repaid).</li>
        <li>Always: only active, identity-verified recipients that are “Ready to receive tUSDC”.</li>
        <li>Always: a payroll deducts at most 50% of that row’s gross pay and never takes a row to zero; the rest carries over.</li>
      </ul>
      <div aria-live="polite">{notice ? <div className={`result ${notice.ok ? 'ok' : 'bad'}`} role="status">{notice.ok ? <CheckIcon size={16} /> : <AlertIcon size={16} />}<span>{notice.text}</span></div> : null}</div>
      {readOnly ? <p className="hint" data-testid="advance-policy-read-only">Read-only in the public demo.</p> : (
        <div className="form-actions"><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Save policy'}</button></div>
      )}
    </form>
  );
}
