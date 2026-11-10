import { connection } from 'next/server';
import { hostedMode } from '@/server/hosted';
import { AlertIcon, InfoIcon } from './icons';

/**
 * Public demo and kill-switch banners on every page (root layout). Rendered per request, so the
 * running service's variables decide, never the build's.
 */
export async function HostedBanner() {
  await connection();
  const mode = hostedMode();
  if (!mode.demo && !mode.readOnly) return null;
  return (
    <div className="hosted-banners">
      {mode.readOnly ? (
        <div className="hosted-banner is-paused" role="status" data-testid="readonly-banner">
          <AlertIcon size={16} /><span><strong>Read-only:</strong> the SentFund team has paused this demo. You can sign in and look around; nothing can be changed and no payouts are sent.</span>
        </div>
      ) : null}
      {mode.demo ? (
        <div className="hosted-banner" role="note" data-testid="hosted-banner">
          <InfoIcon size={16} /><span><strong>Public demo on NEAR testnet.</strong> tUSDC is a zero-value test token. The demo data is shared: everyone signs in with the same demo accounts and sees the same runs.</span>
        </div>
      ) : null}
    </div>
  );
}
