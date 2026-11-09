# Submission checklist (NEAR HACKATHON)

Source: the live organizer guide https://nearhackathon.com/HACKATHON.md, re-read on **9 Nov 2026** (the page shows no version number; it says to re-read it before submitting because "dates and rules may change"). Re-read it again on the day you submit.

## Deadlines

| Event | UTC | WIB (UTC+7) |
| --- | --- | --- |
| **Submission deadline (development ends)** | **2026-11-14 23:59** | **2026-11-15 06:59** |
| Repository must be public by | 2026-11-14 23:59 | 2026-11-15 06:59 |
| Judging starts | 2026-11-16 00:00 | 2026-11-16 07:00 |
| Results announced by | 2026-11-18 23:59 | 2026-11-19 06:59 |
| Hosted demo kept up (Q-012, "a plus") | until 2026-11-18, ideally 2026-11-25 | |

Submissions are accepted only during the development phase. Changes after submitting go through the organizers' request-changes page, not a second submission. A repository can be submitted only once.

## Requirements and status

Everything under "Andre" is yours to do. The agent does not make the repository public, tag, post or submit.

| # | Requirement (organizer guide) | Status | Owner |
| --- | --- | --- | --- |
| 1 | Public repository, open to judges through judging | **Open**: private now | **Andre** |
| 2 | LICENSE file (Q-014; any license) | Done: MIT `LICENSE` | — |
| 3 | Reproducible README with "do X, see Y" steps (section 1) | Done: README "For judges" | — |
| 4 | Pre-hackathon diff: a dedicated branch or tags `pre-hackathon` and `hackathon-submission`, plus a README section linking the diff (Q-003) | README section done ("Hackathon window and diff"); **tags open**: `git tag pre-hackathon ba205f7` and `git tag hackathon-submission <final commit>`, then `git push origin --tags` | **Andre** |
| 5 | Code from the 2026-10-19 announcement onward (Q-001); disclose pre-hackathon work (Q-002) | Done: all code written from 9 Nov 2026; first commit `ba205f7` is planning documents only (README) | — |
| 6 | List AI-generated code and third-party libraries in the README (Q-005) | Done: README "AI use" and "Third-party software" | — |
| 7 | If one person enters two projects, each README names the other (Q-015) | **Andre to confirm**: only GAJIAN? If there is a second project, add its name to the README | **Andre** |
| 8 | Demo post on X by a human: says "built at NEAR HACKATHON", tags @NEARProtocol and #NEARHackathon, attaches the video or screenshots (section 2) | Draft in `docs/X-POST.md` (275/280 characters); **posting open** | **Andre** |
| 9 | Demo: local-only is accepted with public repo + reproducible README + X post with a video; "screenshots are not enough when judges cannot open the demo"; hosting is a plus (Q-012) | **Video open** (runbook `docs/VIDEO.md`); hosting optional (plan `docs/HOSTING.md`) | **Andre** |
| 10 | Submission form: project name (2–80 characters) | Suggested: `GAJIAN` | **Andre** |
| 11 | Team lead's name (2–80 characters) | **Andre** | **Andre** |
| 12 | Contact email (≤ 160 characters; at most 2 submissions per email) | **Andre** | **Andre** |
| 13 | Team size: one of `1`, `2 - 4`, `4 - 6`, `6 - 8`, `8+` | `2 - 4` (3 people per the kickoff) | **Andre** |
| 14 | Tracks (one or more track IDs; one submission per project) | `realworld` (Real-World Money) | **Andre** |
| 15 | **NEAR payout account: a mainnet named account or a 64-character implicit account** (prizes paid in NEAR, Q-016) | **Open**: your mainnet address (never a testnet account; do not put it in the repository) | **Andre** |
| 16 | Repository link (public, unique) | `https://github.com/andreete/neargajian` once public | **Andre** |
| 17 | Demo post link (public) | **Open**: the X post URL | **Andre** |
| 18 | Project description (20–2,000 characters: problem, product, NEAR's role) | Draft below | **Andre** to review |
| 19 | Consent to the contact notice | **Andre** | **Andre** |

Notes from the guide that apply to us:
- Testnet-only projects are eligible for all tracks (Q-010).
- No integration is mandatory; a custom NEAR contract that fits the track is enough (Q-011).
- AI screening by Claude Code and Codex comes before the human jury and does not decide alone (Q-017). The README is written for that.
- Track hints (not requirements): stablecoins, NEAR Intents, meta transactions. We use a test stablecoin on testnet; Intents have no testnet (Q-007).

## Draft project description (for the form: 1,013 of 2,000 characters)

```
GAJIAN is payroll with approvals that a NEAR contract enforces. A finance team uploads a payroll file (up to 1,000 rows) or enters rows by hand; every row is validated, and an invalid file is rejected with every problem listed. The maker submits an immutable version: the app registers a Merkle commitment of the exact accounts and amounts in a custom vault contract. One or two approvers sign off, in sequence or in parallel, as the admin configured. The vault then pays each wallet in its own transaction, but only for an approved run, only the committed amounts, only once per row, and only from funds it holds; otherwise the run waits as "Awaiting funding". Accounting gets the same payouts as one consolidated entry or one entry per recipient, with matching CSV exports, and each paid time is the payout's block time. Built and rehearsed on NEAR testnet with a test token; the vault has no access keys, so its code cannot change, and every claim is re-checkable from the repository with a read-only verifier.
```

## Final steps on submission day (Andre)

1. Re-read https://nearhackathon.com/HACKATHON.md for changes.
2. Make sure the last commit is pushed and CI is green.
3. Create and push the tags (row 4).
4. Make the repository public (GitHub → Settings → General → Danger Zone → Change visibility).
5. Upload the video; post on X with `docs/X-POST.md`; copy the post URL.
6. Submit the form (rows 10–19) before **2026-11-14 23:59 UTC / 2026-11-15 06:59 WIB**. Leave a margin of several hours.
7. Keep the hosted demo (if any) up until at least 2026-11-18, ideally 2026-11-25.
