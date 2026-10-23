# Workbook reference review

Reviewed all four sheets of the supplied `בחירות.xlsx` through their stored cell values, formulas, references, and hidden-sheet metadata. The workbook has no external query connection; the `נתונים` sheet contains pasted values. Its cached results are reference evidence, not a fresh Excel recalculation. The original workbook is preserved unchanged and is not read by application code or tests.

## Reconstructed snapshot

The forty rows in `נתונים` reconstruct **4,763,694 valid votes**, **29,947 invalid votes**, and **4,793,641 votes cast**. This is an intermediate 2022 snapshot and differs legitimately from the final official counts. The stored update clock is 17:09 (`נתונים!G3`) with no calendar date. The fixture intentionally leaves the official timestamp unavailable; its placeholder date is documented as unknown in the fixture warnings.

The corrected engine returns threshold **154,821**, qualifying votes **4,345,639**, statutory quota **36,213**, and **113 initial + 7 surplus seats**. Final party seats match the workbook's cached final distribution. Labor–Meretz is inactive. The official final snapshot is validated independently.

## `נתונים` — source inputs

Columns A–D store official Hebrew names, ballot letters, displayed percentages, and votes for forty lists. Cells G1–G3 store votes cast, invalid votes, and a clock value. Useful behavior retained: party lookup through ballot letters rather than row position. The application independently retrieves counts; it recomputes percentages from exact votes rather than copying rounded source percentages.

## `נוסחאות` — allocation and indicators

The sheet determines qualification, raw quota equivalents, floored initial seats, paired-unit highest averages, ranked surplus indicators, and the party receiving each surplus seat. It correctly captures the practical two-stage surplus-agreement idea used as the implementation cross-check.

Corrections and generalizations:

- `C2=SUM(C3:C41)` and the qualification denominator omit row 42's **1,669 votes**, while the visible results total includes them. Consequently, the qualification denominator is 4,762,025 instead of 4,763,694. This does not change the qualifying parties in this particular snapshot, but would matter near a boundary.
- `K2` searches only `C3:C32` for qualifying votes, while other formulas extend to row 41 or 42. `J2` counts initial seats only through row 20. The code uses the complete normalized roster.
- `K2` uses an unrounded simple quota (36,213.658333…), while section 81 specifies the integer quota. The app retains the exact quotient as an analytical metric and comparison tab, with statutory allocation primary.
- Fixed five-indicator ranges and `RANK`/`COUNTIF` blocks depend on bounded, hardcoded spreadsheet ranges. The code allocates until the configured seat total is reached and compares indicators exactly.
- Equal ranked values can make rank-based counting ambiguous. The application returns a clear unresolved diagnostic rather than assigning by row order.
- Fixed party pairing cells are replaced by election-specific, validated configuration.

## `תוצאות` — dashboard and scenarios

Useful capabilities reproduced: main results, simple missing fraction (`I3`), surplus order, wasted votes, named list sorting, and a selectable coalition sum (`W18`). The new next-final-seat simulation extends the workbook's simpler quota-gap metric.

Corrections:

- `W2` hardcodes 70.17% turnout. `W3=W1*W2` estimates 4,763,703.767 voters; `W6=W4/W3` then displays **100.628% coverage**. The application calculates turnout from votes cast divided by eligible voters, and does not infer reporting progress.
- The “safe in the Knesset” label (`H3` and its shared range) compares votes against 3.35% of estimated turnout. It is removed. Threshold status only describes the current published snapshot.
- `W9=W8/W3` divides wasted votes by the turnout estimate. The application uses all valid votes.
- Fixed partisan coalition formulas and editorial output text (`B2`, `N17:N20`) are removed. The coalition calculator accepts any selection and neutral optional configured groupings.

## Hidden `abc` — ordering and threshold watchlist

This sheet provides threshold vote and percentage-point margins, ranks vote/seat totals, and prepares a near-threshold subset. Its `J2=ROUNDUP(SUM(D2:D50)*3.25%,0)` independently preserves the correct full-roster threshold for this snapshot. The app reproduces threshold margins and sorting directly from the same authoritative normalized vote set used for allocation.

Fixed watchlist rows, copied references, and small numeric offsets used to break sorting ties are replaced by stable identifiers and explicit sorting. Sorting never determines allocation.

## Runtime independence

The one-time extracted JSON files are deterministic regression fixtures. Production reads official source responses or the explicitly selected normalized demo JSON only. No `.xlsx` reader dependency is installed, and the Excel file is unnecessary for `npm test`, `npm run build`, `npm start`, or offline demo operation.
