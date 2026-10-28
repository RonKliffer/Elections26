# Verification record

## Missing 2026 Arab surplus agreement — 28 October 2026

- Retrieved and normalized the official 07:57 Israel-time publication with isolated WebKit: 2,937,354 valid votes. Running the same snapshot with the existing four agreements reproduced 56 seats for the current coalition.
- Added the missing Ra'am–Joint List agreement (`עם / ודם`), also reported in [the 2026 surplus-agreement summary](https://www.ynet.co.il/news/elections2026/article/skdhsmfsmx). On the identical votes, the Joint List receives 12 seats instead of 11 and Otzma Yehudit receives 6 instead of 7; the current coalition totals 55. Both quota modes agree and allocate all 120 seats.
- Preserved this normalized publication and its capture provenance in separate regression fixtures, retaining the original early-count parser fixtures. Regression tests check the complete distribution, surplus recipients, and the old 56-seat result when that agreement is omitted.
- All 145 automated tests, strict TypeScript checking, and the Webpack production build passed. Replayed the captured publication through `ElectionService` on both cache initialization and refresh; both returned 55 coalition seats, five agreements, and 120 total seats.

## Container certificate trust — 28 October 2026

- Commit `c58a9b0` deployed successfully. The live endpoint returned diagnostic JSON: direct fetch received HTTP 404 and Linux WebKit reported `Unacceptable TLS certificate`.
- Inspected the official Node slim Dockerfile: it removes the certificate packages installed during its build. Playwright's installed dependency list does not include `ca-certificates`. Added an explicit installation and initialization of the standard OS public-root bundle in the final image. TLS certificate verification remains enabled.
- This follow-up changes only image provisioning; verification requires its automatic Vercel deployment because Docker is unavailable locally.

## Vercel browser runtime packaging — 28 October 2026

- The public deployment served the dashboard but `/api/results` returned an empty HTTP 500. The exact exception was unavailable without its runtime logs. The previous Vercel default also disabled the locally successful browser fallback.
- Added a Vercel container definition with Node.js 24, a standalone Next.js server, complete Playwright runtime packages, WebKit and its Linux dependencies. Container mode enables browser fallback; ordinary Functions keep their fetch-only default. The browser library is imported only when retrieval needs it.
- Unexpected service initialization/response failures now return HTTP 503 JSON and log the exception. The dashboard displays the API's diagnostic instead of treating every HTTP failure as a network outage.
- **142 tests passed**, strict TypeScript checking passed, and `ELECTION_CONTAINER=1 npm run build -- --webpack` passed. The container preset and port were checked against Vercel's current configuration schema. Type checking was rerun after the build completed, since running both concurrently raced over generated `.next/types` files.
- Copied the standalone bundle, static files and full browser packages into a separate temporary directory and started it with `VERCEL=1` and `ELECTION_CONTAINER=1`. Both `auto` and explicit `browser` retrieval returned HTTP 200, `connection: fresh`, no error, 38 parties and 14,386 valid votes. The observed publication was 28 October at 01:03 Israel time. This used newly retrieved live data, without a seeded cache.
- Docker is unavailable locally: the Linux image build and official-source access from Vercel remain pending deployment verification. The earlier empty-500 exception is not established as a browser failure. Existing staged `next-env.d.ts` changes were preserved.

## Surplus agreement configuration — 28 October 2026

- Updated the active 2026 configuration to exactly the four pairs specified by the user: `מחל / ט`, `שס / ג`, `דרך / אמת`, and `רק / ל`. This replaces the six-pair configuration described in the earlier migration record below.
- The 2022 demonstration configuration remains separate.

## Browser transport recovery — 28 October 2026

- Diagnosed direct requests returning either cached government HTTP 404 HTML or an AWS JavaScript-verification challenge. An isolated Chrome attempt did not reach the results table. Isolated WebKit successfully navigated the official page and returned live results.
- Added direct-fetch/browser transport selection, with WebKit as the local fallback. Every attempt uses a new browser context, closes it afterward, retains certificate verification, and permits only the configured official 2026 host. No personal browser state or saved fixture is used by this transport.
- Verified the running local results API returned `connection: fresh`, no error, 38 parties, 2,661 valid votes, 2,670 votes cast, and an explicit source update of 28 October at 00:19 Israel time. Successful subsequent retrievals produced new retrieval timestamps and no imported-file warning. The dashboard displayed the successful connection, all rows and correct source time.
- **138 automated tests passed**, along with strict TypeScript checking and the Webpack production build. A clean restart with normal default settings retrieved live results successfully; manual refresh was also checked in the browser.
- Added `npm run setup:browser` to install the required official Playwright WebKit runtime. Local mode defaults to direct fetch followed by WebKit; Vercel remains direct-fetch-only unless a browser-capable host is provisioned.

## Live 2026 source migration — 28 October 2026

- Inspected the redesigned official national page through the browser and saved its DOM in `fixtures/2026/source.html`. The observed publication at 28 October, 00:19 Israel time contained 38 rows, 2,661 valid votes, 9 invalid votes, 2,670 votes cast, and 7,331,981 eligible voters.
- Verified the current ballot roster and all six agreements against the committee’s [candidate-list guide](https://www.gov.il/he/pages/candidates-lists-26?chapterIndex=6), including the withdrawn lists that remain as zero-vote rows. Official mode now uses the 2026 parser/configuration; explicit demo mode retains the 2022 data/configuration.
- **130 automated tests passed**, including real-page parsing, national reconciliation, missing/duplicate parties, malformed counts, source failure, daylight-saving conversion, runtime selection, preservation of valid early-count data, and the existing mathematical regressions. Strict TypeScript checking passed.
- The production build passed with `npm run build -- --webpack`. Turbopack’s build-worker port was blocked by the local execution environment, including an escalated attempt.
- A loopback production server was tested against the captured national page through a temporary test upstream. Browser checks confirmed 38 rows, the correct new party names, 00:19 source time, 2,670 reported votes, search for `דרך`, the exact-calculation tab, and manual refresh. The 740-pixel viewport had no document-wide overflow. This was a captured-source verification, not a successful live government request.
- The current small-count allocation is unresolved. Valid vote totals remain visible, while incomplete coalition and seat charts are hidden. A scaled election-sized input with the same roster/agreements produced a complete 120-seat allocation in the tests.
- **Initial source-access blocker (resolved locally by the browser transport above):** Node and curl returned government HTTP 404 pages from both the root and national-results endpoints, including a cache-busted request; the browser could display the official page. No saved-page fallback is enabled in live mode. Deployment must use `votes26` rather than an old `ELECTION_SOURCE_URL` pointing to `votes25`, and source connectivity must be checked from that host.
- Screenshot: `screenshots/dashboard-2026-captured-source.png` (ignored local verification artifact).

## Official-source recovery — 27 October 2026

- Reproduced HTTP 403 from the deployed results API and the official national host. The official city CSV remained reachable.
- Added recovery limited to the configured final 2022 source: download the live official CSV and reconcile all totals and party counts against the archived final national page. The dashboard discloses the archived-page capture time and links to the live CSV. Failed or inconsistent CSV responses still fail without substituting saved data.
- **95 automated tests passed**, including browser challenges, timeouts, election/source isolation, missing CSV rows, and changed party counts with unchanged national totals. Strict TypeScript checking passed.
- Production build passed with `next build --webpack`; local Turbopack was prevented from opening its build-worker port by the sandbox. Both API tracing manifests include the archived national HTML and provenance.
- A live retrieval through the production runtime returned 40 parties, 4,764,742 valid votes, and a successful 120-seat allocation. Browser checks of initial loading and manual refresh showed successful official retrievals, the source warning, and the complete results dashboard.

## Original verification

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

Screenshots from the browser checks are in the ignored `screenshots/` folder. These original checks validated the 2022 single-process application; the 2026 migration is covered separately above. Multi-instance deployment guarantees are not established by these checks.

## On-demand fetching update

- Removed server startup fetching, background polling, browser intervals, and visibility-triggered refreshes. Page load and the Refresh button both await the shared fetch before returning state.
- **83 automated tests passed**. They cover cold-response waiting, no background timers after elapsed time, cooldown/backoff, source timeout/HTML errors, and the writable temporary-cache default on Vercel. Strict TypeScript checking and the final production build passed.
- A local production server started with `VERCEL=1` fetched live official results on first page load: forty lists, 4,764,742 valid votes, and 120 independently allocated seats. The Refresh button awaited a second source request, which returned HTML instead of the CSV; the dashboard retained the prior valid data and marked it stale.
- Reloading the final rebuilt page successfully retrieved the official results again. A screenshot of this successful on-demand load is saved at `screenshots/dashboard-on-demand.png`.
- The first successful retrieval remained unchanged while idle. The UI labels refreshing as on demand and shows the new invalid-votes and valid-turnout rows in the summary cards.
- Both API function tracing manifests include the explicit offline fixture.
- The existing public Vercel deployment returned a source timeout before these local changes. The updated code still needs to be pushed and redeployed; source reachability from Vercel is not established by local verification. Vercel temporary caching provides no durable or shared-instance guarantees.
