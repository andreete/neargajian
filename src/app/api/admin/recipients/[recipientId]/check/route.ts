import { getDb } from '@/server/db/client';
import { checkReadiness, getRecipient } from '@/server/recipients/directory';
import { getReadinessChecker } from '@/server/recipients/readiness';
import { recipientJson } from '@/server/web/serialize';
import { domainErrorResponse, json, requireMutation } from '@/server/web/api';

export const dynamic = 'force-dynamic';

/** Admin only: check again on testnet (read-only) that the account exists and is registered with tUSDC. */
export async function POST(request: Request, ctx: { params: Promise<{ recipientId: string }> }): Promise<Response> {
  const guarded = requireMutation(request, ['admin']);
  if (!guarded.ok) return guarded.response;
  const db = getDb();
  try {
    const id = getRecipient(db, (await ctx.params).recipientId).id;
    await checkReadiness(db, getReadinessChecker(), guarded.session.user.id, [id]);
    return json({ recipient: recipientJson(getRecipient(db, id)) });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
