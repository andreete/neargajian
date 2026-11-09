import { homeFor } from '@/server/auth/policy';
import { json, requireApiSession } from '@/server/web/api';

export const dynamic = 'force-dynamic';

export function GET(request: Request): Response {
  const guarded = requireApiSession(request);
  if (!guarded.ok) return guarded.response;
  const { user } = guarded.session;
  return json({ user: { email: user.email, displayName: user.displayName, role: user.role, chainAccountId: user.chainAccountId }, home: homeFor(user.role) });
}
