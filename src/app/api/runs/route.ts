import { getDb } from '@/server/db/client';
import { approverQueue, makerRuns } from '@/server/dashboard/queries';
import { formatAmount } from '@/server/money';
import { createRun } from '@/server/runs/repository';
import { domainErrorResponse, json, problem, readJson, requireApiSession, requireMutation } from '@/server/web/api';

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

/** Maker only: create a new draft run. */
export async function POST(request: Request): Promise<Response> {
  const guarded = requireMutation(request, ['maker']);
  if (!guarded.ok) return guarded.response;
  const body = await readJson<{ title?: unknown; postingMode?: unknown; source?: unknown }>(request, 4096);
  if (body instanceof Response) return body;
  const postingMode = body.postingMode === 'consolidated' ? 'consolidated' : body.postingMode === 'detailed' ? 'detailed' : null;
  const source = body.source === 'upload' ? 'upload' : body.source === 'manual' ? 'manual' : null;
  if (typeof body.title !== 'string' || !postingMode || !source) return problem(422, 'invalid', 'Enter a title and choose a posting mode and an entry method.');
  try {
    const id = createRun(getDb(), { makerUserId: guarded.session.user.id, title: body.title, postingMode, source, now: new Date() });
    return json({ id, href: `/maker/runs/${id}` }, 201);
  } catch (error) {
    return domainErrorResponse(error);
  }
}
