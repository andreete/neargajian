import type { Metadata } from 'next';
import Link from 'next/link';
import { BulkIdentityCheck, CheckResult, IdentityOnlySwitch, IdentityTable, SpecimenDemo, STATUS_TEXT, type CheckView } from '@/components/identity-checks';
import { InfoIcon, ShieldIcon } from '@/components/icons';
import { getDb } from '@/server/db/client';
import { IDENTITY_STATUSES, type IdentityStatus } from '@/server/db/schema';
import { hostedMode } from '@/server/hosted';
import { identityEngineStatus } from '@/server/identity/deps';
import { HOSTED_IDENTITY_MESSAGE } from '@/server/identity/http';
import { identityStats, identityVerifiedOnly, latestChecks, type IdentityCheckView } from '@/server/identity/service';
import { divisions, listRecipients } from '@/server/recipients/directory';
import { requireRole } from '@/server/web/page-auth';
import { getConfig } from '@/server/config';
import { templateRecipients } from '@/server/identity/face-template';
import { formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Identity checks' };

const toView = (c: IdentityCheckView): CheckView => ({ ...c, at: c.at.toISOString() });
const OUTCOME_SHORT = { verified: 'Verified', needs_review: 'Needs review', failed: 'Failed' } as const;
const SOURCE_SHORT = { upload: 'upload', specimen: 'specimen', seed: 'demo seed', manual_review: 'manual review' } as const;

export default async function IdentityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireRole(['admin']);
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '');
  const db = getDb();
  const identity = (IDENTITY_STATUSES as readonly string[]).includes(one('identity')) ? (one('identity') as IdentityStatus) : undefined;
  const q = one('q').slice(0, 100);
  const division = one('division').slice(0, 40);
  const list = listRecipients(db, { q, division, status: 'active', ...(identity ? { identity } : {}), page: Number(one('page')) || 1 });
  const stats = identityStats(db);
  const divs = divisions(db);
  const checks = latestChecks(db, 12);
  const engine = identityEngineStatus();
  const hosted = hostedMode().demo;
  // Phase 24: encrypted face templates (count only; never decrypted on this page).
  const templates = templateRecipients(db);
  const faceKeyOn = getConfig().faceTemplatesEnabled;
  const on = identityVerifiedOnly(db);
  const disabled = !engine.face
    ? 'The face engine is off on this copy: the model files are missing (npm run vision:models).'
    : !engine.reader ? 'The KTP reader is off on this copy (no ANTHROPIC_API_KEY), so checks cannot run here. Everything else works.' : null;
  const href = (page: number) => `/admin/identity?${new URLSearchParams({ ...(q ? { q } : {}), ...(division ? { division } : {}), ...(identity ? { identity } : {}), page: String(page) })}`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Identity checks</h1>
          <p>Check that each employee&apos;s KTP is theirs: the card is read, the NIK is checked against the card, and the face on the KTP is compared with the employee&apos;s face photo.</p>
        </div>
      </div>

      {hosted ? <div className="callout" role="note" data-testid="hosted-identity-note"><InfoIcon size={18} /><span>{HOSTED_IDENTITY_MESSAGE}</span></div> : null}
      <IdentityOnlySwitch on={on} csrfToken={session.csrfToken} readOnly={hosted} />
      <div className="section-gap sm" />

      <div className="stats">
        <div className="card stat"><div className="label">Verified</div><div className="value">{stats.verified.toLocaleString('en-US')}</div><div className="foot">of {stats.total.toLocaleString('en-US')} active recipients</div></div>
        <div className="card stat"><div className="label">Needs review</div><div className="value">{stats.needs_review}</div><div className="foot">an admin decides, with a reason</div></div>
        <div className="card stat"><div className="label">Failed</div><div className="value">{stats.failed}</div><div className="foot">not payable while the setting is on</div></div>
        <div className="card stat"><div className="label">Not checked</div><div className="value">{stats.unverified.toLocaleString('en-US')}</div><div className="foot">incl. the sample employees</div></div>
      </div>

      <section className="card card-pad how-it-works" aria-labelledby="how-h">
        <h2 id="how-h" className="panel-h"><ShieldIcon size={18} /> How the check works</h2>
        <ol className="how-list">
          <li><strong>Read the KTP.</strong> Every face on the card is covered on this server first; then the card text goes to the KTP reader ({engine.reader ? (engine.reader.stub ? 'test stub reader' : `Claude vision, ${engine.reader.id}`) : 'off on this copy'}), which returns the NIK, name, date of birth and sex, and flags visible problems (a specimen, a screen photo, a photocopy, edited text).</li>
          <li><strong>Check the NIK offline.</strong> 16 digits, a real province code, a valid date of birth (women: day + 40) that matches the card, the sex that matches the card, and no other employee verified with the same NIK.</li>
          <li><strong>Match the name</strong> on the card with the directory.</li>
          <li><strong>Compare the faces on this server</strong> ({engine.face ?? 'off on this copy'}): the KTP photo and the employee&apos;s face photo; the same person scores 0.363 or higher (OpenCV&apos;s threshold for SFace).</li>
          <li><strong>Decide.</strong> Every check passes → Verified. Something unclear → Needs review (you decide, with a reason). Anything wrong → Failed.</li>
          <li><strong>Keep a face template for the Payroll Advance face check.</strong> When the check is Verified, SentFund keeps one <em>face template</em> for that employee: the 128 numbers SFace computes from the verified face photo, encrypted (AES-256-GCM) with this server&apos;s key{faceKeyOn ? '' : ' (off on this copy: FACE_TEMPLATE_KEY is not set)'}. Never the photo. It is used only to confirm that employee&apos;s own Payroll Advance requests with a live camera check, and deleted when the employee is deactivated or the check is reset (marked failed, or a new check that does not verify). Every creation and deletion is logged. Templates on file: <strong data-testid="face-template-count">{templates.size.toLocaleString('en-US')}</strong>.</li>
        </ol>
        <p className="hint"><strong>Privacy:</strong> the images are processed in memory and discarded. SentFund keeps the results, the NIK masked (first and last four digits) and a keyed hash of it to spot duplicates, and for a verified employee the encrypted face template described above; never the NIK, the KTP or the face photo. Face images never leave this server. <strong>Limits:</strong> this is not a Dukcapil (government registry) check, which needs an official partnership, and the KTP check itself is not liveness detection; a printed photo of the right person can pass the face match. The Payroll Advance camera check adds a head turn in a random order, which stops photos and replayed videos, but it is not certified liveness detection either.</p>
      </section>
      <div className="section-gap sm" />

      <div className="grid-even">
        <SpecimenDemo csrfToken={session.csrfToken} disabled={disabled} dryRun={hosted} />
        {hosted ? <section className="card card-pad" aria-label="Check many employees"><h2 className="panel-h">Check many employees</h2><p className="hint">Not available in the public demo.</p></section> : <BulkIdentityCheck csrfToken={session.csrfToken} disabled={disabled} />}
      </div>

      <form className="card toolbar filter-bar" method="get" action="/admin/identity" role="search" aria-label="Filter recipients">
        <div className="field inline"><label htmlFor="i-q">Search</label><input id="i-q" name="q" defaultValue={q} placeholder="Name, NEAR account or email" /></div>
        <div className="field inline"><label htmlFor="i-division">Division</label>
          <select id="i-division" name="division" defaultValue={division}><option value="">All divisions</option>{divs.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}</select>
        </div>
        <div className="field inline"><label htmlFor="i-status">Identity</label>
          <select id="i-status" name="identity" defaultValue={identity ?? ''}><option value="">All</option>{IDENTITY_STATUSES.map((s) => <option key={s} value={s}>{STATUS_TEXT[s]}</option>)}</select>
        </div>
        <button type="submit" className="btn btn-secondary btn-sm">Apply</button>
        {q || division || identity ? <Link className="btn btn-ghost btn-sm" href="/admin/identity">Clear</Link> : null}
        <span className="hint push-right">{list.total.toLocaleString('en-US')} active recipient{list.total === 1 ? '' : 's'}</span>
      </form>

      <IdentityTable csrfToken={session.csrfToken} disabled={disabled} readOnly={hosted}
        rows={list.rows.map((r) => ({ id: r.id, name: r.name, account: r.nearAccountId, division: r.division, sample: r.sample, status: r.identityStatus, checkedAt: r.identityCheckedAt?.toISOString() ?? null, nikMasked: r.nikMasked }))} />
      {list.pages > 1 ? (
        <nav className="pager pager-bar card toolbar" aria-label="Recipient pages">
          <span className="hint">Page {list.page} of {list.pages}</span>
          <Link className="btn btn-secondary btn-sm" href={href(list.page - 1)} aria-disabled={list.page <= 1 ? 'true' : undefined}>Previous</Link>
          <Link className="btn btn-secondary btn-sm" href={href(list.page + 1)} aria-disabled={list.page >= list.pages ? 'true' : undefined}>Next</Link>
        </nav>
      ) : null}

      <section className="card" aria-labelledby="idlog-h">
        <div className="panel-title"><h2 id="idlog-h">Check log</h2><span className="hint">latest {checks.length}; append-only</span></div>
        {checks.length === 0 ? <div className="empty"><h3>No checks yet</h3></div> : (
          <ul className="change-log" data-testid="identity-log">
            {checks.map((c) => (
              <li key={c.id}>
                <div className="when">{formatDateTime(c.at)} · {c.actor} · {SOURCE_SHORT[c.source]}{c.dryRun ? ' · dry run' : ''}</div>
                <div><strong>{OUTCOME_SHORT[c.outcome]}</strong> {c.recipientName} <span className="mono sub">{c.account}</span>{c.faceScore !== null ? <span className="sub"> · face {c.faceScore.toFixed(3)}</span> : null}{c.nikMasked ? <span className="sub mono"> · {c.nikMasked}</span> : null}</div>
                {c.note ? <div className="sub">{c.note}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      {checks[0] && checks[0].source !== 'seed' ? <details className="card card-pad"><summary>Latest check in detail</summary><CheckResult check={toView(checks[0])} /></details> : null}
    </>
  );
}
