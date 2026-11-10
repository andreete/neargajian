import { getDb } from '@/server/db/client';
import { identityDeps } from '@/server/identity/deps';
import { identityErrorResponse } from '@/server/identity/http';
import { runSpecimenCheck, SPECIMEN_SCENARIOS, type SpecimenScenario } from '@/server/identity/service';
import { json, problem, readJson, requireMutation } from '@/server/web/api';

export const dynamic = 'force-dynamic';

/**
 * Admin only: the full identity check on a committed SYNTHETIC specimen ({"scenario": "emma" |
 * "daniel" | "grace" | "impostor"}). In the public demo it is a dry run: the result is recorded
 * and shown, the recipient's status does not change.
 */
export async function POST(request: Request): Promise<Response> {
  const guarded = requireMutation(request, ['admin']);
  if (!guarded.ok) return guarded.response;
  const body = await readJson<{ scenario?: unknown }>(request, 256);
  if (body instanceof Response) return body;
  if (typeof body.scenario !== 'string' || !Object.hasOwn(SPECIMEN_SCENARIOS, body.scenario)) {
    return problem(422, 'invalid', `Send {"scenario": one of ${Object.keys(SPECIMEN_SCENARIOS).join(', ')}}.`);
  }
  try {
    return json({ check: await runSpecimenCheck(getDb(), identityDeps(), guarded.session.user, body.scenario as SpecimenScenario) });
  } catch (error) {
    return identityErrorResponse(error);
  }
}
