/** Display formatting shared by server and client components (no Node APIs). */
import { formatAmount, formatAmountShort } from '../server/money.ts';

const UTC = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
});

/** All times are shown in UTC with the label. */
export function formatDateTime(d: Date): string {
  return `${UTC.format(d)} UTC`;
}

/** Display amount: exact, trailing zeros removed down to 2 decimals ("0.15", "1.00", "0.000001"). */
export function displayAmount(units: bigint): string {
  const [whole = '0', frac = ''] = formatAmountShort(units).split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${frac}`;
}

export function formatTusdc(units: bigint): string {
  return `${displayAmount(units)} tUSDC`;
}

/** Fixed six decimals: CSV exports and base-unit / on-chain views. */
export function fixedAmount(units: bigint): string {
  return formatAmount(units);
}

export function shortHash(hash: string, keep = 8): string {
  return hash.length > keep + 2 ? `${hash.slice(0, keep)}…` : hash;
}
