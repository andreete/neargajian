# Phase 19 screenshots (1440x900)

| File | What | Source |
| --- | --- | --- |
| `01-recipient-directory.png` | Admin → Recipients: "Pay registered recipients only" on, stats, filters, the three live recipients "Ready" (read-only testnet check) | production build, fresh `demo:reset` database (under `.tmp/`), `npm run live:phase19 -- --grep p19-directory` |
| `02-refused-upload-row.png` | Maker upload rejected: row 3 not in the directory (NEAR account ID), row 4 above the recipient's maximum (Amount) | same |
| `03-assistant-preview.png` | Payroll assistant preview for the Sales division (real Claude API) | live app, Phase 19b (`-- --grep p19-live-run`) |
| `04-assistant-follow-up-question.png` | The assistant (real model) asks for the missing amount | live app, Phase 19b (`-- --grep p19-assistant`) |
| `05-assistant-refusal.png` | Prompt injection with a NEAR account refused (by the app, before the model) | live app, Phase 19b (`-- --grep p19-assistant`) |
| `06-paid-run-drafted-by-assistant.png` | Run `gjn-6e2922fcf5cd4d0f91f1-v1`, paid on testnet, with "Drafted by the payroll assistant from: …" | live app, Phase 19b (real transactions, `docs/TESTNET.md`) |

No screenshot here uses the browser-test stub model.
