import { getDb } from '@/server/db/client';
import { setPolicy, type PolicyField } from '@/server/advance/policy';
import { HOSTED_POLICY_MESSAGE } from '@/server/hosted';
import { domainErrorResponse, json, readJson, refuseInHostedDemo, requireMutation } from '@/server/web/api';

export const dynamic = 'force-dynamic';

/** Admin only: the Payroll Advance policy (logged with who and when). Read-only in the public demo. */
export async function POST(request: Request): Promise<Response> {
  const guarded = requireMutation(request, ['admin']);
  if (!guarded.ok) return guarded.response;
  const hosted = refuseInHostedDemo(HOSTED_POLICY_MESSAGE);
  if (hosted) return hosted;
  const body = await readJson<Partial<Record<PolicyField, unknown>>>(request, 1024);
  if (body instanceof Response) return body;
  try {
    const r = setPolicy(getDb(), guarded.session.user, body, new Date());
    if (!r.ok) return json({ errors: r.errors }, 422);
    return json({ policy: r.policy, changed: r.changed });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
