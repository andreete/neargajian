import { getDb } from '@/server/db/client';
import { setRecipientActive } from '@/server/recipients/directory';
import { recipientJson } from '@/server/web/serialize';
import { domainErrorResponse, json, problem, readJson, requireMutation } from '@/server/web/api';

export const dynamic = 'force-dynamic';

/** Admin only: deactivate or reactivate (recipients are never deleted). */
export async function POST(request: Request, ctx: { params: Promise<{ recipientId: string }> }): Promise<Response> {
  const guarded = requireMutation(request, ['admin']);
  if (!guarded.ok) return guarded.response;
  const body = await readJson<{ active?: unknown }>(request, 512);
  if (body instanceof Response) return body;
  if (typeof body.active !== 'boolean') return problem(422, 'invalid', 'Send {"active": true | false}.');
  try {
    return json({ recipient: recipientJson(setRecipientActive(getDb(), guarded.session.user, (await ctx.params).recipientId, body.active, new Date())) });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
