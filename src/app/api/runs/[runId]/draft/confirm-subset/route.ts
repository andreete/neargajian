import { getDb } from '@/server/db/client';
import { confirmValidSubset } from '@/server/runs/draft-service';
import { domainErrorResponse, json, problem, readJson, requireMutation } from '@/server/web/api';
import { summaryJson } from '@/server/web/serialize';

export const dynamic = 'force-dynamic';

/** The maker explicitly confirms removing exactly these invalid rows (never silent). */
export async function POST(request: Request, ctx: { params: Promise<{ runId: string }> }): Promise<Response> {
  const guarded = requireMutation(request, ['maker']);
  if (!guarded.ok) return guarded.response;
  const body = await readJson<{ expectedRevision?: unknown; removeIndexes?: unknown }>(request, 65_536);
  if (body instanceof Response) return body;
  if (typeof body.expectedRevision !== 'number' || !Array.isArray(body.removeIndexes) || !body.removeIndexes.every((x) => Number.isInteger(x))) {
    return problem(400, 'bad_request', 'expectedRevision and removeIndexes are required.');
  }
  try {
    const r = confirmValidSubset(getDb(), guarded.session.user, (await ctx.params).runId, {
      expectedRevision: body.expectedRevision, removeIndexes: body.removeIndexes as number[], now: new Date(),
    });
    return json({ revision: r.revision, removed: r.removed, summary: summaryJson(r.summary) });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
