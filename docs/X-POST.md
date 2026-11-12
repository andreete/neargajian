# X post (draft only, not posted)

Andre publishes this himself (organizer rule: the human posts). Required by the organizers: say it was built at NEAR HACKATHON, tag @NEARProtocol and #NEARHackathon, attach the demo video or screenshots. Optional tags: @NearLegion, @NearBuilders.

Fill in one link before posting: `<VIDEO>` (the demo video on YouTube; or attach the video file to the post directly). The hosted demo link (https://sentfund.my.id) is already in the reply: live since 10 Nov 2026, current release `f25e00b` (Phase 26), checked read-only on 12 Nov 2026 (21 passed). The repository must be public first.

## Main post (≤ 280 characters; X counts each link as 23)

```
Built at NEAR HACKATHON: SentFund, payroll where a NEAR contract enforces the approvals and pays each wallet, and the books get matching CSVs. On testnet.

@NEARProtocol #NEARHackathon
https://github.com/discoverateagency-ops/sentfund

What would your finance team need to trust a contract with payroll?
```

Character count as X counts it: 275 of 280. Attach: the demo video (2:30).

## Reply (thread, optional; 275/280 characters as X counts them, with the video link)

```
Check it yourself: the vault has no access keys, so its code can't change; each paid time is its NearBlocks block time; `npm run judge:verify` re-checks it, read-only, in about 5 min.

Video: <VIDEO>
Try it (testnet, shared demo data): https://sentfund.my.id
```

## Second reply (thread, optional; 253/280 characters)

```
Next, from demo to pilot: approvers sign with their own wallets, no server key can move funds, a rolling spending limit and an emergency freeze. The gap analysis, our QA results and a key inventory are already in the repo (docs/roadmap).

#NEARHackathon
```

Everything in it is **planned, not built** (README "Roadmap: from demo to pilot", `docs/roadmap/`); the key inventory is `docs/KEY-INVENTORY.md`. Do not write a file name ending in `.md` in a post: X turns it into a link (`.md` is a country domain).

## Notes

- `npm run judge:verify` is the quick check (about 5 minutes); `npm run judge:verify -- --full` re-checks every transaction (about an hour, the archival node rate-limits). Say "about 5 minutes" only for the quick one.
- Keep the claims to what the repository proves. tUSDC is a zero-value test token on testnet; say "testnet" and do not imply mainnet use or real stablecoins.
- Screenshots to attach if the video cannot be attached (or add `docs/screenshots/phase-19/01-recipient-directory.png` and the assistant preview): `docs/screenshots/phase-16/01-demo-paid-with-explorer-links.png`, `docs/screenshots/phase-16/03-history-detailed.png`, `docs/screenshots/phase-16/09-awaiting-funding.png`.
- After posting, put the post's URL in `docs/SUBMISSION.md` (the submission form needs the "demo post link").
