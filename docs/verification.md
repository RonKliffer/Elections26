# Verification record

Verified locally on 23 October 2026 (Asia/Jerusalem).

- Next.js 16.4.3 production build completed successfully; TypeScript strict checking passed.
- **76 automated tests passed**, also run with the bundled Node.js 24.19.0 runtime.
- Live production retrieval from the official national HTML and linked city CSV returned all forty lists and 4,764,742 valid votes. The independent engine returned 113 initial seats plus seven surplus seats, matching every published final party seat total.
- The workbook's separate intermediate JSON snapshot passed its own regression validation. Application code has no Excel reader dependency.
- A production bundle copied into a temporary directory containing **no `.xlsx` files** ran successfully in explicit offline mode and reproduced the same final allocation. Its connection indicator explicitly said it was local demonstration data without a source connection.
- The production server was also started on Node.js 24 with live official fetching and normal TLS verification enabled.
- Browser checks at **1440 pixels** and **390 pixels** confirmed RTL layout and no document-wide horizontal overflow. The wide party table scrolls inside its own container on mobile.
- Browser interaction checks confirmed a 64-seat coalition, majority indication, saving and restoring a selection after reload, removal of the temporary test selection, sorting by threshold distance, searching Meretz to one row, the exact-calculation tab, and manual refresh.
- The final-2022 Shas counterfactual displayed 27,328 votes for a definite twelfth seat and explicitly identified the 27,327-vote boundary as requiring a draw.
- Stopping the backend and triggering a browser refresh retained the displayed results and changed the connection indicator to stale, with an explicit error. Source-level failures, malformed refreshes, persistence, and recovery/backoff paths are covered by automated tests.
- Default party colors were adjusted so white chart labels have contrast ratios of at least 4.6:1. This is not a claim of a full external accessibility audit.

Screenshots from the browser checks are in the ignored `screenshots/` folder. These checks validate the local single-process application, not compatibility with the future 2026 website or a multi-instance deployment.
