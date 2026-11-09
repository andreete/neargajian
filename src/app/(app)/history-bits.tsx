import { ExternalIcon } from '@/components/icons';
import { Chip } from '@/components/status-chip';
import { getConfig } from '@/server/config';
import { displayAmount, formatDateTime, shortHash } from '@/lib/format';
import type { TestnetRunSummary } from '@/server/dashboard/queries';

/** Label for records imported from real testnet runs (db/seed/testnet-history.json). */
export function TestnetChip() {
  return <Chip tone="testnet">Testnet run</Chip>;
}

export function TxLink({ hash, label }: { hash: string | null; label?: string }) {
  if (!hash) return <span className="muted">—</span>;
  return (
    <a className="tx" href={`${getConfig().explorerTxUrl}${hash}`} target="_blank" rel="noreferrer">
      {label ?? shortHash(hash)} <ExternalIcon size={12} /><span className="sr-only">(opens NearBlocks)</span>
    </a>
  );
}

/** Operations transfers through the vault: labelled, shown apart, never in payroll totals. */
export function OperationsTransfers({ runs }: { runs: TestnetRunSummary[] }) {
  if (runs.length === 0) return null;
  return (
    <section className="card ops-card" aria-labelledby="ops-title">
      <div className="panel-title">
        <h2 id="ops-title">Operations transfers</h2>
        <span className="hint">Treasury movements through the vault. Not payroll: excluded from payroll counts and totals.</span>
      </div>
      <div className="table-wrap" role="region" aria-labelledby="ops-title" tabIndex={0}>
        <table className="data">
          <thead><tr><th scope="col">Transfer</th><th scope="col">Type</th><th scope="col" className="amount">Rows</th><th scope="col" className="amount">Amount (tUSDC)</th><th scope="col">Created (UTC)</th><th scope="col">Proof</th></tr></thead>
          <tbody>{runs.map((r) => (
            <tr key={r.id}>
              <td><div className="title">{r.title}</div><div className="sub mono">{r.id}</div></td>
              <td><span className="chips"><Chip tone="neutral">Operations transfer</Chip><TestnetChip /></span></td>
              <td className="amount">{r.rowCount}</td>
              <td className="amount">{displayAmount(r.total)}</td>
              <td className="sub when">{formatDateTime(r.createdAt)}</td>
              <td><TxLink hash={r.lastPaidTxHash ?? r.createdTxHash} label={r.lastPaidTxHash ? 'Last transfer' : 'Created'} /></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}
