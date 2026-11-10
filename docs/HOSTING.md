# Hosting the public demo on Railway: runbook

Status: **ready, not live.** Decided 10 Nov 2026 (D-109): SentFund goes online at submission and stays up until at least **25 Nov 2026**. Nothing has been created, deployed or added on-chain yet.

**Phase 21 update (10 Nov 2026, D-121):** the product is **SentFund**, the repository Railway deploys from is the private **`discoverateagency-ops/sentfund`**, the domain **`sentfund.my.id`** is registered at **Sumopod**, and its DNS moves to **Cloudflare (free)**. Vercel, Cloudflare Pages/Workers and Supabase cannot host this app: it needs an always-on Node server plus the release worker, a SQLite file on a persistent disk, and native modules (better-sqlite3, onnxruntime, sharp). Railway Hobby (about $5 per month) runs it; Cloudflare only answers DNS. **Section 0** is the short path where Andre creates the accounts and the agent does the rest by API. Each step below says who does it: **Andre** (needs your accounts, card or DNS) or **agent** (only after your explicit yes).

Railway details were checked against Railway's official documentation on **10 Nov 2026** (sources at the end). Railway changes its dashboard often: if a label differs, look for the same word nearby.

**What runs there:** one Railway service built from this repository's `Dockerfile` (Node 26.13.0 pinned, `better-sqlite3` compiled inside the image). `scripts/hosted-start.sh` applies the database migrations, then starts the web app **and** the release worker in that one service. If either process stops, the whole service stops, and Railway restarts it. The SQLite database lives on a Railway **volume** at `/data`. `HOSTED_DEMO=true` turns on the public-demo guardrails (below).

**What visitors can and cannot do** (`HOSTED_DEMO=true`):
- A banner on every page: public demo on NEAR testnet, zero-value test token, shared demo data.
- Anyone can sign in with the public demo passwords and use the maker and approver flows.
- The host has **its own** restricted keys for the maker, approver 1, approver 2 and the worker. It never holds the admin, master or any full-access key: the service refuses to start if `ADMIN_SIGNER_PRIVATE_KEY` is set. So the workflow page is read-only.
- The recipient directory is read-only, so nobody can add payees.
- A run can be submitted only if every recipient is in the directory and "Ready to receive tUSDC". Payouts can therefore only reach our three live recipients. The 1,000-row sample still uploads and previews; submitting it is refused with a clear message.
- The vault holds at most 2 tUSDC (step 9).
- The payroll assistant uses a separate Anthropic key with a monthly spend limit, plus 20 requests per maker per hour and **200 per day in total**.
- Kill switch: `HOSTED_READONLY=true` makes the whole site read-only with a banner, and the worker pauses (step 10).

---

## 0. Short path (Phase 21): Andre makes accounts, the agent does the rest

**Andre (about 20 minutes, once):**
1. **Cloudflare (free):** https://dash.cloudflare.com → sign up → **Add a domain** → `sentfund.my.id` → plan **Free**. Cloudflare shows **two nameservers** (like `xxx.ns.cloudflare.com`).
2. **Sumopod:** your domain `sentfund.my.id` → **Nameservers** (or "DNS / Name Server") → choose custom nameservers → replace the existing ones with **exactly those two Cloudflare nameservers** → save. It takes minutes to a few hours; Cloudflare emails you when the site is **Active**. Do not add any DNS record yourself.
3. **Cloudflare API token:** My Profile → **API Tokens** → **Create Token** → template **Edit zone DNS** → Zone Resources: *Include → Specific zone → sentfund.my.id* → Create. Copy it.
4. **Railway:** https://railway.com → **Login with GitHub** → **Hobby** plan with a card (step 1.1 below). Then connect GitHub: in Railway, **New Project → Deploy from GitHub repo → Configure GitHub App**, choose the org **discoverateagency-ops** and **Only select repositories → `sentfund`**, then close the dialog without deploying (the agent creates the project). Then **https://railway.com/account/tokens** → **Create token** (your personal workspace). Copy it.
5. **A second Anthropic key** with a monthly spend limit (step 1.3 below). Copy it.
6. On this server, add the three values to `.env` yourself (never in chat; the agent never prints them):
   ```sh
   nano /home/neargajian/near-gajian/.env
   # add at the end:
   RAILWAY_API_TOKEN=...
   CLOUDFLARE_API_TOKEN=...
   HOSTED_ANTHROPIC_API_KEY=...
   ```
7. Tell the agent: **"deploy"**.

**Agent (by script/API, after "deploy"):** add the host keys on testnet (step 2), push `main` to `release` on `discoverateagency-ops/sentfund` after a green CI, create the Railway project, service (branch `release`, Wait for CI, health `/api/health`, 1 replica), volume `/data`, daily backups and the variables (step 4), add the custom domain `sentfund.my.id` and write its **CNAME** (flattened at the apex) and **TXT** records into Cloudflare by API, wait for the certificate, run the smoke test (step 6) and record it in `docs/TESTNET.md`.

**Afterwards (continuous deployment):** every release is `git push sentfund main:release` after CI is green on `main`; Railway builds and deploys it by itself (Wait for CI). Nothing else to click.

## 1. What Andre prepares (before anything else)

1. **Railway account, Hobby plan, with a card.** Go to https://railway.com → **Login** → sign in with GitHub. Then open **Account → Plans** (or **Billing**), choose **Hobby** and add a card.
   - Hobby is $5 per month. It includes $5 of usage and needs a post-paid card; prepaid credit is no longer accepted.
   - The trial plan is too small (0.5 GB volume, 1 GB RAM) and allows only 1 custom domain.
2. **GitHub access limited to this repository.** When Railway asks to install its GitHub app, choose **Only select repositories** → `discoverateagency-ops/sentfund` (the org's installation; Phase 21). You can check or change this later at https://github.com/settings/installations → **Railway** → **Configure**.
3. **A second Anthropic API key with a monthly spend limit** (not the one in this server's `.env`):
   - At https://console.anthropic.com create a separate **Workspace**, for example `sentfund-hosted`.
   - Set that workspace's **monthly spend limit**, for example $20. The 200-requests-per-day cap bounds the use too: about $0.02 per request with `claude-opus-5-5`, so at most about $4 per day.
   - Create an **API key inside that workspace**. Keep it in your password manager. You will paste it into Railway only (step 4), never into chat.
4. **The domain `sentfund.my.id`, with working DNS.** Registered at **Sumopod** (Andre, 10 Nov). Checked at 06:00 UTC on 10 Nov 2026: public resolvers (8.8.8.8, 1.1.1.1) answer **SERVFAIL**, so the domain is delegated to nameservers that do not answer yet. Setting the Cloudflare nameservers at Sumopod (section 0) fixes this. Before step 5:
   - register `sentfund.my.id` at a `.my.id` registrar (PANDI-accredited), or finish the registration if it is pending;
   - pick where its DNS lives. **Recommended: Cloudflare (free plan)**: add the site in Cloudflare, then set the two Cloudflare nameservers at your registrar. Cloudflare allows a CNAME at the apex (CNAME flattening), which Railway needs for `sentfund.my.id` itself. Vercel DNS works too (ALIAS at the apex).
   - When `dig +short NS sentfund.my.id` on any machine prints the nameservers you chose, the domain is ready for step 5.

## 2. Agent's on-chain step: the host keys (only with Andre's yes)

When you say "add the host keys", the agent runs, on this server:

```sh
scripts/testnet/hosting-keys.sh add --yes
```

- It creates four **new** keypairs and adds them on testnet, each signed by its own role account (4 transactions, about 0.002 NEAR):

  | Account | Methods on vault2 | Allowance |
  | --- | --- | --- |
  | `maker.gajian-payroll.testnet` | `create_run`, `cancel_run` | 0.1 NEAR |
  | `approver1` and `approver2` | `approve`, `reject` | 0.05 NEAR each |
  | `worker` | `start_release`, `pay_row` | 0.25 NEAR |

- These are not the keys this server uses. Never the admin, master or a full-access key.
- The private keys go only to `/home/neargajian/near-gajian/.hosting/host-keys.env` (mode 600, git-ignored) and are never printed.
- The agent records the public keys and transaction IDs in `docs/TESTNET.md`. Check them with `scripts/testnet/hosting-keys.sh status` (read-only).

How you get the four values into Railway without them passing through chat: open **your own SSH terminal** to the server (not this chat) and run:

```sh
sudo -u neargajian cat /home/neargajian/near-gajian/.hosting/host-keys.env
```

Copy each value straight into Railway (step 4). Close the terminal afterwards.

## 3. Create the Railway project from the `release` branch

Railway deploys **only from the `release` branch**. `main` stays the working branch. Nothing is pushed to `release` without Andre's explicit yes.

1. The agent (with your yes) creates the branch from the tested `main`: `git push origin main:release`. First check GitHub → **Actions**: the latest `main` run is green, including the job **Hosted image**, which builds this Dockerfile on GitHub's runner and boots it in hosted demo mode (health, banner, first-boot reset, clean stop, migrations-only second boot, service stops when the worker dies).
2. In Railway: **New Project** → **Deploy from GitHub repo** → `discoverateagency-ops/sentfund`. Railway finds the root `Dockerfile` and builds with it automatically.
3. Open the new service → **Settings**:
   - **Source → Branch**: choose `release`. Railway calls this the trigger branch.
   - **Wait for CI**: turn it **on** if offered. The commit on `release` is the same commit that CI already tested on `main`; a failed CI run skips the deploy.
   - **Deploy → Healthcheck Path**: `/api/health`. The default timeout is 300 s; leave it.
   - **Deploy → Restart Policy**: **On Failure** (the default; at most 10 restarts on Hobby is fine).
   - **Deploy → Replicas**: 1. A service with a volume cannot have replicas.
   - Leave **Custom Start Command** and **Custom Build Command** empty: the Dockerfile's `CMD` (`sh scripts/hosted-start.sh`) is used.
   - If you see **Serverless** or **App sleeping**: keep it **off**. The worker must keep running.
4. **Volume**: right-click on the project canvas (or press `⌘K` / `Ctrl+K`) → create a **Volume** → attach it to the `sentfund` service → **Mount path `/data`**.
   - The default size of 5 GB is plenty: the database is about 1 MB.
   - Volumes are mounted when the container starts, not during the build. That is why migrations run in the start script, not in a pre-deploy command.
   - The image runs as root, so `RAILWAY_RUN_UID` is not needed.
5. **Backups** (service → **Backups** tab): add a **Daily** schedule (kept 6 days). Make a **manual backup** before every release and every reset. Restore: **Backups** → the dated backup → **Restore** → review the staged change → **Deploy**. The restore mounts a new volume; the old one is kept but unmounted.
6. Optional reference: `.railway/railway.ts` records the same settings as Railway Infrastructure as Code. `railway.json` can no longer be used for new services. The file is optional and not applied; the dashboard steps here are what counts.

## 4. Variables (service → **Variables** → **Raw Editor**)

Paste values **only into Railway**, never into chat, a ticket or a file in the repository. The public values can be pasted as a block:

```
NODE_ENV=production
PORT=8080
HOSTED_DEMO=true
HOSTED_READONLY=false
DEMO_MODE=true
NEAR_NETWORK=testnet
NEAR_RPC_URL=https://rpc.testnet.fastnear.com
APP_BASE_URL=https://sentfund.my.id
DATABASE_URL=file:/data/sentfund.sqlite
VAULT_CONTRACT_ID=vault2.gajian-payroll.testnet
TUSDC_CONTRACT_ID=tusdc.gajian-payroll.testnet
MAKER_ACCOUNT_ID=maker.gajian-payroll.testnet
APPROVER1_ACCOUNT_ID=approver1.gajian-payroll.testnet
APPROVER2_ACCOUNT_ID=approver2.gajian-payroll.testnet
WORKER_ACCOUNT_ID=worker.gajian-payroll.testnet
ADMIN_SIGNER_ACCOUNT_ID=admin.gajian-payroll.testnet
ASSISTANT_MODEL=claude-opus-5-5
DEMO_RESET_TOKEN=2026-11-13
```

(`APP_BASE_URL` is `https://www.sentfund.my.id` only if your DNS cannot point the apex, step 5.)

The secrets, one per line, each value from where the table says:

| Variable | Where the value comes from |
| --- | --- |
| `SESSION_SECRET` | New random value, 32+ characters: on your laptop `openssl rand -hex 32`, or your password manager's generator |
| `MAKER_SIGNER_PRIVATE_KEY` | `.hosting/host-keys.env` (step 2), your own SSH terminal |
| `APPROVER1_SIGNER_PRIVATE_KEY` | same file |
| `APPROVER2_SIGNER_PRIVATE_KEY` | same file |
| `WORKER_SIGNER_PRIVATE_KEY` | same file |
| `ANTHROPIC_API_KEY` | the **second** Anthropic key from step 1.3 |

**Never set `ADMIN_SIGNER_PRIVATE_KEY`.** The service refuses to start with it ("the public demo never holds the admin key").

Then click **Deploy**: Railway stages variable changes until you deploy them.

- **First deploy:** the build takes a few minutes, mostly compiling `better-sqlite3` and `next build`.
- **First boot:** the empty volume triggers `demo:reset --with-testnet-history`: demo users, the vault's workflow, the recipient directory with a read-only testnet check of the three live recipients, and the real Phase 02/04 testnet runs, so visitors see paid runs with explorer links right away.
- **Logs** (service → **Deployments** → the deploy → **View logs**): `recipient check on testnet: Ready to receive tUSDC` three times, then `"event":"started"` from `hosted-start` and the worker.
- The deploy turns green when `/api/health` answers.

## 5. Custom domain

Railway: service → **Settings** → **Networking / Public Networking** → **+ Custom Domain**.
- Enter the domain. **Target port: 8080**.
- Railway shows two records, a **CNAME** (target like `xxxxxx.up.railway.app`) and a **TXT** for verification. **Both are required**; without the TXT the domain answers 404.
- Hobby allows 2 custom domains per service.

The demo runs at the apex **`sentfund.my.id`**. A plain CNAME is not allowed at an apex, so the record type depends on where the DNS lives (step 1.4):

| Where the DNS is | Record for `sentfund.my.id` | Verification |
| --- | --- | --- |
| **Cloudflare (recommended)** | **CNAME**, name `@`, target the value Railway shows (`xxxxxx.up.railway.app`). Cloudflare flattens it. The proxy (orange cloud) can stay on; then set **SSL/TLS → Full**, not "Full (strict)" | **TXT**, the name and value Railway shows |
| **Vercel DNS** | **ALIAS**, name empty (the apex), the target Railway shows | **TXT**, name and value Railway shows (enter only the part before `.sentfund.my.id`) |
| **A registrar panel without ALIAS/flattening** (GoDaddy, Hostinger, NameSilo and others listed by Railway) | not possible at the apex: move the nameservers to Cloudflare, or use `www.sentfund.my.id` (a normal CNAME `www`) and set `APP_BASE_URL` to that | **TXT** as Railway shows |

Railway issues the Let's Encrypt certificate, usually within an hour of the records resolving; DNS can take up to 72 hours worldwide. Done when the domain shows a green check. Then make sure `APP_BASE_URL` matches the domain exactly (https, no trailing slash) and **Deploy**.

## 6. Smoke test (Andre, about 10 minutes)

1. `curl -s https://sentfund.my.id/api/health` returns `{"status":"ok", … "db":"ok","hostedDemo":true,"readOnly":false}`.
2. Open the site: the purple "Public demo on NEAR testnet" banner is on the landing page.
3. **Each role signs in** (password `12345678`), each in its own browser window (README "Try it online"). Expect:
   - `maker@sentfund.my.id` → "My runs" with the testnet runs;
   - `app1@` and `app2@` → "Review queue";
   - `admin@` → workflow page "Read-only on this copy", Recipients read-only.
4. **One 0.01 run to Paid**:
   - Maker: **New run** → title `Hosted smoke test` → Upload a file → `docs/hosting/smoke-test-0.01.csv` (Emma Clark, 0.01) → Continue to review → **Submit 0.01 tUSDC for approval**.
   - Approver 1, then approver 2: **Approve**.
   - Within a minute the run shows **Paid 1 of 1**. Click the payout link: NearBlocks shows `pay_row` signed by `worker.gajian-payroll.testnet` and 0.01 tUSDC to `recipient1`.
5. Negative check: upload `public/templates/sentfund-payroll-sample-1000.csv` → review → Submit is refused with "Public demo: a run can only pay recipients … Nothing was sent."
6. On this server: `npm run judge:verify` still ends with `All testnet evidence checks passed.` The agent adds the smoke run's transactions to `docs/TESTNET.md`.

## 7. Releasing an update (with Andre's yes)

1. On this server, all checks pass on `main` (`npm run lint && npm run typecheck && npm test`, build, browser tests) and the commit is pushed; GitHub → **Actions** shows the run green, including **Hosted image**.
2. Railway → **Backups** → manual backup.
3. The agent runs `git push origin main:release` (only with your yes). Railway builds and deploys.
4. A service with a volume has a short downtime on each deploy (old and new deployments cannot mount the volume at the same time).
5. If the new deploy fails its health check, Railway keeps the previous one running.

## 8. Reset the demo data

Railway → Variables → set `DEMO_RESET_TOKEN` to a **new** value (for example `2026-11-20`) → **Deploy**.
- At start, the old database is **moved** to `/data/backups/` (never deleted) and a fresh demo database is created, as on first boot.
- The same token value never resets twice.
- Take a manual Railway backup first if you want to keep the old data outside the volume too.

## 9. Keep the vault small (at most 2 tUSDC)

Vault2 holds 1.94 tUSDC on 10 Nov. To top it up to at most 2 tUSDC (agent, with your yes, on this server):

```sh
node scripts/testnet/balances.mjs                   # vault2 line: current tUSDC
node scripts/testnet/phase16.ts top-up 2.00          # funds only the difference; refuses targets above 2
```

At 0.01–0.10 tUSDC per payout, 2 tUSDC covers 20–200 payouts.

## 10. Kill switch

Railway → Variables → `HOSTED_READONLY=true` → **Deploy**.
- Every page shows "Read-only: the SentFund team has paused this demo".
- Sign-in and browsing still work; every change is refused, and the worker sends nothing.
- Set it back to `false` → **Deploy** to resume.
- Faster in an emergency: service → **Settings** → remove the custom domain, or stop the deployment.

## 11. Expected cost

| Item | Estimate |
| --- | --- |
| Railway Hobby | **$5 per month**, which includes $5 of usage. One small service (about 0.3–0.4 GB RAM at $10 per GB-month, a little CPU at $20 per vCPU-month, a 1 MB database at $0.15 per GB-month, light egress at $0.05 per GB) should stay within the included $5, so about **$5 in total** for the period. Builds are not charged |
| Anthropic | Your spend limit, for example $20. The 200-per-day cap bounds it to about $4 per day with `claude-opus-5-5`. `ASSISTANT_MODEL=claude-haiku-5-5` is much cheaper if you prefer |
| Testnet NEAR | Under 0.01 NEAR per paid run; allowances cap each key (step 2) |

## 12. Shutdown after 25 Nov

1. Kill switch on (step 10), or stop the deployment.
2. **Agent, with your yes:** `scripts/testnet/hosting-keys.sh delete --yes`. It deletes exactly the four host keys on testnet, removes the private file, and keeps the public list. Then `hosting-keys.sh status` shows only this server's keys, and the agent records the transactions in `docs/TESTNET.md`.
3. Railway: project → **Settings** → **Delete project**. This removes the service, the volume and its backups; make a last manual backup first only if you want one.
4. DNS (Cloudflare or wherever `sentfund.my.id` lives): delete the apex record pointing at Railway and the Railway TXT record.
5. Anthropic: delete the hosted key, or the `sentfund-hosted` workspace.
6. GitHub: https://github.com/settings/installations → Railway → remove access to the repository (or uninstall).
7. Railway: cancel the Hobby plan if nothing else uses it.
8. Remove the `release` branch if you like: `git push origin --delete release` (agent, with your yes).

---

## Sources (checked 10 Nov 2026)

- Railway Config as Code (deprecated; "New services cannot opt into Config as Code"): https://docs.railway.com/reference/config-as-code, https://docs.railway.com/infrastructure-as-code, https://docs.railway.com/infrastructure-as-code/reference
- Dockerfiles (root `Dockerfile` used automatically): https://docs.railway.com/builds/dockerfiles
- Volumes (one per service, no replicas, mounted at start not build, root, downtime on redeploy, 5 GB on Hobby): https://docs.railway.com/reference/volumes, https://docs.railway.com/volumes
- Backups (manual, daily/weekly/monthly schedules, restore): https://docs.railway.com/volumes/backups
- Healthchecks (2xx, default 300 s, deploy time only, `PORT`, `healthcheck.railway.app`): https://docs.railway.com/guides/healthchecks
- Restart policy (On Failure default, 10 restarts): https://docs.railway.com/deployments/restart-policy
- GitHub autodeploys (trigger branch, Wait for CI): https://docs.railway.com/deployments/github-autodeploys
- Custom domains (CNAME + TXT, apex via CNAME flattening/ALIAS, Cloudflare Full, 2 per service on Hobby, certificates): https://docs.railway.com/networking/domains/working-with-domains
- Pricing (Hobby $5 including $5 usage, resource prices, card required): https://docs.railway.com/pricing/plans
- Vercel DNS (ALIAS valid at the apex, CNAME not): https://vercel.com/docs/domains/managing-dns-records
- Cloudflare CNAME flattening at the apex: https://developers.cloudflare.com/dns/cname-flattening/
