# Hosting plan for gajian.my.id: not pursued

Status: **not pursued (decided 10 Nov): local-only with a YouTube video.** Nothing was created or deployed; the plan below is kept for reference only. (Earlier status: plan only.) No accounts were created and nothing was deployed. Every step marked **Andre** needs his accounts, payment details or DNS access. Steps marked **agent** are prepared in the repository on request, then reviewed before anything goes live.

## Requirements

- **Public demo at https://gajian.my.id**, separate from this build server (this host runs a production system and must stay untouched).
- **Uptime:** at least until **18 Nov 2026 23:59 UTC** (results), ideally until **25 Nov 2026** (organizer Q-012: "a plus", kept up "to 2026-11-18, ideally 2026-11-25"). A local-only demo is accepted too; hosting is a plus, not a requirement.
- **What runs there:** the Next.js web app, the release worker (a second long-running process), and the SQLite database on a persistent disk. Both processes share the database file, so they must run on the **same machine**.
- **NEAR testnet only**, final vault `vault2.gajian-payroll.testnet`.

## Recommended host: Fly.io, one machine with a volume

Why:
- **Persistent volume** for SQLite, plus **one machine running two processes** (web + worker share the database file, as they do locally).
- **Custom domain with automatic TLS** (`fly certs add gajian.my.id`).
- **Encrypted secrets** (`fly secrets`), never written into the image or the repository.
- **Remote builds** (`fly deploy --remote-only`): the image is built on Fly's builders. Nothing runs Docker on this server, which the project rules forbid.
- **Small and disposable:** a `shared-cpu-1x` machine with 512 MB to 1 GB of RAM and a 1 GB volume is enough. Expect a few US dollars for three weeks. `fly apps destroy` removes everything afterwards.
- A region near the team: `sin` (Singapore). Judges are global; latency is not critical.

Alternatives considered:
- **Railway:** similar volumes, but the web and worker services would each need the database. One service with both processes works, but there is less control over the processes.
- **Render:** a disk attaches to a single service; same constraint, and the free plans sleep.
- **A small VPS (for example Hetzner CX22):** full control with systemd units for web and worker plus Caddy for TLS, but more to operate (OS updates, firewall).

Fly.io is the least operations for a two-week demo.

## What runs on the host

| Process | Command | Notes |
| --- | --- | --- |
| Web | `next start -H 0.0.0.0 -p 8080` behind Fly's proxy (HTTPS only) | `APP_BASE_URL=https://gajian.my.id`, secure cookies on HTTPS (already automatic) |
| Release worker | `node src/worker/index.ts` | Default 3 s interval; exits if its signer key is missing |
| Database | SQLite at `/data/gajian.sqlite` on the volume | Fresh demo database (`npm run demo:reset` logic) at first start; daily volume snapshots by Fly |

A small start script will run the migrations, start both processes and forward stop signals (agent, on request: `Dockerfile`, `fly.toml`, `scripts/start-hosted.sh`).

## Keys on the host

**Only restricted function-call keys, created for the host and never used elsewhere.** Never the master account `gajian-payroll.testnet`, never any full-access key, never the keys used on this build server.

| Role | Account | Key scope (receiver `vault2.gajian-payroll.testnet`) | Gas allowance |
| --- | --- | --- | --- |
| Maker | `maker.gajian-payroll.testnet` | `create_run, cancel_run, close_partial, start_release, pay_row` | 0.05 NEAR |
| Approver 1 | `approver1.gajian-payroll.testnet` | `approve, reject` | 0.05 NEAR |
| Approver 2 | `approver2.gajian-payroll.testnet` | `approve, reject` | 0.05 NEAR |
| Worker | `worker.gajian-payroll.testnet` | `start_release, pay_row` | 0.10 NEAR |
| Admin | `admin.gajian-payroll.testnet` | **not deployed** (recommended): the workflow stays fixed during judging, and the admin page shows the workflow read-only | none |

All values are set with `fly secrets` from a git-ignored file that is never printed. The keys are deleted on-chain after the event.

## What limits the damage if a host key leaks

- **Function-call keys cannot** transfer NEAR, deploy code, add keys or attach deposits. They can only call the listed vault methods, and gas spending stops at the allowance (0.05–0.10 NEAR).
- **The vault cannot be changed:** it has no access keys at all (`npm run judge:deployment`).
- **Payouts need the whole chain of roles.** With all host keys, an attacker could create, approve and pay a run, but only within the workflow caps and only from what the vault holds. Mitigations during hosting:
  1. Keep the vault balance small (for example ≤ 1 tUSDC) and top it up when needed.
  2. Lower the caps for the hosted period through an admin `update_workflow` from the build server (for example 0.10 tUSDC per row and 1 tUSDC per run). This is a new workflow revision, mirrored in the hosted database.
  3. Recipient allowlist in hosted mode (agent, on request): payouts only to the three demo recipients, so a public visitor cannot direct test tokens anywhere else.
- **tUSDC has zero value.** The realistic worst case is a drained test vault and a messy demo, not lost money. Recovery: delete the leaked keys, fund the vault again, run `demo:reset`.
- **Public demo password:** anyone can sign in with the published demo accounts. The caps, the allowlist and the small balance above are what keep that harmless. Failed sign-ins are rate-limited.

## How judges sign in

https://gajian.my.id → **Try the demo** → one of `maker@gajian.my.id`, `app1@gajian.my.id`, `app2@gajian.my.id`, `admin@gajian.my.id`, password `12345678` (as in the README). The landing page and the README say this is NEAR testnet with a zero-value test token. To see approvals in order, a judge uses two browsers (or a private window) for maker and approver.

## Steps (in order)

1. **Andre:** create a Fly.io account (payment card needed) and install `flyctl` on your own machine. A user-level install also works on this server: `curl -L https://fly.io/install.sh | sh`, no sudo. Then `fly auth login`.
2. **Andre → agent:** say "prepare hosting". The agent adds `Dockerfile`, `fly.toml` (app `gajian-demo`, region `sin`, volume `gajian_data` mounted at `/data`, HTTP checks on `/api/health`), `scripts/start-hosted.sh`, the hosted-mode options (admin read-only without an admin key, recipient allowlist), and `scripts/testnet/hosting-keys.sh`. That script creates the host's function-call keys and writes them to a git-ignored `.tmp/host-secrets.env` without printing them. All of this is reviewed and tested locally first.
3. **Andre:** approve the testnet transactions: the host keys (4 `add-key` transactions), optionally lower caps (1 admin transaction), and top up the vault (`node scripts/testnet/phase16.ts fund <amount>`).
4. **Andre:**
   ```sh
   fly apps create gajian-demo
   fly volumes create gajian_data --size 1 --region sin
   fly secrets import -a gajian-demo < .tmp/host-secrets.env    # SESSION_SECRET + host keys + public IDs
   fly deploy --remote-only -a gajian-demo
   ```
5. **Andre (DNS for gajian.my.id):** `fly certs add gajian.my.id -a gajian-demo`, then create the A and AAAA records it prints at the domain's DNS provider. Optionally add `www` as a CNAME. Wait until `fly certs show gajian.my.id` says the certificate is issued.
6. **Andre + agent:** smoke test at https://gajian.my.id:
   - `/api/health` returns `ok`;
   - sign in as each role;
   - one 0.01 tUSDC run through to Paid;
   - `npm run judge:verify` still passes.
7. **Andre:** add the URL to the README, `docs/X-POST.md` and `docs/SUBMISSION.md`. Add a free uptime check on `https://gajian.my.id/api/health` (for example UptimeRobot) that emails you.
8. **During judging:** `fly logs -a gajian-demo` for errors; top up the vault if it runs low.
9. **After 25 Nov 2026 (Andre):** `fly apps destroy gajian-demo`, remove the DNS records, and delete the host keys on-chain (the agent prepares `delete-keys` commands with their public keys).
