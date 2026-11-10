import { getConfig } from '@/server/config';
import { getDb } from '@/server/db/client';
import { recipientCsv } from '@/server/reports/history';
import { requireApiSession } from '@/server/web/api';

export const dynamic = 'force-dynamic';

/** Recipient-detail CSV: makers (own runs) and assigned approvers only; the admin is refused. */
export function GET(request: Request): Response {
  const guarded = requireApiSession(request, ['maker', 'approver']);
  if (!guarded.ok) return guarded.response;
  const csv = recipientCsv(getDb(), guarded.session.user, getConfig().explorerTxUrl);
  return new Response(csv, { headers: {
    'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store',
    'Content-Disposition': `attachment; filename="sentfund-recipient-detail-${new Date().toISOString().slice(0, 10)}.csv"`,
  } });
}
