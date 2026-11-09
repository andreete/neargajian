import { getDb } from '@/server/db/client';
import { getVaultClient } from '@/server/chain/vault-client';
import { cancelVersion } from '@/server/runs/lifecycle';
import { domainErrorResponse, json, requireMutation } from '@/server/web/api';

export const dynamic = 'force-dynamic';

/** Maker only: cancel the submitted version on-chain before any release (cancel_run). */
export async function POST(request: Request, ctx: { params: Promise<{ runId: string }> }): Promise<Response> {
  const guarded = requireMutation(request, ['maker']);
  if (!guarded.ok) return guarded.response;
  try {
    return json(await cancelVersion(getDb(), getVaultClient(), guarded.session.user, (await ctx.params).runId));
  } catch (error) {
    return domainErrorResponse(error);
  }
}
