import { getDb } from '@/server/db/client';
import { HOSTED_IDENTITY_MESSAGE, identityErrorResponse } from '@/server/identity/http';
import { reviewIdentity } from '@/server/identity/service';
import { hostedMode } from '@/server/hosted';
import { json, problem, readJson, requireMutation } from '@/server/web/api';

export const dynamic = 'force-dynamic';

/** Admin only: decide a "Needs review" check, or withdraw a verification, with a reason. */
export async function POST(request: Request): Promise<Response> {
  const guarded = requireMutation(request, ['admin']);
  if (!guarded.ok) return guarded.response;
  if (hostedMode().demo) return problem(403, 'hosted_read_only', HOSTED_IDENTITY_MESSAGE);
  const body = await readJson<{ recipientId?: unknown; decision?: unknown; reason?: unknown }>(request, 2048);
  if (body instanceof Response) return body;
  if (typeof body.recipientId !== 'string' || (body.decision !== 'verified' && body.decision !== 'failed') || typeof body.reason !== 'string') {
    return problem(422, 'invalid', 'Send {"recipientId", "decision": "verified" | "failed", "reason"}.');
  }
  try {
    return json({ check: reviewIdentity(getDb(), guarded.session.user, body.recipientId, body.decision, body.reason) });
  } catch (error) {
    return identityErrorResponse(error);
  }
}
