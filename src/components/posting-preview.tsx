/**
 * Company posting preview (design system): the same payouts as one consolidated entry or
 * one entry per recipient, with the posting count and the actual recipient count visible.
 */
import { displayAmount } from '@/lib/format';

export function PostingPreview({ mode, title, rowCount, total, firstAmounts }: {
  mode: 'consolidated' | 'detailed'; title: string; rowCount: number; total: bigint; firstAmounts: bigint[];
}) {
  const entries = mode === 'consolidated' ? (rowCount > 0 ? 1 : 0) : rowCount;
  const shown = firstAmounts.slice(0, 3);
  return (
    <section className="card posting-card" aria-labelledby={`posting-${mode}`} data-testid={`posting-preview-${mode}`}>
      <div>
        <h3 id={`posting-${mode}`}>{mode === 'consolidated' ? 'Consolidated posting' : 'Detailed posting'}</h3>
        <p className="count">{entries.toLocaleString('en-US')} company {entries === 1 ? 'entry' : 'entries'} for {rowCount.toLocaleString('en-US')} recipient{rowCount === 1 ? '' : 's'}</p>
      </div>
      <table className="ledger">
        <caption className="sr-only">{mode} posting preview</caption>
        <thead><tr><th scope="col">Entry</th><th scope="col">Description</th><th scope="col" className="amount">tUSDC</th></tr></thead>
        <tbody>
          {rowCount === 0 ? <tr className="gap"><td colSpan={3}>No valid rows yet</td></tr> : mode === 'consolidated' ? (
            <tr><td className="mono">1</td><td>{title}</td><td className="amount">{displayAmount(total)}</td></tr>
          ) : (
            <>
              {shown.map((a, i) => <tr key={i}><td className="mono">{i + 1}</td><td>Payout line {i + 1}</td><td className="amount">{displayAmount(a)}</td></tr>)}
              {rowCount > shown.length ? <tr className="gap"><td colSpan={3}>… {(rowCount - shown.length).toLocaleString('en-US')} more lines …</td></tr> : null}
            </>
          )}
        </tbody>
        <tfoot><tr><td colSpan={2}>Total</td><td className="amount">{displayAmount(total)}</td></tr></tfoot>
      </table>
      <p className="hint">Recipients receive the same amounts in both modes; only the company ledger differs. Opaque references are assigned when the run is paid.</p>
    </section>
  );
}
