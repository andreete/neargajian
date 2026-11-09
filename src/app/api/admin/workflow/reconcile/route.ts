import { getDb } from '@/server/db/client';
import { getVaultClient } from '@/server/chain/vault-client';
import { reconcilePendingWorkflow } from '@/server/workflow/service';
import { json, requireMutation } from '@/server/web/api';

export const dynamic = 'force-dynamic';

/** Admin only: re-check a pending workflow change against the vault. */
export async function POST(request: Request): Promise<Response> {
  const guarded = requireMutation(request, ['admin']);
  if (!guarded.ok) return guarded.response;
  const result = await reconcilePendingWorkflow(getDb(), getVaultClient(), guarded.session.user.id);
  return json({ result });
}
