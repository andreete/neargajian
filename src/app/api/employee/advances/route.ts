import { getDb } from '@/server/db/client';
import { requestAdvance, type AdvanceRequestInput } from '@/server/advance/service';
import { advanceJson } from '@/server/web/serialize';
import { domainErrorResponse, json, readJson, requireMutation } from '@/server/web/api';

export const dynamic = 'force-dynamic';

/**
 * Employee only: request a Payroll Advance for the signed-in employee's OWN linked recipient (never
 * an ID from the request). Body {amount: "0.30", reason?: string, consent: true}. The server checks
 * eligibility and the money rules again; a second open request is refused (409).
 */
export async function POST(request: Request): Promise<Response> {
  const guarded = requireMutation(request, ['employee']);
  if (!guarded.ok) return guarded.response;
  const body = await readJson<AdvanceRequestInput>(request, 2048);
  if (body instanceof Response) return body;
  try {
    return json({ advance: advanceJson(requestAdvance(getDb(), guarded.session.user, body)) }, 201);
  } catch (error) {
    return domainErrorResponse(error);
  }
}
