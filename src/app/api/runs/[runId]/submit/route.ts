import { getDb } from '@/server/db/client';
import { getVaultClient } from '@/server/chain/vault-client';
import { submitRun } from '@/server/runs/lifecycle';
import { domainErrorResponse, json, problem, readJson, requireMutation } from '@/server/web/api';

export const dynamic = 'force-dynamic';

/** Maker only: freeze the reviewed draft into a version and send create_run (maker's restricted key). */
export async function POST(request: Request, ctx: { params: Promise<{ runId: string }> }): Promise<Response> {
  const guarded = requireMutation(request, ['maker']);
  if (!guarded.ok) return guarded.response;
  const body = await readJson<{ expectedRevision?: unknown; supersede?: unknown; applyInstalments?: unknown; expectedInstalments?: unknown }>(request, 4096);
  if (body instanceof Response) return body;
  if (typeof body.expectedRevision !== 'number') return problem(400, 'bad_request', 'expectedRevision is required.');
  try {
    const result = await submitRun(getDb(), getVaultClient(), guarded.session.user, (await ctx.params).runId, {
      expectedRevision: body.expectedRevision, supersede: body.supersede === true,
      ...(typeof body.applyInstalments === 'boolean' ? { applyInstalments: body.applyInstalments } : {}),
      ...(typeof body.expectedInstalments === 'string' ? { expectedInstalments: body.expectedInstalments } : {}),
    });
    return json(result, result.status === 'submit_failed' ? 502 : 202);
  } catch (error) {
    return domainErrorResponse(error);
  }
}
