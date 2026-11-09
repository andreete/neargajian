import type { Metadata } from 'next';
import Link from 'next/link';
import { RecipientDirectory, RecipientImport, RegisteredOnlySwitch } from '@/components/recipient-directory';
import { getDb } from '@/server/db/client';
import { formatAmount } from '@/server/money';
import { activeLimits } from '@/server/runs/draft-service';
import { describeChanges, directoryStats, divisions, listRecipients, recentDirectoryEvents, registeredOnly } from '@/server/recipients/directory';
import { READINESS_LABEL } from '@/server/recipients/readiness';
import { requireRole } from '@/server/web/page-auth';
import { hostedMode, HOSTED_DIRECTORY_MESSAGE } from '@/server/hosted';
import { InfoIcon } from '@/components/icons';
import { displayAmount, formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Recipients' };

const ACTION_TEXT = { created: 'Added', updated: 'Edited', deactivated: 'Deactivated', reactivated: 'Reactivated', readiness_checked: 'Testnet check' } as const;
const SOURCE_TEXT: Record<string, string> = { form: '', import: ' (import)', seed: ' (demo seed)', check: '' };

export default async function RecipientsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireRole(['admin']);
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '');
  const db = getDb();
  const status = one('status') === 'active' || one('status') === 'inactive' ? (one('status') as 'active' | 'inactive') : 'all';
  const q = one('q').slice(0, 100);
  const division = one('division').slice(0, 40);
  const list = listRecipients(db, { q, division, status, page: Number(one('page')) || 1 });
  const stats = directoryStats(db);
  const divs = divisions(db);
  const events = recentDirectoryEvents(db, 12);
  const cap = activeLimits(db).maxRowAmount;
  const on = registeredOnly(db);
  const readOnly = hostedMode().demo;
  const href = (page: number) => `/admin/recipients?${new URLSearchParams({ ...(q ? { q } : {}), ...(division ? { division } : {}), ...(status !== 'all' ? { status } : {}), page: String(page) })}`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Recipients</h1>
          <p>Who can be paid, by division, with a maximum per payout. Recipients are deactivated, never deleted, so past runs stay readable.</p>
        </div>
      </div>

      {readOnly ? <div className="callout" role="note" data-testid="hosted-directory-note"><InfoIcon size={18} /><span>{HOSTED_DIRECTORY_MESSAGE} In the public demo a run can only be submitted when every recipient is &ldquo;Ready to receive tUSDC&rdquo;.</span></div> : null}
      <RegisteredOnlySwitch on={on} csrfToken={session.csrfToken} readOnly={readOnly} />
      <div className="section-gap sm" />

      <div className="stats">
        <div className="card stat"><div className="label">Active recipients</div><div className="value">{stats.active.toLocaleString('en-US')}</div><div className="foot">{stats.inactive} inactive · {stats.samples.toLocaleString('en-US')} sample employees</div></div>
        <div className="card stat"><div className="label">Divisions</div><div className="value">{divs.length}</div><div className="foot">{divs.map((d) => d.name).join(', ') || '—'}</div></div>
        <div className="card stat"><div className="label">Ready to receive tUSDC</div><div className="value">{stats.ready}</div><div className="foot">active accounts checked on testnet</div></div>
        <div className="card stat"><div className="label">Max per payout</div><div className="value amount">{displayAmount(cap)}<small>tUSDC</small></div><div className="foot">workflow per-row cap (upper limit)</div></div>
      </div>

      <form className="card toolbar filter-bar" method="get" action="/admin/recipients" role="search" aria-label="Filter recipients">
        <div className="field inline"><label htmlFor="f-q">Search</label><input id="f-q" name="q" defaultValue={q} placeholder="Name, NEAR account or email" /></div>
        <div className="field inline"><label htmlFor="f-division">Division</label>
          <select id="f-division" name="division" defaultValue={division}><option value="">All divisions</option>{divs.map((d) => <option key={d.name} value={d.name}>{d.name} ({d.active})</option>)}</select>
        </div>
        <div className="field inline"><label htmlFor="f-status">Status</label>
          <select id="f-status" name="status" defaultValue={status}><option value="all">All</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
        </div>
        <button type="submit" className="btn btn-secondary btn-sm">Apply</button>
        {q || division || status !== 'all' ? <Link className="btn btn-ghost btn-sm" href="/admin/recipients">Clear</Link> : null}
        <span className="hint push-right">{list.total.toLocaleString('en-US')} recipient{list.total === 1 ? '' : 's'}</span>
      </form>

      <RecipientDirectory csrfToken={session.csrfToken} divisions={divs.map((d) => d.name)} cap={displayAmount(cap)} readOnly={readOnly}
        rows={list.rows.map((r) => ({
          id: r.id, nearAccountId: r.nearAccountId, name: r.name, division: r.division, email: r.email, mobilePhone: r.mobilePhone,
          maxAmount: formatAmount(r.maxAmount), maxDisplay: displayAmount(r.maxAmount), active: r.active, sample: r.sample,
          readiness: r.readiness, readinessLabel: READINESS_LABEL[r.readiness], readinessCheckedAt: r.readinessCheckedAt?.toISOString() ?? null, updatedAt: r.updatedAt.getTime(),
        }))} />
      {list.pages > 1 ? (
        <nav className="pager pager-bar card toolbar" aria-label="Recipient pages">
          <span className="hint">Page {list.page} of {list.pages}</span>
          <Link className="btn btn-secondary btn-sm" href={href(list.page - 1)} aria-disabled={list.page <= 1 ? 'true' : undefined}>Previous</Link>
          <Link className="btn btn-secondary btn-sm" href={href(list.page + 1)} aria-disabled={list.page >= list.pages ? 'true' : undefined}>Next</Link>
        </nav>
      ) : null}

      <div className="grid-even">
        {readOnly ? <section className="card card-pad" aria-label="Bulk import"><h2 className="panel-h">Bulk import</h2><p className="hint">Not available in the public demo.</p></section> : <RecipientImport csrfToken={session.csrfToken} />}
        <section className="card" aria-labelledby="changes-title">
          <div className="panel-title"><h2 id="changes-title">Change log</h2><span className="hint">latest {events.length}</span></div>
          {events.length === 0 ? <div className="empty"><h3>No changes yet</h3></div> : (
            <ul className="change-log">
              {events.map((e, i) => (
                <li key={i}>
                  <div className="when">{formatDateTime(e.at)} · {e.actor}{SOURCE_TEXT[e.source] ?? ''}</div>
                  <div><strong>{ACTION_TEXT[e.action]}</strong> {e.recipient} <span className="mono sub">{e.account}</span></div>
                  {e.action === 'updated' || e.action === 'readiness_checked' ? <div className="sub">{describeChanges(e.changes)}</div> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
