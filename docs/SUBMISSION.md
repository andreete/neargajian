# Submission checklist (NEAR HACKATHON)

Source: the live organizer guide https://nearhackathon.com/HACKATHON.md, re-read on **9 Nov 2026** (the page shows no version number; it says to re-read it before submitting because "dates and rules may change"). Re-read it again on the day you submit.

## Deadlines

| Event | UTC | WIB (UTC+7) |
| --- | --- | --- |
| **Submission deadline (development ends)** | **2026-11-14 23:59** | **2026-11-15 06:59** |
| Repository must be public by | 2026-11-14 23:59 | 2026-11-15 06:59 |
| Judging starts | 2026-11-16 00:00 | 2026-11-16 07:00 |
| Results announced by | 2026-11-18 23:59 | 2026-11-19 06:59 |
| **Planned submission (our own target)** | **2026-11-13 (Friday)** | |
| Hosted demo (Q-012, "a plus") kept up | until at least **2026-11-25** (`docs/HOSTING.md`) | |

Submissions are accepted only during the development phase. Changes after submitting go through the organizers' request-changes page, not a second submission. A repository can be submitted only once.

## Requirements and status

Everything under "Andre" is yours to do. The agent does not make the repository public, tag, post or submit.

| # | Requirement (organizer guide) | Status | Owner |
| --- | --- | --- | --- |
| 1 | Public repository, open to judges through judging | **Open**: private now | **Andre** |
| 2 | LICENSE file (Q-014; any license) | Done: MIT `LICENSE` | — |
| 3 | Reproducible README with "do X, see Y" steps (section 1) | Done: README "For judges" (`npm run judge:verify`: quick by default, about 5 minutes; `-- --full` re-checks every transaction, about an hour). Also README "Roadmap: from demo to pilot" (`docs/roadmap/`: gap analysis, QA Part A results, the Milestone 1 plan; planned, not built) and the key inventory (`docs/KEY-INVENTORY.md`) | — |
| 4 | Pre-hackathon diff: a dedicated branch or tags, plus a README section (Q-003) | **There is no pre-hackathon code, so no `pre-hackathon` tag** (decided 10 Nov). README "Hackathon window and diff" says so. **Tag open**: only `git tag hackathon-submission <final commit>` then `git push origin hackathon-submission` | **Andre** |
| 5 | Code from the 2026-10-19 announcement onward (Q-001); disclose pre-hackathon work (Q-002) | Done: all code written from 9 Nov 2026; first commit `ba205f7` is planning documents only (README) | — |
| 6 | List AI-generated code and third-party libraries in the README (Q-005) | Done: README "AI use" and "Third-party software" | — |
| 7 | If one person enters two projects, each README names the other (Q-015) | **Open (Q-015)**: Andre to confirm: only SentFund? If there is a second project, add its name to the README | **Andre** |
| 8 | Demo post on X by a human: says "built at NEAR HACKATHON", tags @NEARProtocol and #NEARHackathon, attaches the video or screenshots (section 2) | Draft in `docs/X-POST.md` (275/280 characters); **posting open** | **Andre** |
| 9 | Demo: local-only is accepted with public repo + reproducible README + X post with a video; "screenshots are not enough when judges cannot open the demo"; hosting is a plus (Q-012) | **Hosted demo on Railway + YouTube video** (decided 10 Nov, D-109). Hosting **live** at https://sentfund.my.id since 10 Nov 2026 (runbook `docs/HOSTING.md`); the current release is **`f25e00b`** (Phase 26, 12 Nov 2026; read-only hosted check 21 passed). Feature freeze: no new release before the submission (D-150); later `main` commits change docs and screenshots only. **Video open**: `docs/VIDEO.md` (record on the hosted site, locally as a fallback), upload to YouTube | **Andre** |
| 10 | Submission form: project name (2–80 characters) | Suggested: `SentFund` | **Andre** |
| 11 | Team lead's name (2–80 characters) | **Andre** | **Andre** |
| 12 | Contact email (≤ 160 characters; at most 2 submissions per email) | **Andre** | **Andre** |
| 13 | Team size: one of `1`, `2 - 4`, `4 - 6`, `6 - 8`, `8+` | `2 - 4` (3 people per the kickoff) | **Andre** |
| 14 | Tracks (one or more track IDs; one submission per project) | `realworld` (Real-World Money) | **Andre** |
| 15 | **NEAR payout account: a mainnet named account or a 64-character implicit account** (prizes paid in NEAR, Q-016) | **Open**: your mainnet address (never a testnet account; do not put it in the repository) | **Andre** |
| 16 | Repository link (public, unique) | `https://github.com/discoverateagency-ops/sentfund` once public (D-121; Andre confirms which repository is made public) | **Andre** |
| 17 | Demo post link (public) | **Open**: the X post URL (the post links the repository, the video and the hosted demo) | **Andre** |
| 18 | Project description (20–2,000 characters: problem, product, NEAR's role) | Draft below | **Andre** to review |
| 19 | Consent to the contact notice | **Andre** | **Andre** |

Notes from the guide that apply to us:
- Testnet-only projects are eligible for all tracks (Q-010).
- No integration is mandatory; a custom NEAR contract that fits the track is enough (Q-011).
- AI screening by Claude Code and Codex comes before the human jury and does not decide alone (Q-017). The README is written for that.
- Track hints (not requirements): stablecoins, NEAR Intents, meta transactions. We use a test stablecoin on testnet; Intents have no testnet (Q-007).

## Draft project description (for the form: 1,695 of 2,000 characters)

```
SentFund is payroll with approvals that a NEAR contract enforces. A finance team uploads a payroll file (up to 1,000 rows), enters rows by hand, or asks a payroll assistant ("pay the Sales division 0.05 each"), which drafts only from the admin's recipient directory; every row is validated against the directory and the caps, and an invalid file is rejected with every problem listed. The maker submits an immutable version: the app registers a Merkle commitment of the exact accounts and amounts in a custom vault contract. One or two approvers sign off, in sequence or in parallel, as the admin configured. The vault then pays each wallet in its own transaction, but only for an approved run, only the committed amounts, only once per row, and only from funds it holds; otherwise the run waits as "Awaiting funding". Accounting gets the same payouts as one consolidated entry or one entry per recipient, with matching CSV exports, and each paid time is the payout's block time. Employees can also take a Payroll Advance, a salary advance repaid like a loan: up to 300% of monthly net pay, a 2% fee at payout, six equal instalments deducted from later payrolls, with explicit consent; it is paid as an ordinary one-row run through the same contract-enforced approvals, and the next payroll commits the net pay on-chain. Built and rehearsed on NEAR testnet with a test token; the vault has no access keys, so its code cannot change, and every claim is re-checkable from the repository with a read-only verifier (its quick check takes about five minutes). The repository also holds the plan from demo to pilot (planned, not built): a gap analysis, QA results and an inventory of every access key.
```

## Order of work (10 → 25 Nov)

1. Done: hosting readiness (Phase 20).
2. Done: Andre's accounts: Railway Hobby with a card, GitHub access to this repository only, a second Anthropic key with a monthly spend limit, the domain choice (`docs/HOSTING.md` step 1).
3. Done (live 10 Nov): host keys (agent, with Andre's yes) and go live: `release` branch, Railway project, variables, domain, smoke test (`docs/HOSTING.md` steps 2–6).
4. Human QA on the hosted site (`docs/QA-HANDOFF.md`); QA Part A automated in Phase 26 (`docs/roadmap/qa-part-a-results.md`); the human items are Andre's to-do in `docs/NEXT-STEPS.md`.
5. Done: fixes, released with Andre's yes; last release `f25e00b` (12 Nov). Feature freeze since (D-150).
6. Video, recorded on the hosted site (`docs/VIDEO.md`), uploaded to YouTube.
7. Repository public and the `hackathon-submission` tag.
8. X post (`docs/X-POST.md`).
9. Submission by **Friday 13 Nov 2026** (deadline 2026-11-14 23:59 UTC).
10. Online until at least 25 Nov 2026; kill switch ready (`docs/HOSTING.md` step 10).
11. Shutdown after 25 Nov: host keys deleted on-chain, Railway service removed, DNS records removed (`docs/HOSTING.md` step 12).

## Final steps on submission day (Andre)

1. Re-read https://nearhackathon.com/HACKATHON.md for changes.
2. Make sure the last commit is pushed and CI is green.
3. Create and push the one tag (row 4): `git tag hackathon-submission <final commit> && git push origin hackathon-submission`. The final commit is the last `main` commit; the live site runs `f25e00b`, and every `main` commit after it changes documentation and screenshots only, no code (check with `git diff --stat f25e00b main`).
4. Make the repository public (GitHub → Settings → General → Danger Zone → Change visibility).
5. Upload the video to YouTube; post on X with `docs/X-POST.md` (attach the video file or link it in the reply); copy the post URL.
6. Submit the form (rows 10–19) before **2026-11-14 23:59 UTC / 2026-11-15 06:59 WIB**. Leave a margin of several hours.
7. Keep the hosted demo up until at least 2026-11-25, then shut it down (`docs/HOSTING.md` step 12).
