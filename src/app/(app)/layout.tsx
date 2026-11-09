import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppHeader } from '@/components/app-header';
import { getDb } from '@/server/db/client';
import { activeWorkflow } from '@/server/dashboard/queries';
import { currentSession } from '@/server/web/page-auth';

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
    <div className="app-body">
      <AppHeader user={session.user} csrfToken={session.csrfToken} {...(roleDetail ? { roleDetail } : {})} />
      <main id="main" className="app-main">
        <div className="container">{children}</div>
      </main>
    </div>
  );
}
