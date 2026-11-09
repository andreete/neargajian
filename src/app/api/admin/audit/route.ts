import { desc } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { auditEvents } from '@/server/db/schema';
import { json, requireApiSession } from '@/server/web/api';

export const dynamic = 'force-dynamic';

/** Admin only: recent security and workflow audit events (no PII is ever stored in them). */
export function GET(request: Request): Response {
  const guarded = requireApiSession(request, ['admin']);
  if (!guarded.ok) return guarded.response;
  const events = getDb().select().from(auditEvents).orderBy(desc(auditEvents.id)).limit(50).all();
  return json({ events: events.map((e) => ({ ...e, at: e.at.toISOString() })) });
}
