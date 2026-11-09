import { getDb } from '@/server/db/client';
import { approverQueue, makerRuns } from '@/server/dashboard/queries';
import { formatAmount } from '@/server/money';
import { json, requireApiSession } from '@/server/web/api';

export const dynamic = 'force-dynamic';

/** Role-scoped run list: the maker's own runs, or the approver's assigned queue. */
export function GET(request: Request): Response {
  const guarded = requireApiSession(request, ['maker', 'approver']);
  if (!guarded.ok) return guarded.response;
  const { user } = guarded.session;
  const db = getDb();
  if (user.role === 'maker') {
    return json({
      runs: makerRuns(db, user.id).map((r) => ({ ...r, total: formatAmount(r.total), updatedAt: r.updatedAt.toISOString() })),
    });
  }
  const queue = approverQueue(db, user.id);
  const out = (items: typeof queue.pending) => items.map((i) => ({ ...i, total: formatAmount(i.total), submittedAt: i.submittedAt.toISOString() }));
  return json({ pending: out(queue.pending), reviewed: out(queue.reviewed) });
}
