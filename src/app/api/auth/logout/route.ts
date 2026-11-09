import { getConfig } from '@/server/config';
import { getDb } from '@/server/db/client';
import { auditEvents } from '@/server/db/schema';
import { SESSION_COOKIE, clearedSessionCookie, destroySession, parseCookies } from '@/server/auth/session';
import { requireMutation } from '@/server/web/api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const guarded = requireMutation(request, undefined, { allowWhenReadOnly: true });
  if (!guarded.ok) return guarded.response;
  const db = getDb();
  destroySession(db, parseCookies(request.headers.get('cookie'))[SESSION_COOKIE]);
  db.insert(auditEvents).values({ at: new Date(), actorUserId: guarded.session.user.id, action: 'auth.logout', entityType: 'user', entityId: guarded.session.user.id }).run();
  return new Response(null, {
    status: 204,
    headers: { 'Set-Cookie': clearedSessionCookie(getConfig().secureCookies), 'Cache-Control': 'no-store' },
  });
}
