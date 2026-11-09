import { getDb } from '@/server/db/client';
import { companyCsv } from '@/server/reports/history';
import { requireApiSession } from '@/server/web/api';

export const dynamic = 'force-dynamic';

/** Company accounting CSV (all roles, scoped): fully paid runs in their locked posting mode, no recipient fields. */
export function GET(request: Request): Response {
  const guarded = requireApiSession(request, ['maker', 'approver', 'admin']);
  if (!guarded.ok) return guarded.response;
  const csv = companyCsv(getDb(), guarded.session.user);
  return new Response(csv, { headers: {
    'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store',
    'Content-Disposition': `attachment; filename="gajian-company-entries-${new Date().toISOString().slice(0, 10)}.csv"`,
  } });
}
