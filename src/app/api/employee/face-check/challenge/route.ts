import { getDb } from '@/server/db/client';
import { getFaceEngine } from '@/server/identity/face';
import { FaceLimitError, issueChallenge } from '@/server/identity/face-check';
import { domainErrorResponse, json, problem, requireMutation } from '@/server/web/api';

export const dynamic = 'force-dynamic';

/**
 * Employee only (Phase 24): a one-time camera challenge for the signed-in employee's OWN face check
 * before a Payroll Advance request. Answers a random turn order and a nonce valid for 60 seconds.
 * Refused (409) without a face template on file ("Ask your admin to verify your identity first"),
 * 429 after 5 attempts in an hour.
 */
export async function POST(request: Request): Promise<Response> {
  const guarded = requireMutation(request, ['employee']);
  if (!guarded.ok) return guarded.response;
  if (!getFaceEngine()) return problem(409, 'face_engine_off', 'The face check is off on this copy: the face models are missing (npm run vision:models).');
  try {
    return json({ challenge: issueChallenge(getDb(), guarded.session.user) }, 201);
  } catch (error) {
    if (error instanceof FaceLimitError) return problem(429, 'rate_limited', error.message);
    return domainErrorResponse(error);
  }
}
