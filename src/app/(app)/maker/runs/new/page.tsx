import type { Metadata } from 'next';
import { NewRunForm } from '@/components/new-run-form';
import { requireRole } from '@/server/web/page-auth';
import { PayrollAssistant } from '@/components/payroll-assistant';
import { getAssistantModel } from '@/server/assistant/factory';

export const metadata: Metadata = { title: 'New run' };

export default async function NewRunPage() {
  const session = await requireRole(['maker']);
  const model = getAssistantModel();
  const month = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date());
  return (
    <>
      <div className="page-head">
        <div>
          <h1>New payroll run</h1>
          <p>Start a draft. Nothing is sent to anyone until you submit it for approval.</p>
        </div>
      </div>
      <PayrollAssistant enabled={Boolean(model)} modelId={model?.id ?? null} stub={model?.stub ?? false} csrfToken={session.csrfToken} />
      <h2 className="panel-h">Or set up the run yourself</h2>
      <NewRunForm csrfToken={session.csrfToken} defaultTitle={`${month} payroll`} />
    </>
  );
}
