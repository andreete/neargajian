import Link from 'next/link';
import { Logo, TestnetBadge } from '@/components/brand';
import { ApprovalMap } from '@/components/approval-map';
import {
  AlertIcon, CheckIcon, ExternalIcon, FileIcon, ShieldIcon, UploadIcon, WalletIcon,
} from '@/components/icons';
import { LoginDialogProvider, SignInButton } from '@/components/login-dialog';
import { Chip } from '@/components/status-chip';
import { getConfig } from '@/server/config';
import { homeFor } from '@/server/auth/policy';
import { DEMO_PASSWORD, demoUsers } from '@/server/db/seed';
import { samplePreview, testnetFacts } from '@/server/landing';
import { currentSession } from '@/server/web/page-auth';
import { displayAmount } from '@/lib/format';

export const dynamic = 'force-dynamic';

// Live NEAR testnet evidence (docs/TESTNET.md).
const FIRST_PAYOUT_TX = '7DwmqekZtpB7u2L3JU4wEv9DoXKTdYhaQKaDXWnt5xwL';

export default async function LandingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const config = getConfig();
  const session = await currentSession();
  const params = await searchParams;
  const signinRequired = params.signin === 'required' && !session;
  const sample = samplePreview();
  const facts = testnetFacts();
  const tx = (hash: string) => `${config.explorerTxUrl}${hash}`;
  const account = (id: string) => `${config.explorerAccountUrl}${id}`;
  const dashboard = session ? homeFor(session.user.role) : null;
  const sampleTotal = displayAmount(sample.total);

  return (
    <LoginDialogProvider
      demo={config.demoMode ? { emails: demoUsers().map((u) => u.email), password: DEMO_PASSWORD } : null}
      autoOpen={signinRequired}
      notice={signinRequired ? 'Please sign in to continue.' : null}
    >
      <header className="site-header">
        <div className="container">
          <Logo />
          <nav className="site-nav" aria-label="Sections">
            <a href="#upload">Upload</a>
            <a href="#how">How it works</a>
            <a href="#paths">Approval paths</a>
            <a href="#posting">Posting modes</a>
            <a href="#proof">On-chain proof</a>
          </nav>
          <div className="header-end">
            <TestnetBadge />
            {dashboard ? (
              <Link className="btn btn-primary btn-sm" href={dashboard}>Open dashboard</Link>
            ) : (
              <>
                <SignInButton className="btn btn-secondary btn-sm">Sign in</SignInButton>
                <SignInButton className="btn btn-primary btn-sm">Try the demo</SignInButton>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="container hero-grid">
            <div className="hero-copy">
              <span className="eyebrow">Payroll for teams paying on NEAR</span>
              <h1 id="hero-title">Run payroll with a <span className="accent">clear approval trail.</span></h1>
              <p className="hero-lead">
                Prepare a payroll batch, route it to the right reviewers, and verify every wallet payout on NEAR testnet.
                A vault contract releases funds only after the approvals your policy requires.
              </p>
              <div className="hero-actions">
                {dashboard ? <Link className="btn btn-primary btn-lg" href={dashboard}>Open your dashboard</Link> : <SignInButton className="btn btn-primary btn-lg">Try the demo</SignInButton>}
                <a className="btn btn-secondary btn-lg" href="#how">See how it works</a>
              </div>
              <ul className="hero-points">
                <li><CheckIcon size={16} />Up to 1,000 rows per run</li>
                <li><CheckIcon size={16} />One or two approvers, enforced on-chain</li>
                <li><CheckIcon size={16} />Consolidated or detailed posting</li>
              </ul>
            </div>

            <div className="run-card" data-testid="hero-card" aria-label="Sample payroll run (illustration with sample data)">
              <div className="run-card-head">
                <div>
                  <div className="run-card-title">November payroll</div>
                  <div className="run-card-sub">Version 1 · {sample.fileName}</div>
                </div>
                <span className="sample-tag">Sample data</span>
              </div>
              <div className="run-total-row">
                <div className="run-total">{sampleTotal}<small>tUSDC</small></div>
                <Chip tone="success" icon={<CheckIcon size={13} />}>Paid</Chip>
              </div>
              <div className="run-meta"><span>{sample.rowCount.toLocaleString('en-US')} recipients</span><span>Two approvers in sequence</span><span>Detailed posting</span></div>
              <div className="run-split">
                <ol className="run-steps" aria-label="Approvals">
                  <li className="run-step">
                    <span className="avatar" aria-hidden="true">A1</span>
                    <span><span className="who">Approver 1</span><br /><span className="what"><CheckIcon size={12} />Approved</span></span>
                  </li>
                  <li className="run-step">
                    <span className="avatar alt" aria-hidden="true">A2</span>
                    <span><span className="who">Approver 2</span><br /><span className="what"><CheckIcon size={12} />Approved after step 1</span></span>
                  </li>
                </ol>
                <div className="mini-ledger" aria-label="First payouts">
                  <div className="ml-head"><span>Recipient</span><span>tUSDC</span></div>
                  {sample.firstRows.slice(0, 3).map((r) => (
                    <div className="ml-row" key={r.line}><span>{r.name}</span><span className="amount">{displayAmount(r.amount)}</span></div>
                  ))}
                  <div className="ml-row"><span className="muted">+ {(sample.rowCount - 3).toLocaleString('en-US')} more</span><span /></div>
                </div>
              </div>
              <div className="payout-progress">
                <div className="payout-progress-label"><span>Wallet payouts</span><span className="num">{sample.rowCount.toLocaleString('en-US')} / {sample.rowCount.toLocaleString('en-US')} paid</span></div>
                <progress className="bar" value={sample.rowCount} max={sample.rowCount} aria-label={`Wallet payouts: ${sample.rowCount} of ${sample.rowCount} paid`} />
              </div>
              <div className="run-card-foot">
                <span><strong>1,000 posting entries</strong> · same total</span>
                <span>Released by the vault contract</span>
              </div>
            </div>
          </div>
        </section>

        <section className="proof-strip" aria-label="Verifiable facts">
          <ul className="container">
            <li><span className="icon"><WalletIcon size={18} /></span><span><strong>Live on NEAR testnet</strong><span className="sub mono">{config.vaultContractId}</span></span></li>
            <li><span className="icon"><ShieldIcon size={18} /></span><span><strong>Approvals enforced on-chain</strong><span className="sub">1, 2 in sequence or 2 in parallel</span></span></li>
            <li><span className="icon"><UploadIcon size={18} /></span><span><strong>1,000-row CSV/TXT upload</strong><span className="sub">Whole file validated first</span></span></li>
            <li><span className="icon"><CheckIcon size={18} /></span><span><strong>{facts.doublePayments} double payments</strong><span className="sub">{facts.paidRuns} testnet runs · {facts.repeatAttemptsRefused} repeats refused</span></span></li>
          </ul>
        </section>

        <section id="upload" className="section bg-white" aria-labelledby="upload-title">
          <div className="container split">
            <div>
              <div className="section-head">
                <span className="eyebrow">Upload</span>
                <h2 id="upload-title">Drop in a 1,000-row file. Nothing is accepted until every row passes.</h2>
                <p>Use our Excel template or your own CSV or tab-delimited TXT. GAJIAN checks the whole file, keeps your row order and shows every problem with its row and column.</p>
              </div>
              <ul className="check-list">
                <li><CheckIcon size={18} /><div><strong>Exact money, no rounding</strong><span>Six decimals, totals computed on the server.</span></div></li>
                <li><CheckIcon size={18} /><div><strong>Regional Excel settings handled</strong><span>Semicolon-separated files are detected; comma decimals get a clear fix-it message.</span></div></li>
                <li><CheckIcon size={18} /><div><strong>Read-only review in file order</strong><span>50 rows per page with the source row number next to every payment.</span></div></li>
              </ul>
            </div>
            <div className="upload-mock" aria-label="Upload example with the real sample file">
              <div className="dropzone">
                <span className="file-icon"><FileIcon size={22} /></span>
                <span>
                  <span className="file-name">{sample.fileName}</span><br />
                  <span className="file-meta">{(sample.sizeBytes / 1024).toFixed(1)} KB · CSV · UTF-8</span>
                </span>
                <Chip tone="success" icon={<CheckIcon size={13} />}>Validated</Chip>
              </div>
              <dl className="upload-summary">
                <div><dt>Rows</dt><dd>{sample.rowCount.toLocaleString('en-US')}</dd></div>
                <div><dt>Exact total</dt><dd>{sampleTotal}</dd></div>
                <div><dt>Currency</dt><dd>tUSDC</dd></div>
                <div><dt>Errors</dt><dd>0</dd></div>
              </dl>
              <div className="card">
                <div className="table-wrap">
                  <table className="review-table">
                    <caption className="sr-only">First rows of the review table, in file order</caption>
                    <thead><tr><th scope="col">File row</th><th scope="col">NEAR account</th><th scope="col">Receiver</th><th scope="col" className="amount">Amount</th></tr></thead>
                    <tbody>
                      {sample.firstRows.map((r) => (
                        <tr key={r.line}><td className="rownum">{r.line}</td><td className="mono">{r.account}</td><td>{r.name}</td><td className="amount">{displayAmount(r.amount)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="review-foot"><span>Rows 1–5 of {sample.rowCount.toLocaleString('en-US')} · source row numbers from the file</span><span>Page 1 of {Math.ceil(sample.rowCount / 50)}</span></div>
              </div>
              <div className="error-example" role="note">
                <AlertIcon size={18} />
                <span><strong>Rejected file example</strong>Row 61: invalid NEAR account ID. Fix the file and upload it again.</span>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="section bg-canvas" aria-labelledby="how-title">
          <div className="container">
            <div className="section-head center">
              <span className="eyebrow">How it works</span>
              <h2 id="how-title">From spreadsheet to verified payouts</h2>
              <p>Every run is an immutable version. What the approvers saw is exactly what the contract pays.</p>
            </div>
            <ol className="timeline">
              <li><div className="num" aria-hidden="true">1</div><h3>Prepare</h3><p>Add rows by hand or upload up to 1,000 rows. Fix problems in the file, upload again, and the earlier version stays until a new one passes.</p></li>
              <li><div className="num" aria-hidden="true">2</div><h3>Approve</h3><p>The run goes to one or two assigned reviewers, in sequence or in parallel. The vault contract checks every approval, so no one can skip a step or approve their own run.</p></li>
              <li><div className="num" aria-hidden="true">3</div><h3>Pay and reconcile</h3><p>The vault reserves the total and pays each wallet in tUSDC. Reports show one consolidated entry or one entry per recipient, with matching totals.</p></li>
            </ol>
          </div>
        </section>

        <section id="paths" className="section bg-white" aria-labelledby="paths-title">
          <div className="container">
            <div className="section-head">
              <span className="eyebrow">Approval paths</span>
              <h2 id="paths-title">The policy your admin picks is the policy the contract enforces</h2>
              <p>Each run keeps the reviewers and release mode it was submitted with, even if the admin changes the settings later.</p>
            </div>
            <div className="path-rows">
              <article className="card path-row">
                <div><h3>One approver</h3><p>For small teams. One reviewer approves, then the release worker pays automatically.</p></div>
                <ApprovalMap kind="one" releaseMode="automatic" approvers={[{ name: 'Approver 1' }]} caption="One approver, automatic release" />
              </article>
              <article className="card path-row">
                <div><h3>Two in sequence</h3><p>Approver 2 can only act after Approver 1 has approved on-chain.</p></div>
                <ApprovalMap kind="two_sequential" releaseMode="automatic" approvers={[{ name: 'Approver 1' }, { name: 'Approver 2' }]} caption="Two approvers in sequence, automatic release" />
              </article>
              <article className="card path-row">
                <div><h3>Two in parallel</h3><p>Either reviewer can go first; both approvals are required. Here the maker releases the payment.</p></div>
                <ApprovalMap kind="two_parallel" releaseMode="maker" approvers={[{ name: 'Approver 1' }, { name: 'Approver 2' }]} caption="Two approvers in parallel, maker releases" />
              </article>
            </div>
          </div>
        </section>

        <section id="posting" className="section bg-sky" aria-labelledby="posting-title">
          <div className="container">
            <div className="section-head center">
              <span className="eyebrow">Posting modes</span>
              <h2 id="posting-title">Same payouts, the accounting view you need</h2>
              <p>Recipients receive exactly the same amounts either way. Only the company ledger changes: one entry per run, or one per recipient.</p>
            </div>
            <div className="posting-grid">
              <article className="card posting-card">
                <div><h3>Consolidated</h3><p className="count">1 company entry for {sample.rowCount.toLocaleString('en-US')} recipients</p></div>
                <table className="ledger">
                  <caption className="sr-only">Consolidated posting example</caption>
                  <thead><tr><th scope="col">Reference</th><th scope="col">Description</th><th scope="col" className="amount">tUSDC</th></tr></thead>
                  <tbody><tr><td className="mono">GJN-NOV-0001</td><td>November payroll</td><td className="amount">{sampleTotal}</td></tr></tbody>
                  <tfoot><tr><td colSpan={2}>Total</td><td className="amount">{sampleTotal}</td></tr></tfoot>
                </table>
              </article>
              <article className="card posting-card">
                <div><h3>Detailed</h3><p className="count">{sample.rowCount.toLocaleString('en-US')} company entries, one per recipient</p></div>
                <table className="ledger">
                  <caption className="sr-only">Detailed posting example</caption>
                  <thead><tr><th scope="col">Reference</th><th scope="col">Description</th><th scope="col" className="amount">tUSDC</th></tr></thead>
                  <tbody>
                    {sample.firstRows.slice(0, 2).map((r, i) => (
                      <tr key={r.line}><td className="mono">GJN-NOV-0001-{String(i + 1).padStart(4, '0')}</td><td>Payout line {i + 1}</td><td className="amount">{displayAmount(r.amount)}</td></tr>
                    ))}
                    <tr className="gap"><td colSpan={3}>… {(sample.rowCount - 2).toLocaleString('en-US')} more lines …</td></tr>
                  </tbody>
                  <tfoot><tr><td colSpan={2}>Total</td><td className="amount">{sampleTotal}</td></tr></tfoot>
                </table>
              </article>
            </div>
          </div>
        </section>

        <section id="proof" className="section bg-white" aria-labelledby="proof-title">
          <div className="container proof-grid">
            <div>
              <div className="section-head">
                <span className="eyebrow">On-chain proof</span>
                <h2 id="proof-title">Check every payout yourself on NEAR testnet</h2>
                <p>The vault and the tUSDC test token are live contracts. Every approval and payout is a public testnet transaction.</p>
              </div>
              <ul className="proof-list">
                <li><span className="label">Vault contract</span><a className="mono" href={account(config.vaultContractId)} target="_blank" rel="noreferrer">{config.vaultContractId} <ExternalIcon size={13} /><span className="sr-only">(opens NearBlocks)</span></a></li>
                <li><span className="label">tUSDC token (6 decimals)</span><a className="mono" href={account(config.tokenContractId)} target="_blank" rel="noreferrer">{config.tokenContractId} <ExternalIcon size={13} /><span className="sr-only">(opens NearBlocks)</span></a></li>
                <li><span className="label">First contract-controlled payout</span><a className="mono" href={tx(FIRST_PAYOUT_TX)} target="_blank" rel="noreferrer">{FIRST_PAYOUT_TX.slice(0, 10)}… <ExternalIcon size={13} /><span className="sr-only">(opens NearBlocks)</span></a></li>
                <li><span className="label">Testnet payouts so far</span><span className="num">{facts.payouts} in {facts.paidRuns} runs, {facts.doublePayments} paid twice</span></li>
              </ul>
            </div>
            <aside className="trust-note" aria-labelledby="trust-title">
              <h3 id="trust-title">Prototype trust model</h3>
              <p>This demo runs on NEAR testnet with synthetic data and a zero-value token. The server signs on behalf of demo users with restricted, function-call-only testnet keys that can only call their role&apos;s vault methods.</p>
              <p>The vault contract still checks who signed every approval and release. A production version would use user-held wallets or a multisig or MPC signer instead of server-held keys.</p>
            </aside>
          </div>
        </section>

        <section className="cta-band" aria-labelledby="cta-title">
          <div className="container">
            <div>
              <h2 id="cta-title">See a payroll run end to end</h2>
              <p>Sign in as the maker, an approver or the admin. Demo data only.</p>
            </div>
            {dashboard ? <Link className="btn btn-primary btn-lg" href={dashboard}>Open your dashboard</Link> : <SignInButton className="btn btn-primary btn-lg">Try the demo</SignInButton>}
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container">
          <span>GAJIAN · NEAR testnet prototype · synthetic data, zero-value tUSDC · times in UTC</span>
          <span>Built for NEAR HACKATHON (Real-World Money) · MIT licence · AI-assisted</span>
        </div>
      </footer>
    </LoginDialogProvider>
  );
}
