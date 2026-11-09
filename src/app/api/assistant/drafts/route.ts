import { getDb } from '@/server/db/client';
import { createDraftFromPreview } from '@/server/assistant/service';
import { domainErrorResponse, json, problem, readJson, requireMutation } from '@/server/web/api';

export const dynamic = 'force-dynamic';

/** Maker only: "Create draft" from the maker's own preview (once). Creates a draft, nothing else. */
export async function POST(request: Request): Promise<Response> {
  const guarded = requireMutation(request, ['maker']);
  if (!guarded.ok) return guarded.response;
  const body = await readJson<{ requestId?: unknown }>(request, 512);
  if (body instanceof Response) return body;
  if (typeof body.requestId !== 'string' || body.requestId.length > 64) return problem(422, 'invalid', 'Send the requestId of your preview.');
  try {
    return json(createDraftFromPreview(getDb(), guarded.session.user, body.requestId), 201);
  } catch (error) {
    return domainErrorResponse(error);
  }
}
