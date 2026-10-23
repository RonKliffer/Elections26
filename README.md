# עד 120 — Israeli Knesset results dashboard

Hebrew RTL dashboard with independently calculated Bader–Ofer seats, surplus agreements, next-seat vote scenarios, threshold analytics, and a coalition calculator. Built with Next.js App Router, strict TypeScript, Tailwind CSS, and Vitest.

The default is **official-source mode against the final 2022 election**. Every screen labels this as a test environment for the 2026 project. Excel is a development reference only: the application, build, tests, and offline demo require no spreadsheet software or workbook access.

## Run locally

Use Node.js **24 or newer** (the `.nvmrc` selects 24).

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The server starts its polling service automatically. Successful source data is shared by all viewers; browser requests do not independently contact the government site.

```sh
npm test
npm run typecheck
npm run build
npm start
```

`npm start` runs a persistent production Node server on loopback. For a network-facing deployment, run it behind a reverse proxy on the same host, or use `node --use-system-ca node_modules/next/dist/bin/next start --hostname 0.0.0.0`. Provision a persistent, writable cache directory. Run **one application process**, without a cluster or multiple replicas. The scripts use Node's system CA trust; TLS verification remains enabled.

No external database, API keys, remote fonts, or Excel runtime are required. The build does not fetch election data. Supply environment values before starting the server and restart after changing them.

## Offline demonstration

Set `ELECTION_DATA_MODE=demo` in `.env.local` and restart. This reads `fixtures/2022/official.json` and displays an explicit offline demonstration label. The original source status and original capture provenance remain distinguishable from the app's current fixture-read time. **An official-source failure never switches to demo mode.**

## Configuration and changing to 2026

Edit `src/config/election.ts`:

1. Set `electionId`, `electionName`, and `testing` for the actual election.
2. Set `sourceUrl`, or override it with `ELECTION_SOURCE_URL`.
3. Replace `expectedBallots` with the complete official roster. Party IDs use official ballot letters within an election, never display-name or row-position matching.
4. Update the `parties` display labels and neutral colors. Unconfigured source parties are included with default colors and an explicit warning.
5. Replace `surplusAgreements` with the new official pairs. One party may appear in at most one pair. Both parties must qualify independently. **The supplied four agreements belong to 2022.**
6. Optionally add noneditorial named `blocs`; users may also save their own selections in their browser.
7. Confirm the legal `electoralThreshold` rational value and `totalSeats`. The 2022 configuration uses `13/400` and 120.

The source contract is `ElectionSourceAdapter.fetchSnapshot(config): Promise<ElectionSnapshot>`. If the future website changes, implement or modify the adapter in `src/lib/source.ts` and select it in `src/lib/server/runtime.ts`. Keep source selectors, export links, parsing, and source reconciliation inside this layer. The engine and UI consume the normalized snapshot only.

The current adapter retrieves the [official national HTML](https://votes25.bechirot.gov.il/) and discovers its [official city CSV](https://media25.bechirot.gov.il/files/expc.csv). It extracts a literal export URL without executing source JavaScript. It validates each city's valid/invalid/cast totals, every party column, duplicate places, national totals, and every national party count. External envelopes are included. A mismatch during an asynchronous source publication keeps the preceding valid snapshot until the sources reconcile.

The current final page does **not** provide an official update timestamp or reporting percentage. These fields are `null`, never inferred from HTTP dates, turnout, or the app's retrieval time. A future adapter may populate them only from explicit source evidence. Optional unavailable totals are displayed as unavailable.

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

## Refresh, persistence, and statuses

- Official polling defaults to 60 seconds, with a 20-second timeout per request. HTML and CSV are fetched server-side.
- A single shared in-flight refresh prevents overlapping polls. Manual refresh has a 10-second minimum interval and respects failure backoff.
- Failures back off to 120, 240, 480, then at most 900 seconds. The last valid snapshot remains visible with a stale/error message. Failed data never replaces it.
- Browsers read the cached API every 10 seconds while visible. `GET /api/results` returns the state; `POST /api/refresh` requests a shared refresh. Neither accepts arbitrary upstream URLs.
- Two distinct successful snapshots are saved with atomic rename. Unchanged successful retrievals update retrieval time without erasing the last meaningful deltas. Cache files are namespaced by election, configuration, mode, and store version.
- On restart, validated saved data starts as stale until a successful retrieval. Corrupt or incompatible cache data is not presented as valid.
- Source publication status (`unknown`, `provisional`, `final`), connection health, testing state, and offline mode are separate fields. Official mandates are compared with computed seats and never overwrite them.
- Coalition changes apply the same currently selected party set to the preceding snapshot. Browser coalition storage is isolated by election and roster.

Environment settings are documented in `.env.example`. `ELECTION_CACHE_DIR` defaults to `.cache/elections`; `ELECTION_STALE_AFTER_MS` defaults to at least three polling intervals.

## Fixtures, tests, and reference workbook

`fixtures/2022/` includes the original official HTML/CSV, normalized official snapshot, capture provenance, and the independently extracted workbook snapshot. `npm run capture` explicitly recaptures the official fixture; `npm run capture -- --saved` regenerates JSON from the existing raw fixture. Do not recapture fixtures as part of routine tests.

The official fixture validates 4,764,742 valid votes, 29,851 invalid votes, 4,794,593 votes cast, and 6,788,804 eligible voters. The engine reproduces 113 initial seats plus 7 surplus seats, all official final party totals, and the exact surplus order.

Tests cover thresholds and exact boundaries, fractions, active/inactive agreements, independent lists, exact 2022 allocation, next-seat boundaries and bounded brute-force comparison, vote changes, input errors, source reconciliation, connection failures, single-flight refreshes, backoff, persistence, and snapshot changes. See `docs/workbook-audit.md` for the four-sheet workbook review.

## Remaining limits

- The future 2026 source structure, official roster, legal settings, and surplus agreements must be verified before changing out of testing mode. The 2022 adapter cannot promise compatibility with an unpublished source.
- No official update timestamp/reporting-progress field exists in the presently observed final page. These remain unavailable.
- One persistent Node process is supported. Multi-instance/serverless coordination needs a shared store and distributed polling lock.
- Exact ties without a simple adjacent definite boundary remain unresolved. Pathological tiny-count scenarios do not receive a fabricated next-seat figure.
- Exit polls, authentication, and cross-device coalition synchronization are not included.
