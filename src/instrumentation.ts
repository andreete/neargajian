/**
 * Next.js start-up hook. Only used by the TEST-ONLY stand-in vault mode (VAULT_STANDIN=browser-tests,
 * scripts/e2e-server-standin.sh): runs the release worker's tick in this process. Does nothing
 * otherwise (the real release worker is its own process: npm run worker).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.VAULT_STANDIN !== 'browser-tests') return;
  const { startStandinWorker } = await import('./server/chain/standin-worker');
  startStandinWorker();
}
