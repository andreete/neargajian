import { getDb } from '@/server/db/client';
import { getFaceEngine } from '@/server/identity/face';
import { FaceLimitError, MAX_FRAMES, MAX_TOTAL_BYTES, runFaceCheck } from '@/server/identity/face-check';
import { domainErrorResponse, json, problem, requireMutation } from '@/server/web/api';

export const dynamic = 'force-dynamic';

/**
 * Employee only (Phase 24): one camera face check attempt. Multipart: `challengeId`, `nonce` and
 * 4–16 `frames` (JPEG, ≤ 200 KB each). The frames are analysed in memory (YuNet + SFace) and
 * discarded; only the result and the score are logged. The answer carries the attempt ID that the
 * Payroll Advance request then uses once.
 */
export async function POST(request: Request): Promise<Response> {
  const guarded = requireMutation(request, ['employee']);
  if (!guarded.ok) return guarded.response;
  if (Number(request.headers.get('content-length') ?? '0') > MAX_TOTAL_BYTES + 64 * 1024) return problem(413, 'too_large', 'The camera frames are too large.');
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return problem(400, 'bad_form', 'Send the frames as multipart/form-data.');
  }
  const files = form.getAll('frames').slice(0, MAX_FRAMES + 1);
  if (files.some((f) => !(f instanceof File))) return problem(400, 'bad_request', 'Every frame must be a file.');
  let total = 0;
  for (const f of files as File[]) total += f.size;
  if (total > MAX_TOTAL_BYTES) return problem(413, 'too_large', 'The camera frames are too large.');
  const frames = await Promise.all((files as File[]).map(async (f) => Buffer.from(await f.arrayBuffer())));
  try {
    const attempt = await runFaceCheck(getDb(), getFaceEngine(), guarded.session.user, { challengeId: form.get('challengeId'), nonce: form.get('nonce'), frames });
    return json({ attempt });
  } catch (error) {
    if (error instanceof FaceLimitError) return problem(429, 'rate_limited', error.message);
    return domainErrorResponse(error);
  }
}
