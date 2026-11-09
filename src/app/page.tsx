import Link from 'next/link';
import { Logo, TestnetBadge } from '@/components/brand';
import { ApprovalMap } from '@/components/approval-map';
import { CheckIcon, ExternalIcon, FileIcon, LayersIcon, ShieldIcon, UploadIcon } from '@/components/icons';
import { LoginDialogProvider, SignInButton, type DemoAccount } from '@/components/login-dialog';
import { Chip } from '@/components/status-chip';
import { getConfig } from '@/server/config';
import { homeFor } from '@/server/auth/policy';
import { DEMO_PASSWORD } from '@/server/db/seed';
import { currentSession } from '@/server/web/page-auth';

export const dynamic = 'force-dynamic';

const DEMO_ACCOUNTS: DemoAccount[] = [
  { key: 'maker', label: 'Maker', description: 'Prepares and submits runs', email: 'maker@gajian.my.id', initials: 'MK' },
  { key: 'app1', label: 'Approver 1', description: 'Reviews first', email: 'app1@gajian.my.id', initials: 'A1' },
  { key: 'app2', label: 'Approver 2', description: 'Second reviewer', email: 'app2@gajian.my.id', initials: 'A2' },
  { key: 'admin', label: 'Admin', description: 'Sets the approval path', email: 'admin@gajian.my.id', initials: 'AD' },
];

// Live NEAR testnet evidence (docs/TESTNET.md).
const FIRST_PAYOUT_TX = '7DwmqekZtpB7u2L3JU4wEv9DoXKTdYhaQKaDXWnt5xwL';

export default async function LandingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const config = getConfig();
  const session = await currentSession();
  const params = await searchParams;
  const signinRequired = params.signin === 'required' && !session;
  const tx = (hash: string) => `${config.explorerTxUrl}${hash}`;
  const account = (id: string) => `${config.explorerAccountUrl}${id}`;

  const primaryCta = session ? (
    <Link className="btn btn-primary" href={homeFor(session.user.role)}>Open your dashboard</Link>
  ) : (
    <SignInButton>Try the demo</SignInButton>
  );

  return (
    <LoginDialogProvider
      demoAccounts={config.demoMode ? DEMO_ACCOUNTS : []}
      demoPassword={config.demoMode ? DEMO_PASSWORD : null}
      autoOpen={signinRequired}
      notice={signinRequired ? 'Please sign in to continue.' : null}
    >
      <header className="site-header">
        <div className="container">
          <Logo />
          <nav className="site-nav" aria-label="Sections">
            <a href="#how">How it works</a>
            <a href="#paths">Approval paths</a>
            <a href="#posting">Posting modes</a>
            <a href="#proof">On-chain proof</a>
          </nav>
          <div className="header-end">
            <TestnetBadge />
            {session ? (
              <Link className="btn btn-secondary btn-sm" href={homeFor(session.user.role)}>Dashboard</Link>
            ) : (
              <SignInButton className="btn btn-secondary btn-sm">Sign in</SignInButton>
            )}
          </div>
        </div>
      </header>

      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="container hero-grid">
            <div>
              <span className="eyebrow">Payroll for teams paying on NEAR</span>
              <h1 id="hero-title">Run payroll with a <span className="accent">clear approval trail.</span></h1>
              <p className="hero-lead">
                Prepare a payroll batch, route it to the right reviewers, and verify every wallet payout on NEAR testnet.
                A vault contract releases funds only after the approvals your policy requires.
              </p>
              <div className="hero-actions">
                {primaryCta}
                <a className="btn btn-secondary" href="#how">See how it works</a>
              </div>
              <ul className="hero-points">
                <li><CheckIcon size={16} />Up to 1,000 rows per run</li>
                <li><CheckIcon size={16} />One or two approvers, enforced on-chain</li>
                <li><CheckIcon size={16} />Consolidated or detailed posting</li>
              </ul>
            </div>

            <div className="run-card" aria-label="Sample payroll run (illustration with sample data)">
              <div className="float-card top" aria-hidden="true">
                <span className="icon"><CheckIcon size={16} /></span>
                <span><strong>Payout confirmed</strong><span>ft_transfer · NEAR testnet</span></span>
              </div>
              <div className="run-card-head">
                <div>
                  <div className="run-card-title">November payroll</div>
                  <div className="run-card-sub">Version 1 · Detailed posting</div>
                </div>
                <span className="sample-tag">Sample data</span>
              </div>
              <div className="run-total">56.690860<small>tUSDC</small></div>
              <div className="run-meta"><span>1,000 recipients</span><span aria-hidden="true">·</span><span>Two approvers in sequence</span></div>
              <ol className="run-steps">
                <li className="run-step">
                  <span className="avatar" aria-hidden="true">A1</span>
                  <span><span className="who">Approver 1</span><br /><span className="what">Reviewed 1,000 rows</span></span>
                  <Chip tone="success" icon={<CheckIcon size={13} />}>Approved</Chip>
                </li>
                <li className="run-step">
                  <span className="avatar alt" aria-hidden="true">A2</span>
                  <span><span className="who">Approver 2</span><br /><span className="what">Approved after step 1</span></span>
                  <Chip tone="success" icon={<CheckIcon size={13} />}>Approved</Chip>
                </li>
              </ol>
              <div className="payout-progress">
                <div className="payout-progress-label"><span>Wallet payouts</span><span className="num">1,000 / 1,000 paid</span></div>
                <progress className="bar" value={1000} max={1000} aria-label="Wallet payouts: 1,000 of 1,000 paid" />
              </div>
              <div className="float-card bottom" aria-hidden="true">
                <span className="icon"><LayersIcon size={16} /></span>
                <span><strong>1,000 posting entries</strong><span>Detailed · same total</span></span>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="section" aria-labelledby="how-title">
          <div className="container">
            <div className="section-head">
              <span className="eyebrow">How it works</span>
              <h2 id="how-title">From spreadsheet to verified payouts in three steps</h2>
              <p>Every run is an immutable version. What the approvers saw is exactly what the contract pays.</p>
            </div>
            <div className="steps-grid">
              <article className="card step-card">
                <div className="step-num" aria-hidden="true"><UploadIcon size={20} /></div>
                <h3>1. Prepare</h3>
                <p>Add rows by hand or upload a CSV or tab-delimited TXT with up to 1,000 rows. The whole file is validated before anything is accepted, in its original order.</p>
              </article>
              <article className="card step-card">
                <div className="step-num" aria-hidden="true"><ShieldIcon size={20} /></div>
                <h3>2. Approve</h3>
                <p>The run goes to one or two assigned reviewers, in sequence or in parallel. The vault contract checks each approval, so no one can skip a step or approve their own run.</p>
              </article>
              <article className="card step-card">
                <div className="step-num" aria-hidden="true"><FileIcon size={20} /></div>
                <h3>3. Pay and reconcile</h3>
                <p>After final approval the vault reserves the total and pays each wallet in tUSDC. Company reporting shows one consolidated entry or one entry per recipient, with matching totals.</p>
              </article>
            </div>
          </div>
        </section>

        <section id="paths" className="section section-alt" aria-labelledby="paths-title">
          <div className="container">
            <div className="section-head">
              <span className="eyebrow">Approval paths</span>
              <h2 id="paths-title">The policy your admin picks is the policy the contract enforces</h2>
              <p>Each run keeps the reviewers and release mode it was submitted with, even if the admin changes the settings later.</p>
            </div>
            <div className="paths-grid">
              <article className="card path-card">
                <h3>One approver</h3>
                <ApprovalMap compact kind="one" releaseMode="automatic" approvers={[{ name: 'Approver 1' }]} caption="One approver, automatic release" />
                <p>For small teams. One assigned reviewer approves, then the release worker pays automatically.</p>
              </article>
              <article className="card path-card">
                <h3>Two in sequence</h3>
                <ApprovalMap compact kind="two_sequential" releaseMode="automatic" approvers={[{ name: 'Approver 1' }, { name: 'Approver 2' }]} caption="Two approvers in sequence" />
                <p>Approver 2 can only act after Approver 1 has approved on-chain.</p>
              </article>
              <article className="card path-card">
                <h3>Two in parallel</h3>
                <ApprovalMap compact kind="two_parallel" releaseMode="maker" approvers={[{ name: 'Approver 1' }, { name: 'Approver 2' }]} caption="Two approvers in parallel, maker releases" />
                <p>Either reviewer can go first; both approvals are required. Here the maker releases the payment.</p>
              </article>
            </div>
          </div>
        </section>

        <section id="posting" className="section" aria-labelledby="posting-title">
          <div className="container">
            <div className="section-head">
              <span className="eyebrow">Posting modes</span>
              <h2 id="posting-title">Same payouts, the accounting view you need</h2>
              <p>Recipients receive exactly the same amounts either way. Only the company ledger changes: one entry per run, or one per recipient.</p>
            </div>
            <div className="posting-grid">
              <article className="card posting-card">
                <div><h3>Consolidated</h3><p className="count">1 company entry for 1,000 recipients</p></div>
                <table className="ledger">
                  <caption className="sr-only">Consolidated posting example</caption>
                  <thead><tr><th scope="col">Reference</th><th scope="col">Description</th><th scope="col" className="amount">Amount</th></tr></thead>
                  <tbody><tr><td className="mono">GJN-NOV-0001</td><td>November payroll</td><td className="amount">56.690860</td></tr></tbody>
                  <tfoot><tr><td colSpan={2}>Total (tUSDC)</td><td className="amount">56.690860</td></tr></tfoot>
                </table>
              </article>
              <article className="card posting-card">
                <div><h3>Detailed</h3><p className="count">1,000 company entries, one per recipient</p></div>
                <table className="ledger">
                  <caption className="sr-only">Detailed posting example</caption>
                  <thead><tr><th scope="col">Reference</th><th scope="col">Description</th><th scope="col" className="amount">Amount</th></tr></thead>
                  <tbody>
                    <tr><td className="mono">GJN-NOV-0001-0001</td><td>Payout line 1</td><td className="amount">0.050000</td></tr>
                    <tr><td className="mono">GJN-NOV-0001-0002</td><td>Payout line 2</td><td className="amount">0.040000</td></tr>
                    <tr className="gap"><td colSpan={3}>… 997 more lines …</td></tr>
                    <tr><td className="mono">GJN-NOV-0001-1000</td><td>Payout line 1,000</td><td className="amount">0.090000</td></tr>
                  </tbody>
                  <tfoot><tr><td colSpan={2}>Total (tUSDC)</td><td className="amount">56.690860</td></tr></tfoot>
                </table>
              </article>
            </div>
          </div>
        </section>

        <section id="proof" className="section section-alt" aria-labelledby="proof-title">
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
            {session ? <Link className="btn btn-primary" href={homeFor(session.user.role)}>Open your dashboard</Link> : <SignInButton>Try the demo</SignInButton>}
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container">
          <span>GAJIAN · NEAR testnet prototype · synthetic data, zero-value tUSDC</span>
          <span>Built for NEAR HACKATHON (Real-World Money) · MIT licence · AI-assisted</span>
        </div>
      </footer>
    </LoginDialogProvider>
  );
}
