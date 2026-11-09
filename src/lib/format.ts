/** Display formatting shared by server and client components (no Node APIs). */
import { formatAmount } from '../server/money.ts';

const WIB = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
});

export function formatDateTime(d: Date): string {
  return `${WIB.format(d)} WIB`;
}

export function formatTusdc(units: bigint): string {
  return `${formatAmount(units)} tUSDC`;
}

export function shortHash(hash: string, keep = 8): string {
  return hash.length > keep + 2 ? `${hash.slice(0, keep)}…` : hash;
}
