import { getDb } from '@/server/db/client';
import { firstErrorSentence, MAX_FILE_BYTES } from '@/server/payroll/import';
import { activeLimits } from '@/server/runs/draft-service';
import { applyImport, checkReadiness } from '@/server/recipients/directory';
import { importRecipientFile } from '@/server/recipients/import';
import { getReadinessChecker } from '@/server/recipients/readiness';
import { domainErrorResponse, json, problem, refuseInHostedDemo, requireMutation } from '@/server/web/api';

export const dynamic = 'force-dynamic';

/** New accounts are checked on testnet right away only for small imports (read-only RPC). */
const IMPORT_CHECK_LIMIT = 25;

/**
 * Admin only: bulk import (multipart `file`): the payroll format plus a `division` column, where
 * `amount` is the maximum per payout. All-or-nothing; 422 lists every problem with row and column.
 */
export async function POST(request: Request): Promise<Response> {
  const guarded = requireMutation(request, ['admin']);
  if (!guarded.ok) return guarded.response;
  const hosted = refuseInHostedDemo();
  if (hosted) return hosted;
  if (Number(request.headers.get('content-length') ?? '0') > MAX_FILE_BYTES + 64 * 1024) return problem(413, 'too_large', 'The file is larger than 2 MB.');
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return problem(400, 'bad_form', 'Send the file as multipart/form-data.');
  }
  const file = form.get('file');
  if (!(file instanceof File)) return problem(400, 'bad_request', 'A file is required.');
  if (file.size > MAX_FILE_BYTES) return problem(413, 'too_large', 'The file is larger than 2 MB.');
  const db = getDb();
  try {
    const result = importRecipientFile({ filename: file.name.slice(0, 200), bytes: new Uint8Array(await file.arrayBuffer()), perRowCap: activeLimits(db).maxRowAmount });
    if (!result.ok) {
      return json({ accepted: false, filename: result.filename, errorCount: result.errors.length, summary: firstErrorSentence(result.errors), errors: result.errors.slice(0, 5000) }, 422);
    }
    const applied = applyImport(db, guarded.session.user, result.rows.map(({ line: _l, ...r }) => r), new Date());
    const checked = applied.createdIds.length <= IMPORT_CHECK_LIMIT;
    if (checked && applied.createdIds.length) await checkReadiness(db, getReadinessChecker(), guarded.session.user.id, applied.createdIds);
    const { createdIds: _ids, ...counts } = applied;
    return json({ accepted: true, filename: result.filename, rows: result.rows.length, ...counts, checkedOnTestnet: checked });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
