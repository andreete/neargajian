/**
 * Database-backed sessions. The cookie holds a random 256-bit token; the database stores
 * only its SHA-256, so a database leak does not leak usable sessions. Each session has its
 * own CSRF token for state-changing requests.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import type { Queryable } from '../db/client.ts';
import { sessions, users, type Role } from '../db/schema.ts';

export const SESSION_COOKIE = 'sentfund_session';
/** Absolute lifetime and idle timeout. */
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 2 * 60 * 60 * 1000;
const TOUCH_EVERY_MS = 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  chainAccountId: string | null;
}

export interface ActiveSession {
  user: SessionUser;
  csrfToken: string;
  expiresAt: Date;
}

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export function createSession(db: Queryable, userId: string, now: Date): { token: string; csrfToken: string; expiresAt: Date } {
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  db.insert(sessions).values({ id: tokenHash(token), userId, csrfToken, createdAt: now, lastSeenAt: now, expiresAt }).run();
  return { token, csrfToken, expiresAt };
}

/** Resolves a cookie token to an active session (absolute + idle expiry, enabled user). */
export function readSession(db: Queryable, token: string | undefined, now: Date): ActiveSession | null {
  if (!token || token.length > 128) return null;
  const id = tokenHash(token);
  const row = db.select({
    session: sessions,
    user: { id: users.id, email: users.email, displayName: users.displayName, role: users.role, chainAccountId: users.chainAccountId, disabledAt: users.disabledAt },
  }).from(sessions).innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, now))).get();
  if (!row || row.user.disabledAt) return null;
  if (now.getTime() - row.session.lastSeenAt.getTime() > SESSION_IDLE_MS) {
    db.delete(sessions).where(eq(sessions.id, id)).run();
    return null;
  }
  if (now.getTime() - row.session.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, id)).run();
  }
  const { disabledAt: _disabled, ...user } = row.user;
  return { user, csrfToken: row.session.csrfToken, expiresAt: row.session.expiresAt };
}

export function destroySession(db: Queryable, token: string | undefined): void {
  if (token) db.delete(sessions).where(eq(sessions.id, tokenHash(token))).run();
}

export function purgeExpiredSessions(db: Queryable, now: Date): void {
  db.delete(sessions).where(lt(sessions.expiresAt, now)).run();
}

export function csrfMatches(expected: string, provided: string | null | undefined): boolean {
  if (!provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Minimal Cookie header parser (route handlers read cookies from the request itself). */
export function parseCookies(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const name = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (name && !(name in out)) {
      try {
        out[name] = decodeURIComponent(value);
      } catch {
        // ignore malformed cookie values
      }
    }
  }
  return out;
}

export function sessionCookie(token: string, expiresAt: Date, secure: boolean): string {
  return [
    `${SESSION_COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Expires=${expiresAt.toUTCString()}`,
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`, ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export function clearedSessionCookie(secure: boolean): string {
  return [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0', ...(secure ? ['Secure'] : [])].join('; ');
}
