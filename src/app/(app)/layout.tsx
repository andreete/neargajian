import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell, navFor } from '@/components/app-shell';
import { getDb } from '@/server/db/client';
import { activeWorkflow } from '@/server/dashboard/queries';
import { currentSession } from '@/server/web/page-auth';
import { getConfig } from '@/server/config';
import { STANDIN_LABEL } from '@/server/chain/standin';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await currentSession();
  if (!session) redirect('/?signin=required');
  let roleDetail: string | undefined;
  if (session.user.role === 'approver') {
    const wf = activeWorkflow(getDb());
    const step = wf?.approvers.findIndex((a) => a.userId === session.user.id) ?? -1;
    roleDetail = step >= 0 ? `Approver ${step + 1}` : 'Approver';
  }
  return (
    <AppShell user={session.user} csrfToken={session.csrfToken} nav={navFor(session.user.role)} {...(roleDetail ? { roleDetail } : {})}>
      {process.env.VAULT_STANDIN === 'browser-tests' ? <div className="callout callout-warn" role="note" data-testid="standin-note"><span><strong>Test mode.</strong> {STANDIN_LABEL}</span></div> : null}
      {getConfig().chainWritesEnabled ? null : (
        <div className="callout readonly-note" role="note" data-testid="no-signer-note">
          <span><strong>Read-only copy.</strong> This server has no signer keys, so it cannot send transactions to NEAR: you can sign in, build and upload runs, review them and browse history, but submitting, approving and paying are disabled. The live runs are verifiable without keys: <code>npm run judge:verify</code>.</span>
        </div>
      )}
      {children}
    </AppShell>
  );
}
