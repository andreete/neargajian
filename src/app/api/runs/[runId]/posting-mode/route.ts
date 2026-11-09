import { getDb } from '@/server/db/client';
import { setPostingMode } from '@/server/runs/draft-service';
import { domainErrorResponse, json, problem, readJson, requireMutation } from '@/server/web/api';

export const dynamic = 'force-dynamic';

/** Maker only: choose consolidated or detailed posting for a draft. */
export async function POST(request: Request, ctx: { params: Promise<{ runId: string }> }): Promise<Response> {
  const guarded = requireMutation(request, ['maker']);
  if (!guarded.ok) return guarded.response;
  const body = await readJson<{ postingMode?: unknown }>(request, 1024);
  if (body instanceof Response) return body;
  if (body.postingMode !== 'consolidated' && body.postingMode !== 'detailed') return problem(422, 'invalid', 'Choose consolidated or detailed.');
  try {
    setPostingMode(getDb(), guarded.session.user, (await ctx.params).runId, body.postingMode, new Date());
    return json({ postingMode: body.postingMode });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
