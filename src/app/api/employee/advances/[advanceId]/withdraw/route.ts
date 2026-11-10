import { getDb } from '@/server/db/client';
import { withdrawAdvance } from '@/server/advance/service';
import { advanceJson } from '@/server/web/serialize';
import { domainErrorResponse, json, requireMutation } from '@/server/web/api';

export const dynamic = 'force-dynamic';

/**
 * Employee only (Phase 23b): withdraw the signed-in employee's OWN request while it is still
 * "Requested". Another employee's request answers 404; a request the maker already submitted
 * answers 409 ("can no longer be withdrawn"). Nothing is sent to NEAR.
 */
export async function POST(request: Request, ctx: { params: Promise<{ advanceId: string }> }): Promise<Response> {
  const guarded = requireMutation(request, ['employee']);
  if (!guarded.ok) return guarded.response;
  try {
    return json({ advance: advanceJson(withdrawAdvance(getDb(), guarded.session.user, (await ctx.params).advanceId)) });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
