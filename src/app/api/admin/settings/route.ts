import { getDb } from '@/server/db/client';
import { identityVerifiedOnly, setIdentityVerifiedOnly } from '@/server/identity/service';
import { registeredOnly, setRegisteredOnly } from '@/server/recipients/directory';
import { json, problem, readJson, requireApiSession, refuseInHostedDemo, requireMutation } from '@/server/web/api';

export const dynamic = 'force-dynamic';

export function GET(request: Request): Response {
  const guarded = requireApiSession(request, ['admin']);
  if (!guarded.ok) return guarded.response;
  const db = getDb();
  return json({ registeredRecipientsOnly: registeredOnly(db), identityVerifiedOnly: identityVerifiedOnly(db) });
}

/** Admin only: "Pay registered recipients only" and "Pay identity-verified recipients only" (audited). */
export async function POST(request: Request): Promise<Response> {
  const guarded = requireMutation(request, ['admin']);
  if (!guarded.ok) return guarded.response;
  const hosted = refuseInHostedDemo();
  if (hosted) return hosted;
  const body = await readJson<{ registeredRecipientsOnly?: unknown; identityVerifiedOnly?: unknown }>(request, 512);
  if (body instanceof Response) return body;
  const reg = body.registeredRecipientsOnly, idv = body.identityVerifiedOnly;
  if ((reg !== undefined && typeof reg !== 'boolean') || (idv !== undefined && typeof idv !== 'boolean') || (reg === undefined && idv === undefined)) {
    return problem(422, 'invalid', 'Send {"registeredRecipientsOnly": true | false} and/or {"identityVerifiedOnly": true | false}.');
  }
  const db = getDb();
  const now = new Date();
  if (typeof reg === 'boolean') setRegisteredOnly(db, guarded.session.user, reg, now);
  if (typeof idv === 'boolean') setIdentityVerifiedOnly(db, guarded.session.user, idv, now);
  return json({ registeredRecipientsOnly: registeredOnly(db), identityVerifiedOnly: identityVerifiedOnly(db) });
}
