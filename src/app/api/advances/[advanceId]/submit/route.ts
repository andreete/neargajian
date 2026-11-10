import { getDb } from '@/server/db/client';
import { getVaultClient } from '@/server/chain/vault-client';
import { submitAdvance } from '@/server/advance/service';
import { advanceJson } from '@/server/web/serialize';
import { domainErrorResponse, json, requireMutation } from '@/server/web/api';

export const dynamic = 'force-dynamic';

/**
 * Maker only: re-check the request and submit it as the one-row run "Payroll Advance: <name>,
 * <month year>" (A − fee) through the normal create_run with the maker's restricted key.
 */
export async function POST(request: Request, ctx: { params: Promise<{ advanceId: string }> }): Promise<Response> {
  const guarded = requireMutation(request, ['maker']);
  if (!guarded.ok) return guarded.response;
  try {
    const r = await submitAdvance(getDb(), getVaultClient(), guarded.session.user, (await ctx.params).advanceId);
    return json({ advance: advanceJson(r.advance), runId: r.runId, status: r.submit.status, ...(r.submit.error ? { error: r.submit.error } : {}) }, r.submit.status === 'submit_failed' ? 502 : 202);
  } catch (error) {
    return domainErrorResponse(error);
  }
}
