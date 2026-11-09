import { getDb } from '@/server/db/client';
import { getAssistantModel } from '@/server/assistant/factory';
import { interpretRequest } from '@/server/assistant/service';
import { domainErrorResponse, json, readJson, requireMutation } from '@/server/web/api';

export const dynamic = 'force-dynamic';

/**
 * Maker only: the payroll assistant turns the maker's messages into a preview, a follow-up
 * question or a refusal. It never creates, submits or pays anything by itself.
 * 200 preview | question | refused · 429 rate limited · 503 off (no API key) · 502 model error.
 */
export async function POST(request: Request): Promise<Response> {
  const guarded = requireMutation(request, ['maker']);
  if (!guarded.ok) return guarded.response;
  const body = await readJson<{ messages?: unknown }>(request, 8192);
  if (body instanceof Response) return body;
  try {
    const reply = await interpretRequest(getDb(), getAssistantModel(), guarded.session.user, body.messages);
    const status = reply.kind === 'rate_limited' ? 429 : reply.kind === 'off' ? 503 : reply.kind === 'error' ? 502 : 200;
    return json(reply, status);
  } catch (error) {
    return domainErrorResponse(error);
  }
}
