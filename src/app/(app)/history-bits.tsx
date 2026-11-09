import { ExternalIcon } from '@/components/icons';
import { Chip } from '@/components/status-chip';
import { getConfig } from '@/server/config';
import { shortHash } from '@/lib/format';

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
