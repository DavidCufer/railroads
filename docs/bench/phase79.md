# Phase 79 — why 1870 is so rich and Hard is not harder

Branch `phase-79-balance` (from `phase-77-strongbot` 1a14560). Investigation only: nothing under `src/` changed. Bench: V2 strong player (`strongPlayer.ts`), V1 (`strongPlayerV1.ts`) and the cautious bot (`goodPlayer.ts`), central-eu. Raw rows `phase79-runs.md`; per-line-type books `phase79/*.txt`; medians `phase79-summary.md` (`phase79Summary.ts`); era tables `phase79Eras.ts`. Year n = nth year played. **Sweep runs end at year 11 (1870, 1900) or 16 (1840) to fit the 15-minute pieces; "y10" is the tenth year played.** 2-3 seeds per cell.

## 1. 1870 decomposed (V2, Normal, seed 1; books by line type, `phase79/lines-*-normal-seed1.txt`)

| | 1840 (year 16 = 1856) | 1870 (1886) | 1900 (1916) |
|---|---|---|---|
| revenue / operating profit $M | 7.0 / 4.1 | 11.3 / 6.3 | 10.9 / 3.8 |
| operating ratio | 0.41 | **0.44** | **0.66** |
| trunk passenger lines (tiles of 5 km) / trains | 13 / 496 / 90 | 13 / 496 (+4 feeders 85) / 111 | 11 / 425 / 84 |
| trunk revenue per tile-year / per train | 14.1k / 78k | 21.2k / 117k | 24.2k / 151k |
| operating cost per train-year | 28k | 44k | 85k |
| capital invested (track, stations) per km | 5.1k | 8.8k | 6.4k |
| operating profit / capital invested | 0.30 | 0.25 | 0.28 |

**Where 1870's money comes from (1886): trunk passenger lines 10.5M of 11.3M (93 %); mail 0.29M; feeders 0.29M (2.6 %: 3 trains); freight 0.04M; the silver/ore chain 0.48M.** The Phase 77 note that V2's strength is "trunk lines plus feeders" is half right: it is the trunk network; feeders are noise. Revenue per tile grows 15.6k -> 21.2k as the network grows 46 -> 496 tiles (Phase 62: a station catches trips to every town the network reaches, so revenue per km rises with network size).

Mechanisms (the table `phase79Eras.ts` has the inputs):
1. **Demand steps up 3x between 1850 and 1860 (`TRIPS_PER_HEAD_ANCHORS` 0.0113 -> 0.0338) and then stays flat to 1950, while every cost keeps rising.** 1870 therefore has 1900's demand (0.0268 vs 0.0262 trips/head/month) at 1870's costs: wage index 2.07 vs 3.28 (+58 %), best engine 67k / 7.4k a year (American 4-4-0) vs 174k / 19k (Atlantic), +2.6x, porters from 1870 either way. Fare per carload only falls 10 % (2227 -> 2004 $). The operating ratio goes 0.44 -> 0.66 and per-train cost doubles, which is the whole 1870 vs 1900 gap. 1840 is on the ramp: the same bot earns 2.5M at year 10 (1850, demand 0.009) and 7.0M at year 16 (1856, 0.020): an 1840 start that ran on to 1860 would look like 1870. The 1840 "moderately easy" is the ramp arriving.
2. **Return on capital is 25-50 % a year in every era (payback about two years), against 3-5 % for real railways.** Operating profit / capital invested is 0.30 / 0.25 / 0.28 at year 16 and 0.49 at year 10 in 1870 (4.9M / 10.0M). Revenue per km is realistic (a bot trunk line earns about $4.2k per route-km in 1886; British passenger receipts were of the order of $4k per route-km in 1870, from memory of the Railway Returns: approximate, not checked against a table), and the operating ratio (0.44 in 1870, 0.66 in 1900) is near Britain's 0.5-0.6; what is far off is **capital per km**: $5-9k per km all in (`TRACK_BASE_COST_PER_TILE` $2,000 a 5 km tile at 1830 prices, $400 a km), against roughly $20-40k per km for US lines of the 1870s and over $100k per km in Britain (approximate, from memory). Mitchell, Chambers and Crafts (Economic History Review 2011, [Warwick copy](https://wrap.warwick.ac.uk/id/eprint/1357)) find British return on capital below the cost of capital after the mid-1870s. In the game a good player's money compounds so fast that cash is never the limit — which is also why Hard (item 2) does nothing.

## 2. Hard decomposed

Hard differs from Normal in `src/data/finance.ts` (`DIFFICULTY`): start cash 600k (vs 1,000k), `buildCostMult` 1.2, `landMult` 1.5, `breakdownMult` 1.5, `interestRate` 8 % (6), `leveragePremium` 0.2 (0.12), `graceMonths` 2 (3), `creditMult` 0.6, `taxMult` 1.6, `taxYearShift` +10 (the 1910 tax steps start in 1900), `panicChance` 1 (0.8), depth x1.3, duration x1.25, `panicCreditMult` 0.3 (0.6), `riskDebtRatio` 0.5 / `riskPremiumMax` 0.06; contracts pay 0.8x with 0.85x deadlines. **`revenueMult` is 1.0 on Hard.** Each lever alone on Normal 1870 (V2, seeds 1-3, operating profit $M at year 10, median; `phase79-summary.md`):

| lever (Normal + that Hard value) | y10 profit | vs Normal 5.12 |
|---|---|---|
| none (Normal) | 5.12 [4.93-6.53] | |
| start cash 600k | 6.73 | +31 % |
| build cost x1.2 | 5.84 | +14 % |
| land x1.5 | 8.14 | **+59 %** |
| breakdowns x1.5 | 5.40 | +5 % |
| interest 8 % + leverage premium | 4.80 | -6 % |
| credit (limit x0.6, grace, risk calls, panic credit) | 4.90 | -4 % |
| panics (always, deeper, longer) | 5.75 | +12 % |
| **all of Hard** | **4.34** | **-15 %** (NW $16.0M vs $18.1M) |

(Tax is zero in these runs: the shifted steps start in 1900, the runs end 1881. 1900 Hard: y10 1.29 vs Normal 1.96, -34 %, with the tax from year 1.)

**Shrugged off, and why.** Everything Hard changes is a one-off cost of capital or credit; with a payback of two years each is a delay of months (Hard y5 profit 1.37 vs 1.46; the bot is rich by year 8 either way). Four levers come out *positive*, which is not a mechanism but the bot: land x1.5 reroutes V2 to different pairs (same 516 tiles and 13 trunk lines, but 23.2k revenue per tile vs 17.3k, `phase79/N+land_LINES-*` vs `N_LINES-*`), so the lever table is dominated by **map/route luck of +-30 % per seed** (Normal seeds 1-3: 4.93 / 6.53 / 5.12). Only the combination is measurably harder (-15 % at year 10, -34 % in 1900, where tax bites) and at year 16 Hard 1870 is *richer* than Normal (7.57 vs 6.50, Phase 77). A lever that acts on the margin is the only kind that bites: Hard revenue x0.9 below.

## 3. Proposals, ranked (V2 operating profit $M; Normal/Hard medians of 2-3 seeds; baseline from the same runs; `phase79-summary.md`)

Sensitivity is steep because track, crews and head office stay while revenue falls (as Phase 69 found): fare x0.85 cut 1870 y10 profit by 60 %, x0.7 by 82 %; build x2 by 46 %, x3 by 80 % (the bot stalls at 8 trains); Hard revenue x0.85 by 46 %, x0.7 by 71 %. Those are too strong; the sized proposals below were then run on 1840 / 1900 and on the old and cautious bots.

| # | change | V2 1870 N y10 | V2 1840 N y10 / y16 | V2 1900 N y10 | V1 1870 / 1840 y16 / 1900 | cautious 1870 / 1840 y16 / 1900 | bankrupt |
|---|---|---|---|---|---|---|---|
| base | | 5.12 | 1.45 / 4.46 | 1.96 | 1.06 / 3.31 / 1.40 | 3.76 / 2.75 / 0.96 | 0 |
| **1** | **Hard `revenueMult` 0.9** (Hard only) | Hard 4.34 -> **2.88** (-34 %) | Hard 1.40 / 5.08 -> 1.06 / **3.88** (-24 %) | Hard 1.29 -> 1.23 (-5 %) | n/a | n/a | 0 |
| **2** | **real passenger fare x0.92** (all anchors) | **3.56** (-30 %) | 0.81 / 3.31 (-26 % y16) | 1.53 (-22 %) | 0.83 / 3.24 / 1.39 | 1.87 / 1.94 / 1.01 | 0 |
| 3 | build cost x1.5 (all eras) | 3.58 (-30 %) | 0.34 / 2.34 (-48 %; y10 -77 %) | 1.27 (-35 %) | 2.22 / 1.38 / -0.15 | 1.51 / 0.67 / 1.18 | 0 |
| 4 | demand step 1850-60 moved to 1850-75 | 5.17 (0 %) | 1.45 / **1.45** (-67 %) | 1.96 (0 %) | 1.04 / 1.21 / 1.40 | 3.57 / 0.84 / 0.96 | 0 |

1. **Hard `revenueMult` 0.9** (maybe 0.85 for 1830-1870 starts). Mechanism: Hard is "harder" only through capital levers that a two-year payback ignores, so give Hard a margin lever. Reason: Hard's tax is the one existing margin lever, and it starts in 1900; this is the equivalent for earlier starts (e.g. rate regulation / rate wars as on Hard). Effect measured on V2 Hard: 1870 -34 %, 1840 -24 %, 1900 -5 % (the 1900 tax already bites). Only Hard changes, so Normal goals (Phase 77) stay valid. No effect on Normal bots.
2. **Real passenger fare x0.92 on every anchor** (sourced story: 1844 Act and cheap-fare competition kept pushing real fares down). Effect: 1870 -30 %, 1840 -26 %, 1900 -22 %; old bot -22 % / -2 % / -1 %, cautious -50 % / -29 % / +5 %. Broad and cheap but it moves the goals again (re-derive Phase 77's table).
3. **Build cost x1.5 for all eras** (capital per km is the sourced gap: 5-9k vs 20-100k). Effect: 1870 -30 %, 1900 -35 % but 1840 -48 % at year 16 (-77 % at year 10: it lengthens the poor start), and V1 goes to -0.15M in 1900 and the cautious bot drops to 0.67 in 1840 (-76 %): **risky for the early eras and weak players**; if used, ramp it with era (x1.5 only for starts from 1860) rather than flat.
4. **Not recommended: moving the demand step.** It does not touch 1870 where the trips table is already flat at 0.0268 in 1870 vs 0.0338 x0.8 = 0.0270 in 1860+; it cuts 1840 year 16 by two thirds. The real fix for "1870 has 1900's demand with 1870's costs" is on the cost side.

Caveats (read before deciding): 2-3 seeds per cell and about +-30 % seed noise (lever table); sweeps stop at year 11 (1870, 1900), so "-30 % at year 10" is not a year-16 figure (the year-16 1870 baseline is 6.5M); 1930 and 1950 were not tested; V1 is erratic (build x1.5 raises its 1870 profit). The capital-per-km and revenue-per-km real figures are from memory and should be checked before the owner relies on them; only the Mitchell-Chambers-Crafts conclusion (below cost of capital after the mid-1870s) came from a source. No bot went bankrupt in any run.
