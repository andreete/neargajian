# Security model (app)

Version 2 · Phase 19 · 10 Nov 2026 (version 1: Phase 06). Contract-side rules are in `contracts/vault` and `docs/RECOVERY.md`; this file covers the web app.

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
| `recipients.manage` (directory: list, add, edit, deactivate/reactivate, testnet check, import) | no | no | yes |
| `settings.update` ("Pay registered recipients only") | no | no | yes |
| `assistant.use` (payroll assistant: preview, create a **draft** for oneself) | yes | no | no |

Responses: 401 without a session; 403 when the role can never use an endpoint or page; **404** for a run the caller may not see, so run IDs reveal nothing. Pages: no session → `/?signin=required` (the sign-in dialog opens); wrong role → 403 page (`forbidden()`).

## Sessions

- Random 256-bit token in the `sentfund_session` cookie: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` when `APP_BASE_URL` is https. The database stores only SHA-256(token).
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
- All responses: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera, geolocation, payment and USB off; microphone for our own origin only, for voice input), `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy: same-origin`. No `X-Powered-By`.

## Recipient directory: what it does and does not guarantee

- **"Pay registered recipients only" is enforced by the app and the approvers, not by the vault contract.** When it is on, the app rejects any uploaded or manual row that does not match an active recipient (same NEAR account) or is above that recipient's maximum, re-checks the whole draft on the server at submit time, and freezes the result into the submitted version (`run_versions.directory_check`, immutable by trigger). Approvers see "Every row matched the recipient directory" on the run page, and a warning if a recipient was deactivated or its maximum lowered since submission.
- The vault does not know the directory. It enforces the approvals, the per-row and per-run caps, the committed rows (Merkle root) and the vault balance. A caller with a maker signer key outside the app could commit rows that are not in the directory; the approvers are the control for that case. A contract-level allowlist would need a contract change (frozen, D-051, and the vault cannot be redeployed: it has no access key).
- Directory changes are admin-only, logged with who, when and field-by-field before/after values (`recipient_events`, append-only by trigger), plus a PII-free audit event. Recipients are never deleted (trigger) and a recipient's NEAR account never changes (trigger).
- The "Ready to receive tUSDC" check is read-only testnet RPC (`view_account`, `storage_balance_of` on tUSDC), 5 s timeout, advisory only.

## Payroll assistant

- Maker only (`assistant.use`), same-origin + CSRF like every mutation. It can only **create a draft owned by the signed-in maker** from the maker's own preview (once, within 30 minutes; the directory is resolved again at creation). The assistant module has no access to submit, approve, release, the workflow or directory changes; the boundary tests call its two routes as every other role (403) and check that no chain call happens.
- The model (Claude API, official SDK) receives only the maker's messages and the list of division names. Never NEAR accounts, emails, phones, maximums or other directory data. The app, not the model, picks the recipients (active directory entries by division or exact name), checks that the amount was typed by the maker (never guessed), is tUSDC, and is within the per-row cap, each recipient's maximum and the run cap. Requests containing a NEAR account or another currency are refused before the model is called; a model answer naming someone outside the directory is refused (prompt-injection tests with a deliberately fooled stub).
- `ANTHROPIC_API_KEY` is read from `.env` on the server only, never logged, returned to a browser or committed; without it the assistant is off. Requests: 20 s timeout, one retry, at most 20 per maker per hour (counted in `assistant_requests`, which stores the maker's text and the model's structured answer, no directory data).
- Voice input uses the browser's own speech recognition: the audio goes from the browser to the browser vendor's service, not to SentFund. `Permissions-Policy: microphone=(self)` allows it on our pages only.

## Identity checks: KTP + face (Phase 21)

KTP numbers and face images are specific personal data under Indonesia's UU PDP (Law 27/2022). Decided with Andre on 10 Nov 2026 (D-117):
- **Admin only** (`requireMutation(…, ['admin'])` on all three routes; same-origin + CSRF). The boundary tests call each route as maker and approver (403, no state change).
- **Retention: results only.** Images are decoded in memory (sharp, ≤ 8 MB each, ≤ 50 megapixels, EXIF rotation) and discarded after the check. Stored: every check's result (`identity_checks`, append-only by trigger), the NIK **masked** (first and last four digits) and an HMAC-SHA-256 of it keyed with `SESSION_SECRET` (duplicate detection only; a new secret makes old hashes unmatched, never wrong). Never the NIK, the KTP image or the face photo. Audit events hold IDs and the outcome only.
- **Faces never leave the server.** Before the KTP goes to the KTP reader (Claude API), every face the detector finds is covered with a solid block. The reader sees the card's text: NIK, name, date and place of birth, sex, address. For a real employee that is a transfer of personal data to Anthropic as a processor: the operator of a private copy needs a lawful basis (for example the employee's consent) and should use an API key under an organisation agreement. Face comparison runs only on this server (OpenCV YuNet + SFace, ONNX Runtime, CPU).
- **Public demo: synthetic specimens only.** In hosted mode the upload and review routes answer 403 `hosted_read_only`; the specimen route runs as a **dry run** (logged, status unchanged), at most 100 reader calls a day. Specimen cards are marked SPECIMEN, use the non-existent kecamatan code 99, and the faces are AI-generated public-domain images (Wikimedia Commons, sources in `public/specimens/manifest.json`).
- **Caps:** 30 checks per admin per hour; reader timeout 45 s, one retry; the KTP text is data, never an instruction (system prompt + a strict tool schema; the app re-validates every field).
- **Gate:** "Pay identity-verified recipients only" (on in the demo) refuses a submit that pays anyone not verified, re-checked on the server at submit and frozen into the version (`directory_check.identity`). App and approver guardrail, not a vault rule (the vault cannot change).
- **Limits:** not a Dukcapil registry check, not liveness detection (a printed photo of the right person can pass), and the reader's remarks about tampering are a visual opinion, not forensics. "Needs review" puts a person in the loop; a manual approval needs a reason and is refused if the NIK is already verified for someone else.

## Hosted demo mode (Phase 20)

The public demo at https://sentfund.my.id uses public demo passwords, so `HOSTED_DEMO=true` narrows what anyone signed in can do. Each rule is enforced on the server; the UI only mirrors it.
- **Keys:** its own restricted function-call keys for maker, approver 1, approver 2 and worker, least privilege:
  - maker: only `create_run`, `cancel_run`;
  - worker: `start_release`, `pay_row`;
  - small NEAR allowances; created and deleted by `scripts/testnet/hosting-keys.sh`.
  - Never the admin, master or a full-access key: `loadConfig` refuses to start with `ADMIN_SIGNER_PRIVATE_KEY` in hosted mode.
- **Payees:** a submit is refused unless every row pays an active directory recipient that is "Ready to receive tUSDC" within its maximum (`hostedSubmitProblem`, checked before anything is frozen or signed). The directory and its setting are read-only (403 `hosted_read_only`); without the admin key the workflow page is read-only.
- **Exposure caps:** the vault is topped up to at most 2 tUSDC (`phase16.ts top-up` refuses more); the assistant has a separate Anthropic key with a monthly spend limit, 20 requests per maker per hour and 200 per day in total.
- **Accounts:** the per-email sign-in lockout counts per email and client, so a visitor cannot lock a shared demo account for everyone (the per-client limit stays).
- **Kill switch** `HOSTED_READONLY=true`: every mutation except sign-out answers 503 `read_only`, the worker pauses, a banner says so.
- The container binds `0.0.0.0:$PORT` behind Railway's TLS edge (only inside the container; this development host still binds 127.0.0.1 only).

## Data handling

- No PII in logs or audit events (audit `detail` holds IDs and keyed hashes only). No PII on-chain (payout leaves hold account, amount and index; the review digest is salted and the salt stays in the database).
- Server-only secrets (`SESSION_SECRET`, signer keys, `ANTHROPIC_API_KEY`) live in `.env` (mode 600, git-ignored) and are never sent to the browser. `scripts/testnet/write-env.mjs` keeps every value it does not manage when it rewrites `.env`.
- Testnet only: the app refuses any `NEAR_NETWORK` other than `testnet`.

## Tests

`tests/integration/boundaries.test.ts` (every API route incl. the Phase 19 directory, settings and assistant routes, refused for every wrong principal with no state change), `tests/integration/directory.test.ts`, `tests/integration/assistant.test.ts`, `tests/unit/policy.test.ts` (matrix), `tests/integration/auth-api.test.ts` (login, lockout, origin/CSRF, logout, 401/403/404 on direct API calls), `tests/e2e/auth.spec.ts` (real browser: dialog keyboard behaviour, role landing, sign-out, direct page requests, query-parameter role spoofing, CSP).
