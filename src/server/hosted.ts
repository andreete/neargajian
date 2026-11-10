/**
 * Hosted demo mode (Phase 20), read from the environment on every call (no cache, so tests and
 * a redeploy with new variables both see the current value).
 * - HOSTED_DEMO=true: the public demo at sentfund.my.id. Anyone can sign in with the public demo
 *   passwords, so: banner on every page; no admin key (workflow read-only); the recipient
 *   directory read-only; a run can be submitted only when every recipient is in the directory and
 *   "Ready to receive tUSDC"; the payroll assistant has a global daily cap.
 * - HOSTED_READONLY=true: kill switch. Every mutation except sign-in and sign-out is refused, the
 *   release worker pauses, and a banner says so.
 */
export type Env = Readonly<Record<string, string | undefined>>;

export interface HostedMode { demo: boolean; readOnly: boolean }

export function hostedMode(env: Env = process.env): HostedMode {
  return { demo: env.HOSTED_DEMO === 'true', readOnly: env.HOSTED_READONLY === 'true' };
}

/** The payroll assistant's global cap in hosted mode (all makers together, rolling 24 hours). */
export const HOSTED_ASSISTANT_DAILY_CAP = 200;

export const READ_ONLY_MESSAGE = 'The hosted demo is read-only right now (paused by the SentFund team). Nothing was changed. You can still sign in and look around.';
export const HOSTED_DIRECTORY_MESSAGE = 'The recipient directory is read-only in the public demo, so nobody can add payees. Run SentFund locally (README) to manage the directory.';

/**
 * The hosted copy must never hold the admin key (workflow changes, recovery). Refuse to start
 * with one, so a pasted wrong variable cannot widen what the public demo can do.
 */
export function assertHostedKeys(env: Env = process.env): void {
  if (hostedMode(env).demo && (env.ADMIN_SIGNER_PRIVATE_KEY ?? '').trim()) {
    throw new Error('HOSTED_DEMO=true must not have ADMIN_SIGNER_PRIVATE_KEY: the public demo never holds the admin key. Remove the variable.');
  }
}
