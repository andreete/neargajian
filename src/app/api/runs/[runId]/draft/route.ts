import { getDb } from '@/server/db/client';
import { draftView, saveManualDraft } from '@/server/runs/draft-service';
import type { RawRow } from '@/server/payroll/validate';
import { domainErrorResponse, json, problem, readJson, requireApiSession, requireMutation } from '@/server/web/api';
import { summaryJson } from '@/server/web/serialize';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ runId: string }> };

/** The maker's editable draft with server-side validation. */
export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  const guarded = requireApiSession(request, ['maker']);
  if (!guarded.ok) return guarded.response;
  try {
    const view = draftView(getDb(), guarded.session.user, (await ctx.params).runId);
    return json({ run: view.run, rows: view.rows, summary: summaryJson(view.summary) });
  } catch (error) {
    return domainErrorResponse(error);
  }
}

/** Save the manual draft (rows kept as entered, including invalid ones). */
export async function PUT(request: Request, ctx: Ctx): Promise<Response> {
  const guarded = requireMutation(request, ['maker']);
  if (!guarded.ok) return guarded.response;
  const body = await readJson<{ expectedRevision?: unknown; title?: unknown; postingMode?: unknown; rows?: unknown }>(request);
  if (body instanceof Response) return body;
  if (typeof body.expectedRevision !== 'number' || !Array.isArray(body.rows)) return problem(400, 'bad_request', 'expectedRevision and rows are required.');
  const postingMode = body.postingMode === 'consolidated' || body.postingMode === 'detailed' ? body.postingMode : undefined;
  try {
    const result = saveManualDraft(getDb(), guarded.session.user, (await ctx.params).runId, {
      expectedRevision: body.expectedRevision, rows: body.rows as Partial<RawRow>[], now: new Date(),
      ...(typeof body.title === 'string' ? { title: body.title } : {}), ...(postingMode ? { postingMode } : {}),
    });
    return json({ revision: result.revision, summary: summaryJson(result.summary) });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
