import { getDb } from '@/server/db/client';
import { activeLimits } from '@/server/runs/draft-service';
import { checkReadiness, createRecipient, getRecipient, listRecipients, type RecipientInput } from '@/server/recipients/directory';
import { getReadinessChecker } from '@/server/recipients/readiness';
import { recipientJson } from '@/server/web/serialize';
import { domainErrorResponse, json, readJson, requireApiSession, requireMutation } from '@/server/web/api';

export const dynamic = 'force-dynamic';

/** Admin only: the recipient directory (search, division, status, page). */
export function GET(request: Request): Response {
  const guarded = requireApiSession(request, ['admin']);
  if (!guarded.ok) return guarded.response;
  const p = new URL(request.url).searchParams;
  const status = p.get('status');
  const list = listRecipients(getDb(), {
    q: p.get('q')?.slice(0, 100) ?? '', division: p.get('division')?.slice(0, 40) ?? '',
    status: status === 'active' || status === 'inactive' ? status : 'all', page: Number(p.get('page') ?? '1') || 1,
  });
  return json({ ...list, rows: list.rows.map(recipientJson) });
}

/** Admin only: add a recipient, then check its account on testnet (read-only). */
export async function POST(request: Request): Promise<Response> {
  const guarded = requireMutation(request, ['admin']);
  if (!guarded.ok) return guarded.response;
  const body = await readJson<Partial<RecipientInput>>(request, 4096);
  if (body instanceof Response) return body;
  const db = getDb();
  try {
    const result = createRecipient(db, guarded.session.user, body, activeLimits(db).maxRowAmount, new Date());
    if (!result.ok) return json({ errors: result.errors }, 422);
    await checkReadiness(db, getReadinessChecker(), guarded.session.user.id, [result.recipient.id]);
    return json({ recipient: recipientJson(getRecipient(db, result.recipient.id)) }, 201);
  } catch (error) {
    return domainErrorResponse(error);
  }
}
