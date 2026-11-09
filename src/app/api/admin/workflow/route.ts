import { getDb } from '@/server/db/client';
import { getVaultClient } from '@/server/chain/vault-client';
import { activeWorkflow } from '@/server/dashboard/queries';
import { approverOptions, pendingWorkflow, updateWorkflow, type WorkflowInput } from '@/server/workflow/service';
import { json, problem, requireApiSession, requireMutation } from '@/server/web/api';

export const dynamic = 'force-dynamic';

export function GET(request: Request): Response {
  const guarded = requireApiSession(request, ['admin']);
  if (!guarded.ok) return guarded.response;
  const db = getDb();
  const active = activeWorkflow(db);
  const pending = pendingWorkflow(db);
  return json({
    active: active && { revision: active.revision, kind: active.kind, releaseMode: active.releaseMode, approverUserIds: active.approvers.map((a) => a.userId), chainTxHash: active.chainTxHash },
    pending: pending && { revision: pending.revision, chainTxHash: pending.chainTxHash },
    approvers: approverOptions(db),
  });
}

/** Admin only: change the workflow for future runs (sends update_workflow to the vault). */
export async function POST(request: Request): Promise<Response> {
  const guarded = requireMutation(request, ['admin']);
  if (!guarded.ok) return guarded.response;
  let body: Partial<WorkflowInput>;
  try {
    body = (await request.json()) as Partial<WorkflowInput>;
  } catch {
    return problem(400, 'bad_json', 'Malformed JSON.');
  }
  const result = await updateWorkflow(getDb(), getVaultClient(), guarded.session.user.id, body);
  switch (result.status) {
    case 'invalid': return json({ result }, 422);
    case 'conflict': return json({ result }, 409);
    case 'failed': return json({ result }, 502);
    case 'pending': return json({ result }, 202);
    default: return json({ result }, 200);
  }
}
