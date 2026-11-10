import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { recipients } from '@/server/db/schema';
import { MAX_IMAGE_BYTES } from '@/server/identity/face';
import { identityDeps } from '@/server/identity/deps';
import { HOSTED_IDENTITY_MESSAGE, identityErrorResponse } from '@/server/identity/http';
import { runIdentityCheck } from '@/server/identity/service';
import { hostedMode } from '@/server/hosted';
import { json, problem, requireMutation } from '@/server/web/api';

export const dynamic = 'force-dynamic';

/**
 * Admin only: identity check of one recipient (multipart: `recipientId` or `nearAccountId`, `ktp`, `face` images,
 * each ≤ 8 MB JPEG/PNG/WebP). The images are processed in memory and discarded; the answer is
 * the stored result. Refused in the public demo (synthetic specimens only there).
 */
export async function POST(request: Request): Promise<Response> {
  const guarded = requireMutation(request, ['admin']);
  if (!guarded.ok) return guarded.response;
  if (hostedMode().demo) return problem(403, 'hosted_read_only', HOSTED_IDENTITY_MESSAGE);
  if (Number(request.headers.get('content-length') ?? '0') > 2 * MAX_IMAGE_BYTES + 64 * 1024) return problem(413, 'too_large', 'Each image must be 8 MB or smaller.');
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return problem(400, 'bad_form', 'Send the images as multipart/form-data.');
  }
  const ktp = form.get('ktp'), face = form.get('face');
  const db = getDb();
  let recipientId = form.get('recipientId');
  const account = form.get('nearAccountId');
  if (typeof recipientId !== 'string' && typeof account === 'string' && account) {
    recipientId = db.select({ id: recipients.id }).from(recipients).where(eq(recipients.nearAccountId, account.trim().toLowerCase())).get()?.id ?? null;
    if (!recipientId) return problem(404, 'not_found', `${account.slice(0, 64)} is not in the recipient directory.`);
  }
  if (typeof recipientId !== 'string' || !recipientId) return problem(400, 'bad_request', 'recipientId or nearAccountId is required.');
  if (!(ktp instanceof File) || !ktp.size) return problem(400, 'bad_request', 'Add the KTP image.');
  if (!(face instanceof File) || !face.size) return problem(400, 'bad_request', 'Add the face photo.');
  if (ktp.size > MAX_IMAGE_BYTES || face.size > MAX_IMAGE_BYTES) return problem(413, 'too_large', 'Each image must be 8 MB or smaller.');
  try {
    const check = await runIdentityCheck(db, identityDeps(), guarded.session.user, recipientId,
      { ktp: Buffer.from(await ktp.arrayBuffer()), face: Buffer.from(await face.arrayBuffer()) }, { source: 'upload', dryRun: false });
    return json({ check });
  } catch (error) {
    return identityErrorResponse(error);
  }
}
