# Security model (app)

Version 1 · Phase 06 · 9 Nov 2026. Contract-side rules are in `contracts/vault` and `docs/RECOVERY.md`; this file covers the web app.

## Authorization matrix (server-owned)

Source of truth: `src/server/auth/policy.ts` (`can(principal, action, run?)`). Run context (owner, assigned approvers) is loaded from the database; the "assigned approvers" of a run are the approvers snapshotted into any of its submitted versions. Query parameters, hidden buttons and client state never grant anything.

| Action | Maker | Approver | Admin |
| --- | --- | --- | --- |
| `run.create`, `run.list_own` | yes | no | no |
| `run.view`, `run.view_recipients`, `report.recipients` | own runs | assigned runs | **no** |
| `run.edit_draft`, `run.submit`, `run.cancel`, `run.release` | own runs | no | no |
| `run.decide` (approve / reject) | no | assigned runs | no |
| `queue.view` | no | yes | no |
| `workflow.view` | yes | yes | yes |
| `workflow.update` | no | no | yes |
| `report.company` (opaque references, no recipient fields) | yes | yes | yes |

Responses: 401 without a session; 403 when the role can never use an endpoint or page; **404** for a run the caller may not see, so run IDs reveal nothing. Pages: no session → `/?signin=required` (the sign-in dialog opens); wrong role → 403 page (`forbidden()`).

## Sessions

- Random 256-bit token in the `gajian_session` cookie: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` when `APP_BASE_URL` is https. The database stores only SHA-256(token).
- 8 h absolute lifetime, 2 h idle timeout; logout deletes the server session and clears the cookie.
- Dashboard after login is chosen by the server from the session role (`homeFor`).

## Credentials and login

- argon2id (Node `crypto.argon2`, 19 MiB, t=2, p=1, PHC format). Unknown emails verify against a dummy hash (same timing). One generic error: "Email or password is incorrect."
- Rate limit: 5 failures per email and 20 per client in 15 minutes → 429 with `Retry-After`. Attempts store HMAC-SHA256 of email and client address (keyed with `SESSION_SECRET`), never raw values.
- Demo users exist only when `DEMO_MODE=true` (the seed refuses otherwise); the demo password is shown only in demo mode.

## CSRF and origin

- Every state-changing request must come from our origin (`Origin` header, or `Sec-Fetch-Site: same-origin`).
- Authenticated mutations also need the session's CSRF token in `x-csrf-token` (constant-time compare). Login has no session yet, so it relies on the origin check + JSON-only body + `SameSite`.

## Headers

- Pages: per-request nonce CSP from `src/proxy.ts`: `default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic'; style-src 'self' 'nonce-…'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` (+ `upgrade-insecure-requests` on https). No inline scripts or style attributes of our own (the e2e suite fails on any CSP violation).
- API: `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `Cache-Control: no-store`.
- All responses: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy: same-origin`. No `X-Powered-By`.

## Data handling

- No PII in logs or audit events (audit `detail` holds IDs and keyed hashes only). No PII on-chain (payout leaves hold account, amount and index; the review digest is salted and the salt stays in the database).
- Server-only secrets (`SESSION_SECRET`, signer keys) live in `.env` (mode 600, git-ignored) and are never sent to the browser.
- Testnet only: the app refuses any `NEAR_NETWORK` other than `testnet`.

## Tests

`tests/unit/policy.test.ts` (matrix), `tests/integration/auth-api.test.ts` (login, lockout, origin/CSRF, logout, 401/403/404 on direct API calls), `tests/e2e/auth.spec.ts` (real browser: dialog keyboard behaviour, role landing, sign-out, direct page requests, query-parameter role spoofing, CSP).
