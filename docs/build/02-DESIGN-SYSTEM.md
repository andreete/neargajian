# Gajian starter design system

## Direction

Use Rise as a reference for showing payroll and payout outcomes in the landing hero. Use Deel as a reference for task-first navigation and guided payroll stages. Give Gajian its own identity through the approval map and posting preview, using original copy, icons and synthetic app data. [Rise Payroll](https://www.riseworks.io/products/hybrid-fiat-crypto-payroll) · [Deel Payroll](https://www.deel.com/solutions/payroll/)

Landing headline: **Run payroll with a clear approval trail.** Supporting copy: Prepare a payroll batch, route it to the right reviewers, and verify wallet payouts on NEAR testnet. Primary action: **Try the demo**. Hero visual: one batch card with recipient count, amount, two approvals, and an example payout status labeled as sample data. Add a compact workflow explanation and posting-mode comparison. Keep **NEAR testnet** visible in the public demo and app shell.

## Foundations

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#122622` | Headings and default text |
| `--muted` | `#4E615B` | Secondary text |
| `--canvas` | `#F8F7F2` | Warm background |
| `--surface` | `#FFFFFF` | Cards, tables and dialog |
| `--primary` | `#00645A` | Primary action, active link, white text on fill |
| `--primary-soft` | `#E5F4EF` | Selected states and approval highlights |
| `--border` | `#D4DEDA` | Separators, with a darker outline for interactive controls as needed |
| `--warning` / `--warning-bg` | `#754500` / `#FFF1D6` | Waiting, partial or awaiting funding |
| `--danger` / `--danger-bg` | `#A62424` / `#FCEAEA` | Rejected, failed or invalid |
| `--success` / `--success-bg` | `#136346` / `#E7F5ED` | Confirmed approval or payment |

Use system sans-serif, a 16px body and compact 14px table text. Use 20/24/32/48px headings, 4/8/12/16/24/32/48px spacing, 8px control and 16px card radius. Tabular numerals and right-aligned money. Monospace references and wallet IDs; truncate visually only with a way to reveal or copy the full value. Verify contrast and focus states. Use text plus icon for statuses, and accessible labels for icon-only controls.

## Screens and composition

| Screen | Main elements | Primary action |
| --- | --- | --- |
| Landing and login | Hero, testnet badge, sample run, keyboard-trapped login dialog with focus restoration | Try the demo / Sign in |
| Maker dashboard | Run history, status chips, empty state, create button | New payroll run |
| Run builder | Manual/upload tabs, template download, validation results, 50-row review, company posting preview | Submit for approval |
| Approver queue | Pending and reviewed tabs, next action, run amount, count and version | Open run |
| Run detail | Summary header, approval map, details tab, posting preview, proof timeline | Approve / Reject or Release payments, by role/state |
| Admin | Workflow cards, reviewer selectors, release radio group and live approval preview | Save workflow |
| History | Status filter, posting indicator, role-scoped details and CSV export | Download report |

Keep navigation role-specific. The approver experiences can share layouts while surfacing different step labels and actions. Use a two-column desktop layout for summary and detail where appropriate, stacked at smaller widths. Give data tables a labeled horizontal scroll container rather than clipping fields. Preserve keyboard access to paging and error rows.

## Components and behavior

- **Approval map.** A single path for one reviewer. For sequence, show Approver 1 before Approver 2. For parallel, show two branches converging into an AND gate labeled **Both approvals required**. Then show **Automatic release** or **Maker releases**. Render status text on each node and provide a textual ordered summary for screen readers. Reuse in setup and run detail.
- **Posting preview.** Render a small sample company ledger with the current mode, posting count and total. For 1,000 payouts, the count is one or 1,000. Keep the actual recipient count visible in either case. Use the same wording and calculations in maker review and history.
- **Ordered upload table.** Show original row numbers in the first column, page 50 at a time, and default to file order. Imported cells have no edit affordance. Error panels distinguish “file rejected” from “previous version remains active.”
- **Run status.** Use Draft, Submitting, Awaiting approval, Rejected, Cancelled, Awaiting funding, Ready to release, Releasing, Needs attention and Paid. Approvals pending chain confirmation stay visibly pending. Distinguish payout row status from run status. Show a copyable reference or explorer link only where permitted.
- **Money action dialog.** Show count, exact total, token, version and consequence before submit/release. Disable duplicate click while an action is pending. If the transaction outcome is uncertain, keep the existing action and offer refresh instead of starting a new payment.
- **Empty and error states.** Give actionable text. Example: “Row 61 has an invalid NEAR account ID. Correct the file and upload it again.” Never include a full private row in generic UI errors or telemetry.
