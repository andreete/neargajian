/**
 * Login with rate limiting. Attempts are keyed by an HMAC of the email and of the client
 * address (never stored raw). Limits: 5 failures per email and 20 failures per client in
 * 15 minutes. Unknown emails take the same time as wrong passwords.
 */
import { createHmac } from 'node:crypto';
import { and, count, eq, gt } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { auditEvents, loginAttempts, users } from '../db/schema.ts';
import { dummyHash, verifyPassword } from './password.ts';
import { createSession, type SessionUser } from './session.ts';

export const WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILURES_PER_EMAIL = 5;
export const MAX_FAILURES_PER_CLIENT = 20;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;

export type LoginResult =
  | { ok: true; user: SessionUser; token: string; csrfToken: string; expiresAt: Date }
  | { ok: false; reason: 'invalid' | 'rate_limited'; retryAfterSeconds?: number };

export function keyed(secret: string, kind: string, value: string): string {
  return createHmac('sha256', secret).update(`${kind}:${value}`).digest('hex');
}

function recentFailures(db: Db, column: typeof loginAttempts.emailHash | typeof loginAttempts.clientHash, hash: string, since: Date): number {
  const row = db.select({ n: count() }).from(loginAttempts)
    .where(and(eq(column, hash), eq(loginAttempts.succeeded, false), gt(loginAttempts.attemptedAt, since))).get();
  return row?.n ?? 0;
}

export async function login(db: Db, input: {
  email: string; password: string; clientKey: string; secret: string; now: Date;
}): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase();
  const emailHash = keyed(input.secret, 'email', email);
  const clientHash = keyed(input.secret, 'client', input.clientKey);
  const since = new Date(input.now.getTime() - WINDOW_MS);
  if (recentFailures(db, loginAttempts.emailHash, emailHash, since) >= MAX_FAILURES_PER_EMAIL
    || recentFailures(db, loginAttempts.clientHash, clientHash, since) >= MAX_FAILURES_PER_CLIENT) {
    return { ok: false, reason: 'rate_limited', retryAfterSeconds: Math.ceil(WINDOW_MS / 1000) };
  }

  const wellFormed = EMAIL_RE.test(email) && input.password.length >= 1 && input.password.length <= 256;
  const user = wellFormed ? db.select().from(users).where(eq(users.email, email)).get() : undefined;
  const valid = await verifyPassword(input.password, user?.passwordHash ?? (await dummyHash()));
  const succeeded = Boolean(user && valid && !user.disabledAt);

  return db.transaction((tx) => {
    tx.insert(loginAttempts).values({ emailHash, clientHash, succeeded, attemptedAt: input.now }).run();
    if (!succeeded || !user) {
      tx.insert(auditEvents).values({ at: input.now, action: 'auth.login_failed', detail: JSON.stringify({ emailKey: emailHash.slice(0, 12) }) }).run();
      return { ok: false as const, reason: 'invalid' as const };
    }
    const session = createSession(tx, user.id, input.now);
    tx.insert(auditEvents).values({ at: input.now, actorUserId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id }).run();
    return {
      ok: true as const,
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role, chainAccountId: user.chainAccountId },
      ...session,
    };
  });
}
