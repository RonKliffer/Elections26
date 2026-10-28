# עד 120 — Israeli Knesset results dashboard

Hebrew RTL dashboard with independently calculated Bader–Ofer seats, surplus agreements, next-seat vote scenarios, threshold analytics, and a coalition calculator. Built with Next.js App Router, strict TypeScript, Tailwind CSS, and Vitest.

The default is **official-source mode for the live 2026 election (Knesset 26)** at [votes26.bechirot.gov.il](https://votes26.bechirot.gov.il). The roster comes from the [committee’s official candidate guide](https://www.gov.il/he/pages/candidates-lists-26); the dashboard uses all five 2026 surplus agreements. An explicitly selected offline demo uses the historical 2022 election and its separate configuration. Excel is a development reference only: the application, build, tests, and offline demo require no spreadsheet software or workbook access.

## Run locally

Use Node.js **24 or newer** (the `.nvmrc` selects 24).

```sh
npm ci
npm run setup:browser
cp .env.example .env.local
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The app fetches results when the page loads and when **רענון נתונים** is clicked. There is no background polling, browser interval, or automatic refresh when switching tabs. Source requests run server-side and the response waits for them to finish. Overlapping requests share one fetch within each server instance.

```sh
npm test
npm run typecheck
npm run build
npm start
```

`npm start` runs a persistent production Node server on loopback. For a network-facing deployment, run it behind a reverse proxy on the same host, or use `node --use-system-ca node_modules/next/dist/bin/next start --hostname 0.0.0.0`. Provision a persistent, writable cache directory. Run **one application process**, without a cluster or multiple replicas. The scripts use Node's system CA trust; TLS verification remains enabled. Local official fetching also requires the WebKit runtime installed by `npm run setup:browser`. On Linux, install its system dependencies with `npx playwright install --with-deps webkit` as part of provisioning.

No external database, API keys, remote fonts, or Excel runtime are required. The build does not fetch election data. Supply environment values before starting the server and restart after changing them.

## Deploy to Vercel

The repository includes `Dockerfile.vercel` and `vercel.json` to select Vercel's [Container runtime](https://vercel.com/docs/functions/runtimes/container). The image builds the standalone Next.js server with Node.js 24, installs Playwright WebKit with its Linux system dependencies, and runs as an unprivileged user. This provides the browser runtime needed when the official source blocks direct server requests.

Push these files and deploy the new revision. Remove previous build/output-directory overrides if configured; the Dockerfile builds and starts the application. Check these project environment settings before redeploying:

- `ELECTION_DATA_MODE=official`
- `ELECTION_SOURCE_TRANSPORT=auto` (replace any earlier `fetch` override)
- `ELECTION_BROWSER_ENGINE=webkit`
- `PORT=3000` (also supplied in `vercel.json`)
- Remove old `ELECTION_SOURCE_URL` values pointing at another election; the default is `https://votes26.bechirot.gov.il`.
- Leave `ELECTION_CACHE_DIR` unset to use the image's writable `/tmp/elections26` directory.

After deployment, open `/api/results`. A successful retrieval returns JSON with `connection: "fresh"` and a current `snapshot.retrievedAt`. Then check the dashboard and its manual refresh. If retrieval fails, inspect the JSON error and Vercel runtime logs. WebKit success on a local machine does not guarantee that the source accepts the deployment's network region.

Both endpoints await retrieval. Direct fetch has a 20-second timeout; browser fallback shares a separate 30-second deadline across launch, navigation and waiting. The client allows 55 seconds for the operation. The container must have a request duration of at least 60 seconds. Source work finishes before the response; it does not depend on background execution.

Local and container mode default to `auto`: direct fetch, then a new isolated WebKit browser for HTTP failures, JavaScript verification, or network errors. The parser validates every count. Each attempt uses a disposable profile, certificate checks, a fixed official host and a bounded deadline, and closes the browser afterward. Malformed live results do not trigger a second transport. `browser` selects WebKit directly; `fetch` disables it. Ordinary Vercel Functions without the container still default to `fetch` because no browser is provisioned there.

If neither transport obtains a valid publication, the service reports the failure and retains its previous validated snapshot. It never substitutes demo data. Unexpected service errors return diagnostic JSON with HTTP 503 and write the exception to server logs.

Temporary storage and in-memory request sharing are **per instance and not durable**. A cold start, another instance or redeployment may have no previous snapshot, history or backoff. Durable shared state and coordination across instances require an external store, or one persistent Node process with persistent storage.

## Offline demonstration

Set `ELECTION_DATA_MODE=demo` in `.env.local` and restart. This reads `fixtures/2022/official.json` and displays an explicit offline demonstration label. The original source status and original capture provenance remain distinguishable from the app's current fixture-read time. **An official-source failure never switches to demo mode.**

## Live 2026 configuration and source

`src/config/election.ts` configures Knesset 26, 120 seats, and a threshold of `13/400`. Party IDs are the current official ballot letters; old letters are not carried forward by display name. For example, `פה` is now “אני ואתה”, `ב` is Otzma Yehudit, and `ד` is “השותפות לכולם”. The new major lists include `דרך` (Yashar), `רק` (Beyachad), `די` (the reservists/economic list), and `ודם` (the Joint List).

The five configured surplus agreements are Likud–Religious Zionism (`מחל / ט`), Shas–United Torah Judaism (`שס / ג`), Yashar–Democrats (`דרך / אמת`), Beyachad–Yisrael Beiteinu (`רק / ל`), and Ra'am–Joint List (`עם / ודם`), as reported in [the 2026 agreement summary](https://www.ynet.co.il/news/elections2026/article/skdhsmfsmx). Both parties must qualify independently. Withdrawn lists `כן` and `צבי` currently appear with zero votes on the results page; their rows are accepted but not required.

`src/lib/source2026.ts` reads the redesigned national page’s summary cards and desktop results table. Mobile cards repeat the votes and are ignored. It validates the election identity, required roster, unique ballot identifiers, safe integer counts, every party’s contribution to the national valid-vote total, valid plus invalid against votes cast, and votes cast against eligible voters. All counts belong to the same national publication; this adapter does not require a second CSV publication. Unknown lists are included with a warning, never discarded.

The source’s explicit `תוצאות נכון ל- DD/MM/YYYY HH:mm` timestamp is converted from `Asia/Jerusalem`, including daylight saving time. It remains `null` if not published. The notice that final results will be published later identifies provisional results; it is not a final-results declaration. When the source provides no reporting percentage, the subtitle shows reported votes as a share of estimated voters, using eligible voters × 0.777 (assumed overall turnout of 77.7%), and labels that denominator as an estimate.

At very early counts the integer quota can produce an unresolved or invalid allocation. Valid vote totals remain visible, with the engine’s diagnostic. Coalition and seat charts appear only after a complete valid allocation; incomplete seats are not presented as a finished distribution. Next-seat scenarios also remain unavailable when the count is too small.

The adapter contract remains `ElectionSourceAdapter.fetchSnapshot(config): Promise<ElectionSnapshot>`. The engine and UI consume only normalized snapshots. `src/config/election2022.ts` and the legacy HTML/CSV adapter are retained for historical regression tests and the explicit offline demo. Demo mode selects the 2022 configuration as well as its data, so current agreements are never applied to the old election.

`ELECTION_SOURCE_URL` can override the national endpoint, but does not change the election identity. Remove any old `votes25` override from deployment settings and redeploy. The runtime requires a restart after configuration changes.

## Allocation mathematics

The engine is pure TypeScript in `src/lib/engine.ts`. Inputs are safe integer counts; decisive multiplications and rational comparisons use `BigInt`. JSON fractions retain integer numerator/denominator strings.

1. Compute `ceil(allValidVotes × 13 / 400)`. All valid votes, including votes below the threshold, count toward the threshold.
2. Sum qualifying votes `V`. The statutory general quota is `floor(V / seats)`, per [section 81 of the election law](https://www.gov.il/BlobFolder/guide/knesset-elections-law/he/laws_elections-law-book_electionslaws_knesset25.pdf). Initial party seats are `floor(partyVotes / statutoryQuota)`.
3. Treat each effective agreement as one unit; other qualifying parties remain independent units. Compare each unit's `votes / (currentSeats + 1)` using exact cross-products, award one surplus seat, and repeat.
4. Recalculate the internal paired allocation using the pair's seats and its own quota under section 82(b). Keep a chronological trace of the winning unit, recipient, exact unit indicator, exact personal indicator, and all competing unit indicators.
5. Apply the statutory restriction on awarding a seat majority without a majority of qualifying votes. Reject impossible initial totals; do not force an invalid snapshot into 120 seats. An unresolved highest-average tie yields a diagnostic requiring an official draw, rather than iteration-order selection.

The exact tab repeats the calculation with the **unrounded quota** for comparison. Its alternative seat counts are labeled mathematical comparisons, not official allocations. Both methods happen to agree on the final 2022 allocation, but their quota values differ.

### Simple fractional quota versus an additional final seat

The analytical simple quota is `V / 120` **without rounding**. A party's raw equivalent is `partyVotes × 120 / V`. If that equals 29.80, its simple fractional progress is 0.80 and its simple gap is 0.20. At an exact integer the progress is 0 and the gap to the next quota is 1.00. The statutory initial seats can differ from the integer part of the raw equivalent because the legal quota is rounded down first.

This simple gap is **not** the votes needed for another final seat. The next-seat metric adds hypothetical votes to one party and to the national valid total, holds all other parties fixed, and reruns threshold qualification, initial seats, effective agreements, and the complete surplus allocation. The target is one above the party's **current final seats**. Exponential search bounds the answer, binary search finds it, and adjacent vote counts verify the boundary. Results are cached with the snapshot.

For a below-threshold party, the table instead shows the addition needed to qualify while the national denominator increases. For example, final-2022 Meretz is 4,062 below the **current** threshold, but needs **4,198 added valid votes** to reach the moving threshold.

The main numeric next-seat result is the minimum **definite** gain when a draw lies exactly on the boundary. For final-2022 Shas, 27,327 added votes produce a tied internal indicator; 27,328 gives the next seat without that draw. The UI explicitly shows both facts. More complicated unresolved ties produce “unavailable.”

This is an election-sized, practical what-if search, not a general solver for all synthetic apportionment paradoxes. It is disabled when the integer quota is smaller than the number of seats. It checks adjacent counts and returns a diagnostic on an invalid or unverified boundary. It is **not a forecast** and does not assume the hypothetical votes correspond to real outstanding ballots or the electorate's remaining capacity.

## On-demand refresh, persistence, and statuses

- Page load calls `GET /api/results`; clicking Refresh calls `POST /api/refresh`. Both await a server-side fetch of the official 2026 national page. No fetch is triggered by elapsed time or tab visibility changes.
- A single shared in-flight refresh prevents overlapping requests within one instance. Reloads and button clicks share a 10-second minimum interval; requests during the cooldown return the current state.
- After failures, a user may retry after 120, 240, 480, then at most 900 seconds. This is a retry cooldown, not a scheduled automatic request. The last valid snapshot remains visible with a stale/error message. Failed data never replaces it.
- Neither endpoint accepts arbitrary upstream URLs. Browser HTTP caching is disabled. The UI shows the last retrieval time and explicitly states that refresh is on demand.
- Two distinct successful snapshots are saved with atomic rename. Unchanged successful retrievals update retrieval time without erasing the last meaningful deltas. Cache files are namespaced by election, configuration, mode, and store version.
- On restart, validated saved data starts as stale until a successful retrieval. Corrupt or incompatible cache data is not presented as valid.
- Source publication status (`unknown`, `provisional`, `final`), connection health, testing state, and offline mode are separate fields. Official mandates are compared with computed seats and never overwrite them.
- Coalition changes apply the same currently selected party set to the preceding snapshot. Browser coalition storage is isolated by election and roster.

Environment settings are documented in `.env.example`. `ELECTION_CACHE_DIR` defaults to `.cache/elections` locally and a directory under the OS temporary directory on Vercel. `ELECTION_STALE_AFTER_MS` defaults to 180,000 milliseconds. The former `ELECTION_POLL_INTERVAL_MS` setting is no longer used.

## Fixtures, tests, and reference workbook

`fixtures/2026/` contains the browser-captured official national DOM, normalized snapshot, and capture provenance. It is a regression fixture, never a fallback for live official mode. `npm run capture` explicitly captures the current 2026 national page; `npm run capture -- --saved` regenerates JSON from the saved page while preserving capture provenance. An HTTP failure aborts capture before replacing fixtures.

The separate `surplus-regression.json` snapshot preserves the 28 October 07:57 Israel-time publication (2,937,354 valid votes), with its own provenance. It reproduces the missing Arab surplus agreement's effect: 56 current-coalition seats without the agreement, 55 with it, while all 120 seats remain allocated.

`fixtures/2022/` retains the original official HTML/CSV, normalized snapshot, provenance, and independently extracted workbook snapshot. `npm run capture -- --2022 --saved` regenerates that historical snapshot. Do not recapture fixtures as part of routine tests.

The official fixture validates 4,764,742 valid votes, 29,851 invalid votes, 4,794,593 votes cast, and 6,788,804 eligible voters. The engine reproduces 113 initial seats plus 7 surplus seats, all official final party totals, and the exact surplus order.

Tests cover thresholds and exact boundaries, fractions, active/inactive agreements, independent lists, exact 2022 allocation, next-seat boundaries and bounded brute-force comparison, vote changes, input errors, source reconciliation, connection failures, single-flight refreshes, backoff, persistence, and snapshot changes. See `docs/workbook-audit.md` for the four-sheet workbook review.

## Remaining limits

- Live local retrieval and manual refresh succeeded with isolated WebKit after direct Node/curl requests returned HTTP 404 or an AWS browser-verification challenge. The Vercel container now provisions WebKit and its system dependencies; successful retrieval from Vercel still requires deployment verification.
- The observed 2026 source provides an update timestamp but no reporting-progress percentage. Layout changes or inconsistent publications are rejected and leave the previous validated snapshot visible.
- Persistent restart recovery is supported by one Node process with a durable cache directory. Vercel supports on-demand fetching with per-instance temporary caching; durable shared state and cross-instance request coordination need an external store.
- Exact ties without a simple adjacent definite boundary remain unresolved. Pathological tiny-count scenarios do not receive a fabricated next-seat figure.
- Exit polls, authentication, and cross-device coalition synchronization are not included.
