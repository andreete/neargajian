# Phase 14 UX pass: QA screenshots

Full-page captures from `tests/e2e/pages.spec.ts` (`QA_SHOTS=1`), at the width in the file name (1280 or 1440).

**Data: test-only fixture**, not testnet. `scripts/e2e-fixture.ts` builds runs in every lifecycle state in the isolated e2e database through the real lifecycle code against the stand-in vault; transaction links such as `TX123` are fake and exist only there. Live testnet evidence is in `docs/screenshots/phase-13/` and `docs/TESTNET.md`.

Reproduce: `npm run build && QA_SHOTS=1 npx playwright test tests/e2e/pages.spec.ts` (writes all pages to `.tmp/phase-14/`).
