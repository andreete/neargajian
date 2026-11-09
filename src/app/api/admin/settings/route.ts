import { getDb } from '@/server/db/client';
import { registeredOnly, setRegisteredOnly } from '@/server/recipients/directory';
import { json, problem, readJson, requireApiSession, requireMutation } from '@/server/web/api';

export const dynamic = 'force-dynamic';

export function GET(request: Request): Response {
  const guarded = requireApiSession(request, ['admin']);
  if (!guarded.ok) return guarded.response;
  return json({ registeredRecipientsOnly: registeredOnly(getDb()) });
}

/** Admin only: "Pay registered recipients only" (audited). */
export async function POST(request: Request): Promise<Response> {
  const guarded = requireMutation(request, ['admin']);
  if (!guarded.ok) return guarded.response;
  const body = await readJson<{ registeredRecipientsOnly?: unknown }>(request, 512);
  if (body instanceof Response) return body;
  if (typeof body.registeredRecipientsOnly !== 'boolean') return problem(422, 'invalid', 'Send {"registeredRecipientsOnly": true | false}.');
  const db = getDb();
  setRegisteredOnly(db, guarded.session.user, body.registeredRecipientsOnly, new Date());
  return json({ registeredRecipientsOnly: registeredOnly(db) });
}
