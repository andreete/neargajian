import { getDb } from '@/server/db/client';
import { firstErrorSentence, MAX_FILE_BYTES } from '@/server/payroll/import';
import { uploadToDraft } from '@/server/runs/draft-service';
import { formatAmount } from '@/server/money';
import { domainErrorResponse, json, problem, requireMutation } from '@/server/web/api';
import { DELIMITER_LABEL } from '@/server/payroll/import';

export const dynamic = 'force-dynamic';

/**
 * Maker only: upload a CSV/TXT payroll file (multipart: `file`, `expectedRevision`).
 * 200 accepted (draft replaced) · 422 rejected (draft unchanged, every problem listed).
 */
export async function POST(request: Request, ctx: { params: Promise<{ runId: string }> }): Promise<Response> {
  const guarded = requireMutation(request, ['maker']);
  if (!guarded.ok) return guarded.response;
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_FILE_BYTES + 64 * 1024) return problem(413, 'too_large', 'The file is larger than 2 MB.');
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return problem(400, 'bad_form', 'Send the file as multipart/form-data.');
  }
  const file = form.get('file');
  const expectedRevision = Number(form.get('expectedRevision'));
  if (!(file instanceof File) || !Number.isInteger(expectedRevision)) return problem(400, 'bad_request', 'A file and expectedRevision are required.');
  if (file.size > MAX_FILE_BYTES) return problem(413, 'too_large', 'The file is larger than 2 MB.');
  try {
    const { result, revision } = uploadToDraft(getDb(), guarded.session.user, (await ctx.params).runId, {
      filename: file.name.slice(0, 200), bytes: new Uint8Array(await file.arrayBuffer()), expectedRevision, now: new Date(),
    });
    if (!result.ok) {
      return json({
        accepted: false, filename: result.filename, revision, recordCount: result.recordCount, errorCount: result.errors.length,
        summary: firstErrorSentence(result.errors), errors: result.errors.slice(0, 5000),
      }, 422);
    }
    return json({
      accepted: true, filename: result.filename, sha256: result.sha256, revision, rowCount: result.rows.length,
      total: formatAmount(result.total), delimiter: DELIMITER_LABEL[result.delimiter], duplicateWallets: result.duplicateWallets,
    });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
