/**
 * Server-component guards. Pages call these; the session role decides access, never a
 * query parameter or client state. Unauthenticated → landing with the sign-in dialog;
 * wrong role → 403 page.
 */
import 'server-only';
import { cookies } from 'next/headers';
import { forbidden, redirect } from 'next/navigation';
import { cache } from 'react';
import { getDb } from '../db/client.ts';
import type { Role } from '../db/schema.ts';
import { SESSION_COOKIE, readSession, type ActiveSession } from '../auth/session.ts';

export const currentSession = cache(async (): Promise<ActiveSession | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return readSession(getDb(), token, new Date());
});

export async function requireRole(roles: readonly Role[]): Promise<ActiveSession> {
  const session = await currentSession();
  if (!session) redirect('/?signin=required');
  if (!roles.includes(session.user.role)) forbidden();
  return session;
}
