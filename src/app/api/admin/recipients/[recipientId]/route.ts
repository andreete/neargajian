import { getDb } from '@/server/db/client';
import { activeLimits } from '@/server/runs/draft-service';
import { updateRecipient, type RecipientInput } from '@/server/recipients/directory';
import { recipientJson } from '@/server/web/serialize';
import { domainErrorResponse, json, readJson, requireMutation } from '@/server/web/api';

export const dynamic = 'force-dynamic';

/** Admin only: edit name, division, email, phone or maximum (the NEAR account never changes). */
export async function PATCH(request: Request, ctx: { params: Promise<{ recipientId: string }> }): Promise<Response> {
  const guarded = requireMutation(request, ['admin']);
  if (!guarded.ok) return guarded.response;
  const body = await readJson<Partial<RecipientInput> & { expectedUpdatedAt?: unknown }>(request, 4096);
  if (body instanceof Response) return body;
  const db = getDb();
  try {
    const expected = typeof body.expectedUpdatedAt === 'number' ? body.expectedUpdatedAt : undefined;
    const result = updateRecipient(db, guarded.session.user, (await ctx.params).recipientId, body, activeLimits(db).maxRowAmount, new Date(), expected);
    if (!result.ok) return json({ errors: result.errors }, 422);
    return json({ recipient: recipientJson(result.recipient), changed: result.changed });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
