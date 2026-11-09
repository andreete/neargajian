/**
 * Route-handler helpers: JSON responses, same-origin and CSRF checks, and session/role
 * guards. Route handlers read the cookie from the Request itself, which keeps them
 * testable outside a Next.js request scope.
 */
import { getConfig } from '../config.ts';
import { getDb } from '../db/client.ts';
import type { Role } from '../db/schema.ts';
import { SESSION_COOKIE, csrfMatches, parseCookies, readSession, type ActiveSession } from '../auth/session.ts';
import { HOSTED_DIRECTORY_MESSAGE, hostedMode, READ_ONLY_MESSAGE } from '../hosted.ts';

export const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...NO_STORE, ...headers },
  });
}

export function problem(status: number, code: string, message: string, headers: HeadersInit = {}): Response {
  return json({ error: { code, message } }, status, headers);
}

/** Browser mutations must come from our own origin (defence in depth next to SameSite + CSRF token). */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (origin) {
    const allowed = new Set([getConfig().baseUrl.origin, new URL(request.url).origin]);
    const host = request.headers.get('host');
    if (host) allowed.add(`${new URL(request.url).protocol}//${host}`);
    return allowed.has(origin);
  }
  return request.headers.get('sec-fetch-site') === 'same-origin';
}

export function sessionFrom(request: Request, now = new Date()): ActiveSession | null {
  const token = parseCookies(request.headers.get('cookie'))[SESSION_COOKIE];
  return readSession(getDb(), token, now);
}

export type Guarded = { ok: true; session: ActiveSession } | { ok: false; response: Response };

/** 401 without a session, 403 for a role that may never call this endpoint. */
export function requireApiSession(request: Request, roles?: readonly Role[]): Guarded {
  const session = sessionFrom(request);
  if (!session) return { ok: false, response: problem(401, 'unauthenticated', 'Sign in to continue.') };
  if (roles && !roles.includes(session.user.role)) {
    return { ok: false, response: problem(403, 'forbidden', 'Your role cannot use this endpoint.') };
  }
  return { ok: true, session };
}

/**
 * For state-changing requests: same origin plus the session's CSRF token in a header.
 * Kill switch: with HOSTED_READONLY=true every mutation is refused (503) except those that pass
 * `allowWhenReadOnly` (sign-out).
 */
export function requireMutation(request: Request, roles?: readonly Role[], opts: { allowWhenReadOnly?: boolean } = {}): Guarded {
  if (!isSameOrigin(request)) return { ok: false, response: problem(403, 'bad_origin', 'Cross-site request refused.') };
  if (hostedMode().readOnly && !opts.allowWhenReadOnly) return { ok: false, response: problem(503, 'read_only', READ_ONLY_MESSAGE) };
  const guarded = requireApiSession(request, roles);
  if (!guarded.ok) return guarded;
  if (!csrfMatches(guarded.session.csrfToken, request.headers.get('x-csrf-token'))) {
    return { ok: false, response: problem(403, 'bad_csrf', 'Missing or invalid CSRF token. Reload the page.') };
  }
  return guarded;
}

/** Hashable client key for rate limiting (raw value is never stored). */
export function clientKey(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'local';
}

/** Maps domain errors to HTTP responses (not_found 404, forbidden 403, conflict 409, invalid 422). */
export function domainErrorResponse(error: unknown): Response {
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    const code = String((error as { code: unknown }).code);
    const message = String((error as { message: unknown }).message);
    const status = code === 'not_found' ? 404 : code === 'forbidden' ? 403 : code === 'conflict' ? 409 : code === 'invalid' ? 422 : 500;
    if (status !== 500) return problem(status, code, message);
  }
  throw error;
}

export async function readJson<T>(request: Request, maxBytes = 1_000_000): Promise<T | Response> {
  const text = await request.text();
  if (text.length > maxBytes) return problem(413, 'too_large', 'Request body too large.');
  try {
    return JSON.parse(text) as T;
  } catch {
    return problem(400, 'bad_json', 'Malformed JSON.');
  }
}

/** Directory and settings changes are refused in the public demo (visitors cannot add payees). */
export function refuseInHostedDemo(): Response | null {
  return hostedMode().demo ? problem(403, 'hosted_read_only', HOSTED_DIRECTORY_MESSAGE) : null;
}
