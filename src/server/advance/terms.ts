/**
 * Payroll Advance money rules (Phase 23). Pure functions on integer base units (6 decimals), no
 * database: shared by the server (the authority) and the employee's browser preview.
 *
 * - Fee = feeBps/10,000 of the advance A, rounded half up to 6 decimals; taken at payout, so the
 *   employee receives A − fee (the one-row run committed on-chain). The fee is never repaid.
 * - Repayment: A in n equal monthly instalments, each A ÷ n rounded DOWN; the last instalment
 *   absorbs the rounding, so the n instalments add up to exactly A.
 * - A payroll row deducts the instalments due (including missed ones) but never more than 50% of
 *   that row's gross pay and never so much that the row reaches zero; the rest carries over.
 */

export const MIN_ADVANCE = 10_000n; // 0.01 tUSDC
/** Public demo: an advance never exceeds 0.30 tUSDC, so the vault cannot be drained. */
export const HOSTED_ADVANCE_CAP = 300_000n;
export const DEDUCTION_SHARE_BPS = 5_000n; // at most 50% of a row's gross pay
export const CONSENT_TEXT = (n: number) => `I agree to these ${n} salary deductions`;

export interface AdvancePolicy {
  enabled: boolean;
  /** Maximum advance as a percentage of the monthly net pay (300 = 300%). */
  maxPercent: number;
  /** Fee in basis points of the advance (200 = 2%). */
  feeBps: number;
  /** Number of equal monthly instalments. */
  instalments: number;
  /** Minimum days since the start date. */
  minDays: number;
}

export const DEFAULT_POLICY: AdvancePolicy = { enabled: true, maxPercent: 300, feeBps: 200, instalments: 6, minDays: 90 };
export const POLICY_LIMITS = { maxPercent: [10, 300], feeBps: [0, 1000], instalments: [1, 12], minDays: [0, 730] } as const;

export function feeFor(amount: bigint, feeBps: number): bigint {
  if (amount < 0n) throw new RangeError('amount must be non-negative');
  return (amount * BigInt(feeBps) + 5_000n) / 10_000n;
}

export interface Schedule { regular: bigint; last: bigint; amounts: bigint[] }

export function scheduleFor(amount: bigint, count: number): Schedule {
  if (!Number.isInteger(count) || count < 1) throw new RangeError('count must be a positive integer');
  const regular = amount / BigInt(count);
  const last = amount - regular * BigInt(count - 1);
  return { regular, last, amounts: Array.from({ length: count }, (_, i) => (i === count - 1 ? last : regular)) };
}

export interface Terms { amount: bigint; fee: bigint; net: bigint; schedule: Schedule }

export function termsFor(amount: bigint, policy: Pick<AdvancePolicy, 'feeBps' | 'instalments'>): Terms {
  const fee = feeFor(amount, policy.feeBps);
  return { amount, fee, net: amount - fee, schedule: scheduleFor(amount, policy.instalments) };
}

/** The largest advance: policy share of the monthly net pay, capped by the recipient's and the workflow's per-payout caps. */
export function maxAdvanceFor(input: { monthlyNetPay: bigint; maxPercent: number; recipientMax: bigint; perRowCap: bigint; hosted?: boolean }): bigint {
  const share = (input.monthlyNetPay * BigInt(input.maxPercent)) / 100n;
  let max = share;
  for (const cap of [input.recipientMax, input.perRowCap, ...(input.hosted ? [HOSTED_ADVANCE_CAP] : [])]) if (cap < max) max = cap;
  return max < 0n ? 0n : max;
}

// ---------------------------------------------------------------- months (UTC)

/** "2026-11" for a date (UTC). */
export function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number) as [number, number];
  const total = y * 12 + (m - 1) + n;
  return `${String(Math.floor(total / 12)).padStart(4, '0')}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Whole months from a to b (b − a); negative when b is earlier. */
export function monthsBetween(a: string, b: string): number {
  const [ya, ma] = a.split('-').map(Number) as [number, number];
  const [yb, mb] = b.split('-').map(Number) as [number, number];
  return (yb * 12 + mb) - (ya * 12 + ma);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "November 2026". */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number) as [number, number];
  return `${MONTHS[m - 1]} ${y}`;
}

export function monthsFrom(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(start, i));
}

// ---------------------------------------------------------------- deduction rule

export interface DeductionInput {
  /** The advance's instalment amounts (n items, summing to A). */
  schedule: bigint[];
  /** Month of the first payroll that carried (or carries) an instalment; null = this one is the first. */
  firstMonth: string | null;
  /** Month of the payroll being prepared. */
  month: string;
  /** Instalments already deducted by live or paid payroll rows. */
  alreadyDeducted: bigint;
  /** A live or paid payroll of this month already carries an instalment. */
  monthAlreadyDeducted: boolean;
  /** The row's gross pay. */
  gross: bigint;
}

export interface Deduction { due: bigint; instalment: bigint; net: bigint; carried: bigint }

/**
 * The instalment a payroll row carries: what is due by this month (missed ones included) minus
 * what was already deducted, at most 50% of the gross, never leaving the row at zero. Nothing in a
 * month that already deducted. `carried` is what stays due for the next month.
 */
export function deductionFor(input: DeductionInput): Deduction {
  const total = input.schedule.reduce((s, x) => s + x, 0n);
  const outstanding = total - input.alreadyDeducted;
  if (input.monthAlreadyDeducted || outstanding <= 0n || input.gross <= 0n) return { due: 0n, instalment: 0n, net: input.gross, carried: 0n };
  const first = input.firstMonth ?? input.month;
  const elapsed = monthsBetween(first, input.month);
  if (elapsed < 0) return { due: 0n, instalment: 0n, net: input.gross, carried: 0n };
  const dueCount = Math.min(input.schedule.length, elapsed + 1);
  const dueTotal = input.schedule.slice(0, dueCount).reduce((s, x) => s + x, 0n);
  const due = dueTotal - input.alreadyDeducted;
  if (due <= 0n) return { due: 0n, instalment: 0n, net: input.gross, carried: 0n };
  const half = (input.gross * DEDUCTION_SHARE_BPS) / 10_000n;
  const belowGross = input.gross - 1n;
  let instalment = due;
  if (half < instalment) instalment = half;
  if (belowGross < instalment) instalment = belowGross;
  if (instalment < 0n) instalment = 0n;
  return { due, instalment, net: input.gross - instalment, carried: due - instalment };
}
