import { getDb } from '@/server/db/client';
import { declineAdvance } from '@/server/advance/service';
import { advanceJson } from '@/server/web/serialize';
import { domainErrorResponse, json, readJson, requireMutation } from '@/server/web/api';

export const dynamic = 'force-dynamic';

/** Maker only: decline a requested Payroll Advance with a reason (shown to the employee). */
export async function POST(request: Request, ctx: { params: Promise<{ advanceId: string }> }): Promise<Response> {
  const guarded = requireMutation(request, ['maker']);
  if (!guarded.ok) return guarded.response;
  const body = await readJson<{ reason?: unknown }>(request, 2048);
  if (body instanceof Response) return body;
  try {
    return json({ advance: advanceJson(declineAdvance(getDb(), guarded.session.user, (await ctx.params).advanceId, body.reason)) });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
