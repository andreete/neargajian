# Gajian hackathon prototype discovery brief

Status: Updated 9 November 2026. NEAR wallet payouts, a testnet demo, and a build from scratch are confirmed. The payout token and input currency remain open.

## Confirmed requirements

1. Provide a public landing page.
2. Open sign-in in a modal from the landing page.
3. Provide separate dashboard experiences for the payroll inputter (maker), Approver 1, Approver 2, and admin. In initial setup, let the admin choose one approver, two in sequence, or two in parallel. Cap the working demo at two approvers. Show the configured path to money release visually. Support for more approvers remains a future consideration.
4. Let the inputter enter one recipient manually or add more rows to pay several people in one run.
5. Support batch upload and both mandatory company-side posting modes in transaction history and accounting reporting. In consolidated mode, 1,000 payouts of 1,000,000 each appear as one company-side posting of 1,000,000,000. In detailed mode, they appear as 1,000 individual company-side postings of 1,000,000 each. Both modes preserve all 1,000 recipient payout rows and use the same payout behavior. Only the maker and authorized approvers may see underlying recipient details, including after the transaction. The number of downloadable templates and any external accounting integration remain open.
6. Require recipient NEAR account ID (wallet address), receiver name, currency, amount, mobile phone number (HP), and email in the upload template.
7. Before submission for approval, show the first 50 imported transactions in original file order. Corrections to imported data happen in the source file, followed by re-upload. Imported rows are read-only in the app.
8. Let each authorized approver review both the payroll summary and detailed transaction rows before and after execution.

## Follow-up decisions

- **Release policy.** The admin can configure automatic release or return the approved run to the maker for release. Use automatic release in the demo after the final required approval, subject to funding.
- **Upload and template.** Prefer CSV or delimited TXT uploads and an editable Excel template. The user proposed an Excel macro to export CSV and is open to direct Excel upload if practical. The prototype should handle a 1,000-row upload. Confirm separately how many payouts the demo must execute on-chain.
- **Validation.** Any invalid row rejects the entire uploaded file. Correct the source file and re-upload it. Manual entry may proceed with valid rows independently. Confirm how the interface handles invalid manual rows when submitting a run.
- **Demo accounts.** Provide pre-created maker and approver demo accounts. The proposed examples are `maker@gajian.com`, `app1@gajian.com`, and `app2@gajian.com`, each with `12345678` as an example password for an isolated demo with synthetic data and test tokens. Admin demo credentials are still to be defined.
- **Implementation and QA.** One engineer will build the prototype. Later, prepare roughly 15–20 bounded implementation prompts for Claude Code. Codex QA will be a separate phase after implementation.
- **Starting point.** Create a new repository and build the application and NEAR smart contract from scratch. The existing documentation is reference material. Start the implementation plan with repository setup, a reproducible README, and a minimal contract-controlled testnet payout.
- **Network and destination.** Use NEAR testnet and recipient NEAR wallets. Use test tokens for the demo. The exact payout token and supported input currency are open.

A working NEAR smart contract is mandatory for this prototype. Proposed responsibility: enforce the required approvals and release funded testnet payouts to the recipient wallets.

## Suggested journey for discussion

1. Admin configures the workflow and assigns approvers. A step-by-step flow shows which approvals are needed and when release becomes available.
2. The inputter creates a run, chooses the company posting mode, and adds recipients manually or uploads a file.
3. The system validates every imported row, displays the first 50 in original order, and reports issues by original file row number. The inputter sees recipient count, totals, and how the company posting will look. A corrected upload creates a new batch version.
4. The inputter submits a fixed version for approval. Approvers review that version with its summary, posting mode, and line details. An amended batch requires approval again.
5. The NEAR contract enforces the required approvals before releasing funded payouts. A candidate demo uses test tokens and displays transaction proof and an accountant export. Store personal contact information off-chain.

## Open decisions for the PRD

1. Payout token and currency. Proposed demo default: one USDC-style test token and one matching input currency. Confirm the asset and whether IDR is needed as an input or display currency.
2. Approval permissions. Can the maker or admin hold a separate approver role for the same batch? Do approvers need a rejection reason and a fresh round of approval after re-upload?
3. Funding. Who funds the run? Recommendation for the one-engineer build: prove a real contract-controlled payout with test tokens from a funded NEAR testnet vault first. Keep 1Click cross-chain funding outside the core demo.
4. File implementation. Choose one template with a mode selector or two templates. Candidate for the prototype: an editable `.xlsx` template with standard Save As CSV, with CSV/TXT ingestion and direct XLSX upload only if it fits. Confirm whether an export macro is still required.
5. Review and reporting. Confirm pagination after the initial 50-row preview, how invalid manual rows are handled, and which accounting summary fields or exports other roles may see without exposing recipient details.
6. Recipient experience. Confirm whether payslips, notifications, direct wallet transfers, or a gasless claim or withdrawal are in the demo.

## Design direction for the prototype

- **Rise reference.** Use product-led visuals that make payroll and wallet payout status easy to grasp. The Gajian landing page can show a real demo pay-run card with the total, approval progress, and payout status beside a single **Try the demo** button that opens the login modal. [Rise payroll](https://www.riseworks.io/products/hybrid-fiat-crypto-payroll)
- **Deel reference.** Borrow the task-first navigation and guided payroll stages. Give the maker a run builder, approvers a review queue, and the admin an approval setup screen. [Deel Payroll](https://www.deel.com/solutions/payroll/)
- **Gajian signature.** Center the product on an approval map that branches and rejoins for parallel approvals and shows exactly when money can move. Pair it with a posting preview that shows the difference between one consolidated company entry and individual entries. Use the same map in admin setup, review, and the completed run history.
- **Starter visual system.** Proposed palette: dark ink, warm ivory, and teal for primary actions. Use amber for waiting and red for errors, with text and icons alongside color. Use tabular figures for amounts and a monospace style for wallet IDs and transaction references. Build reusable status badges, amount cells, ordered upload tables, approval nodes, and transaction-proof links.
- **Privacy boundary.** Keep names, phone numbers, emails, and the source file off-chain. Restrict recipient details inside Gajian to the maker and authorized approvers. Direct on-chain payouts can expose destination wallets and amounts in public transaction data. Demonstrate with synthetic records.

## Organizer FAQ saved for project settings

The user supplied organizer clarifications Q-001–Q-017. The workspace copy of [HACKATHON.md](HACKATHON.md) records the corresponding rules. Recheck the [live organizer guide](https://nearhackathon.com/HACKATHON.md) before submission.

- **Q-001–Q-005, eligibility and reuse.** Eligible new work can start on 19 October 2026, including 19–31 October. Earlier code is baseline. Existing repos and projects on another chain may be reused. For an existing project, separate the hackathon changes with a dedicated branch or baseline/submission tags and link the diff in the README. Disclose reused libraries, templates, and AI-generated code. An old project submitted unchanged does not qualify.
- **Q-006–Q-011, network.** 1Click JWT is optional. The guide quotes a 0.2% fee without it. Intents has no testnet. Use separate dev accounts, dry quotes, and tiny amounts if mainnet testing is needed. Testnet funds are available through faucets. Choose the RPC from the [NEAR provider list](https://docs.near.org/api/rpc/providers). Testnet-only projects qualify and a custom NEAR contract that fits the track is sufficient.
- **Q-012–Q-014, demo and repo.** A local demo is acceptable with a public repo, reproducible README, and an X demo video. Hosting is optional. If hosted, aim to keep it up through 18 November, ideally through 25 November. Keep the repo public through judging and include a license. The team retains code rights and grants the organizers non-exclusive promotion rights for the listed submission materials.
- **Q-015–Q-017, entries and judging.** One person may submit up to two independent, disclosed projects. Prize payout is a single payment without vesting, within 30 days of results. Claude Code and Codex screen reproducibility and claimed features. Human judges make the final decision.

## Official hackathon references

- [Real-World Money track guidance](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/08-realworld.md). Payroll is an explicit fit. The sample adapts stablecoins, 1Click funding, sponsored gas, verifiable statuses, and accountant CSVs to an invoicing workflow and recommends proving one end-to-end testnet payment early.
- [NEAR Hackathon submission requirements](https://nearhackathon.com/#submit). Submit a working prototype in a public repository and a public demo post on X by 14 November 2026 at 23:59 UTC, or 15 November at 06:59 WIB.
