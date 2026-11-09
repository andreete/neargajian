import { getConfig } from '@/server/config';
import { getDb } from '@/server/db/client';
import { login } from '@/server/auth/login';
import { homeFor } from '@/server/auth/policy';
import { sessionCookie } from '@/server/auth/session';
import { clientKey, isSameOrigin, json, problem } from '@/server/web/api';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 2048;

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return problem(403, 'bad_origin', 'Cross-site request refused.');
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return problem(415, 'unsupported_media_type', 'Send JSON.');
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return problem(413, 'too_large', 'Request body too large.');
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return problem(400, 'bad_json', 'Malformed JSON.');
  }
  const { email, password } = (body ?? {}) as { email?: unknown; password?: unknown };
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    return problem(400, 'missing_fields', 'Enter your email and password.');
  }
  const config = getConfig();
  const result = await login(getDb(), { email, password, clientKey: clientKey(request), secret: config.sessionSecret, now: new Date() });
  if (!result.ok) {
    return result.reason === 'rate_limited'
      ? problem(429, 'rate_limited', 'Too many failed sign-in attempts. Try again in 15 minutes.', { 'Retry-After': String(result.retryAfterSeconds ?? 900) })
      : problem(401, 'invalid_credentials', 'Email or password is incorrect.');
  }
  return json(
    { user: { displayName: result.user.displayName, role: result.user.role }, redirectTo: homeFor(result.user.role) },
    200,
    { 'Set-Cookie': sessionCookie(result.token, result.expiresAt, config.secureCookies) },
  );
}
