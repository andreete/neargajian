# Build Gajian from scratch with Claude Code

This guide starts from Windows PowerShell. The same build package can be used with a Linux/WSL toolchain. The repository contains planning files after setup. Claude Code creates the implementation in the numbered phases.

## 1. Install and check Claude Code

Install Git for Windows and ensure `git --version` works. If Claude Code is already installed, skip the WinGet command. In PowerShell run:

```powershell
winget install Anthropic.ClaudeCode
```

Open a new terminal if needed, then run:

```powershell
git --version
claude --version
claude doctor
```

The first `claude` session prompts you to sign in with a supported Claude account or provider. Use the normal permission mode and review requested commands. If the Rust or NEAR sandbox tooling is easier to run in WSL 2, install and run the toolchain and Claude Code inside WSL and keep the implementation repo on the Linux filesystem. Choose one development environment early and document it in the README. [Claude Code quickstart](https://code.claude.com/docs/en/quickstart) · [Windows and WSL setup](https://code.claude.com/docs/en/setup)

## 2. Create the new implementation repo

In PowerShell, start in the existing project folder. This example creates a new child folder named `gajian-prototype`. Choose a different name if it already exists.

```powershell
Set-Location -LiteralPath 'D:\2026\0000_srijalabs_project\14 - NEAR PAYROLL'
New-Item -ItemType Directory -Path '.\gajian-prototype' -ErrorAction Stop
Set-Location -LiteralPath '.\gajian-prototype'
git init -b main
New-Item -ItemType Directory -Path 'docs\build','docs\reference'
Copy-Item -LiteralPath '..\gajian-build\01-PRD.md','..\gajian-build\02-DESIGN-SYSTEM.md','..\gajian-build\03-CLAUDE-MASTER-PROMPT.md','..\gajian-build\04-BUILD-PHASES.md','..\gajian-build\05-CLAUDE-CODE-TUTORIAL.md' -Destination 'docs\build'
Copy-Item -LiteralPath '..\HACKATHON.md' -Destination 'docs\reference\HACKATHON.md'
git status --short
```

You should see a fresh repository with `docs/` ready to be tracked. Use the new PRD as the implementation baseline. Review the draft defaults in Section 1 before the contract work, particularly the mock token, direct transfers, macro-free template and pre-funded vault.

## 3. Give Claude Code the master prompt

Launch from the new repo root:

```powershell
claude
```

Open `docs/build/03-CLAUDE-MASTER-PROMPT.md`, copy the text inside its code block, and paste it into the Claude Code session. The first response should identify the proposed stack, repo layout and any missing tools or decisions. Review the response, then paste **Phase 01** from `docs/build/04-BUILD-PHASES.md`.

## 4. Run the phases one at a time

For each phase:

1. Paste the phase block, or say `Read docs/build/04-BUILD-PHASES.md and execute Phase 02 only. Read docs/BUILD-STATE.md first.` Replace `02` with the next phase number.
2. Review tool permissions. Allow actions that make sense for the active phase. For testnet deployment or transfers, confirm the network, account IDs and commands separately with the operator.
3. Open `docs/BUILD-STATE.md`. Check that the phase recorded actual test commands and results, decisions, unfinished items and the next phase. Run the claimed key command in a separate terminal if practical.
4. Review the code with `git status --short` and `git diff`. Untracked files appear in status but not in `git diff`; open them before staging. Stage only reviewed files. Use `git diff --cached` before committing. Keep a local commit per verified phase or small group of phases.
5. If context is crowded, end the session and run `claude` from the same root. The repository's `CLAUDE.md` supplies standing instructions. Ask the new session to read `docs/BUILD-STATE.md` and the current phase. [Claude Code project instructions](https://code.claude.com/docs/en/memory)

If a phase fails, use this follow-up before moving on:

```text
Stay on the current phase. Reproduce the reported failure, find the cause, fix the smallest relevant slice, and rerun the acceptance checks. Record exact evidence and remaining blockers in docs/BUILD-STATE.md. Keep the phase open until its gate is met.
```

Aim to prove the first contract transfer in Phase 02. By the end of Phase 13, the full workflow should exist. Save time for a fresh-checkout rehearsal, the live testnet demo and separate QA. If time runs short, reduce polish and optional features. Preserve actual approval enforcement, both posting modes, the 1,000-row import check, and honest test evidence.

## 5. Prepare testnet access and record the demo

- Use dedicated testnet accounts. The operator supplies the actual IDs, obtains testnet NEAR for transaction fees, deploys the vault and mock token, registers demo recipients where required, and funds the vault. Use the project README's generated, verified commands. [NEAR public RPC and faucet reference](https://docs.near.org/api/rpc/providers)
- Use private local configuration or the deployment secret store for signer credentials. The repo gets `.env.example` with placeholders and public account IDs where useful. Confirm the app shows **NEAR testnet**. Keep the public test demo isolated and funded with a small test budget.
- Record a real small run. Show one or two approval steps, the final action leading to automatic release, the confirmed payout proof, and how the company report appears. Show the second posting mode and the 1,000-row import as separate checks. State exactly what was tested live.

## 6. Ask Codex for independent QA

Open the implementation repository in a separate Codex chat. Give it the candidate commit SHA, README, PRD, `docs/BUILD-STATE.md` and public testnet evidence. Start with this prompt:

```text
Review Gajian as an independent hackathon QA reviewer. Start from the candidate commit and follow README from a clean environment where possible. Read docs/build/01-PRD.md and docs/BUILD-STATE.md. Verify acceptance checks A01–A08, focusing on access to recipient details, immutable upload order, a bad row after row 50, approval order and separation, funding and replay guards, final payout proof, and exact company totals in both posting modes. Distinguish local tests, sandbox tests, and verified live testnet evidence. Report pass, fail, or blocked per check, with repro steps, severity and relevant paths. Treat this as review only. Ask before taking any action that submits a new testnet transaction, and do not publish or submit anything.
```

Send the QA findings back to Claude Code with Phase 18, then ask Codex to recheck the resolved failures.

## 7. Publish and submit when ready

Review the public repo for secrets and real data, include a license, verify the README on a fresh checkout, and record a public demo video for X. The post should say the project was built at NEAR HACKATHON and tag `@NEARProtocol` and `#NEARHackathon`. Confirm the public repository and X post URLs, choose Real-World Money, and use a team-controlled **mainnet** NEAR address for the prize form. Submit once before **15 November 2026, 06:59 WIB**. [Official guide](https://nearhackathon.com/HACKATHON.md) · [Submission form](https://nearhackathon.com/#apply)
