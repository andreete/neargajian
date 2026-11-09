# Claude Code master prompt

Paste the content of the block below into Claude Code from the root of the new Gajian repository. Use the phase prompts in `04-BUILD-PHASES.md` for implementation.

```text
You are the sole implementation engineer for Gajian, a NEAR Real-World Money hackathon prototype. Work in this new repository. Read docs/build/01-PRD.md, 02-DESIGN-SYSTEM.md and 04-BUILD-PHASES.md. Read the official HACKATHON.md saved under docs/reference and recheck the live version before submission. If legacy payroll docs are supplied, treat them as background; the new PRD and explicit user decisions govern.

Build an actual testnet prototype: landing page and modal login, role dashboards, configurable one/sequential-two/parallel-two approval workflows, automatic or maker release, manual and CSV/TXT payroll up to 1,000 rows, immutable ordered review, two company posting modes, a funded custom NEAR contract that enforces approvals and executes wallet payouts, role-scoped history and reports. Target a live demonstration of two or three recipients and test 1,000-row processing separately. Use synthetic records. Clearly label any mock or sandbox path.

Treat PRD defaults as draft decisions. Report them in your plan and in docs/BUILD-STATE.md. Default to one synthetic organization, an isolated pre-funded vault, one mock tUSDC NEP-141 token with six decimals, one currency, direct NEAR testnet payouts, and one macro-free Excel template with CSV export instructions. Keep mainnet, FX, 1Click and full HR features out of scope. If a default must change, explain the effect on the demo and acceptance criteria before building on it.

Prefer a small TypeScript full-stack app (e.g. Next.js), one persistent relational database, one durable release/reconciliation loop in the same repo, and Rust/near-sdk contracts. SQLite is acceptable for a local-only demo with a single writer/worker and persistence. Use PostgreSQL if the chosen host makes local database durability impractical. Verify supported versions and tool commands against official docs. Pin runtimes and dependencies. Record why the chosen stack is appropriate, with scripts that work on the chosen environment.

Financial invariants: compute amounts in integer base units, freeze reviewed versions and approval policy, authorize every server operation, enforce distinct chain identities and approval/order/release rules in the contract, reserve vault funds before sending, bind each indexed row to the approved payout commitment, persist transfer state and verify callbacks/finality, prevent duplicate payments, and reconcile unknown transactions before any retry. Keep PII off-chain. Use explicit Testnet-only settings and server-only scoped credentials. State the prototype's server-signing trust model. No real data, real funds, secret values in logs, or keys in the repository. Do not publish a repo, post to X, deploy to mainnet or submit an entry without explicit direction.

Work on one numbered phase at a time. At each phase, read the current diff and docs/BUILD-STATE.md. Implement the requested slice, exercise the relevant acceptance check, and update BUILD-STATE.md with changed files, exact commands/results, decisions, remaining risks, and next phase. If a test fails, report what failed and keep the phase open. Do not mark tests as run when you could not run them. Keep README examples synchronized with actual commands and results. Leave commits to the user's normal review workflow unless directed otherwise.

For this first response, inspect the workspace and toolchain, then present a compact proposed repo layout, pinned-stack verification plan, and any material blocker. Do not implement multiple phases in one turn. Wait for the user to send Phase 01.
```
