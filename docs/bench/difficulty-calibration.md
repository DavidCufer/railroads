# Difficulty report: bands and calibration (Phase 83)

`npx tsx tools/bench/difficulty.ts <region | scenarioId | random:SEED> [startYear] [easy|normal|hard] [--quick] [--seeds N] [--years N] [--size S] [--out FILE] [--raw FILE | --from FILE]`

Tools only: `tools/bench/difficulty.ts` (CLI, runs the plays in parallel processes), `tools/bench/difficulty/play.ts` (one play), `tools/bench/difficulty/rating.ts` (the pure rating), test `tests/bench/difficulty.test.ts`. Nothing under `src/`.

## The three players (settings of the one Strategist bot, no new bots)

| player | what it is |
|---|---|
| strong | the Strategist (`attachStrategist`): looks 18 months ahead on forked copies of the game, 4 projects + waiting. `--quick`: 6 months ahead, only the best project against waiting, one decision every 60 days (the bot builds its default best project in between). |
| cautious | the plain V2 policy with `setBorrowScale(0.4)`: it borrows 40 % as much as V2 (the first line still uses the start-up credit). No lookahead. |
| sloppy | the plain V2 policy whose chooser, from its own seeded generator, waits 10 % of the time, builds a random affordable project (not the best) 40 % of the time and the best one otherwise. No lookahead. |

The only change to existing bot code is `setBorrowScale` in `strongBot.ts` (default 1, so plain V2 output is unchanged) and a `decideEveryDays` option of the Strategist (default 0 = unchanged).

## What a report measures (per player and seed)

Operating profit of the completed years 5 / 10 / 16; bankruptcy (and the year); months to the first operating profit (trailing three months positive, with a train running); years until the operating profit since the first line was finished has paid back that line's capital; the share of months (after year 2) when cash was over 20 % of net worth (money the company could not use); length of the first lines in tiles; the downturns (panics) in the horizon from the game's own panic schedule. A survey of a fresh game gives the number of projects that pay back within 9 years, the best payback and how far apart the best town pairs are.

## The rating

The rating is a **trouble score** (0 = nothing in the way). Five parts, each a straight ramp that only grows when the map gets worse (the test checks this one input at a time):

| part | max | how it grows |
|---|---|---|
| profit | 3 | the best player's median year-5 operating profit over the starting cash: 1.0 or more = 0 points, 0 or less = 3 |
| failure | 6.5 | bankrupt share of runs: 4 x strong + 2 x cautious + 2.5 x sloppy |
| slow start | 2 | average of: months to first profit (6 months = 0, 36 or never = 2) and years to pay back the first line (2 = 0, 8 or never = 2) |
| skill gap | 1.5 | 1 - sloppy / best profit: 10 % = 0, 60 % or more = 1.5 |
| crisis | 1.5 | depth of the deepest downturn inside the horizon: none = 0, 30 % fall in demand or more = 1.5 |

"Best player" is the best median of the three players. A full run always has the Strategist on top, but the short quick lookahead can fall behind a plain policy (1840, 1860 and 1930 do), and the rating should not depend on that.

**Bands** (score below the edge): **easy** < 2.5, **fair** < 4.5, **hard** < 6.5, **brutal** 6.5 or more.

### Calibration table (central-eu, seed 1 for the Strategist, seeds 1-3 for the plain players, `--quick`, 8 years)

| map | score | rating | strong / cautious / sloppy y5 profit $M | bankrupt (strong, cautious, sloppy) | biggest downturn | main reason |
|---|---|---|---|---|---|---|
| 1840 normal | 1.0 | **easy** | 0.32 / 0.40 / 0.76 | 0, 0, 0 of 3 | mania crash year 7.5 (-5 %) | money comes, but modest: profit about 0.8x the start cash |
| 1860 normal | 0.0 | **easy** | 1.11 / 2.20 / 2.79 | 0, 0, 0 | none | nothing in the way |
| 1870 normal | 0.3 | **easy** (target: easy) | 1.37 / 1.32 / 1.22 | 0, 0, 0 | Panic of 1873 (-6 %) | first line pays back in 1.3 years; sloppy play loses only 11 % |
| 1870 hard | 1.5 | easy | 1.24 / 0.91 / 1.00 | 0, 0, 1 of 3 | Panic of 1873 (-7 %) | one sloppy run goes bankrupt; otherwise the same as normal |
| 1900 normal | 0.8 | easy | 0.83 / 0.62 / 0.93 | 0, 0, 0 | Panic of 1907 (-13 %) | late crisis, forgiving start |
| 1900 hard | 0.8 | easy | 1.26 / 1.11 / 1.28 | 0, 0, 0 | Panic of 1907 (-17 %) | as normal |
| 1920 normal | 3.5 | **fair** | 0.31 / 0.32 / 0.29 | 0, 0, 0 | Crash of 1929 at year 9 (-28 %) | thin profit (0.3x the start cash) and a deep crash coming |
| 1930 easy | 0.8 | easy | 0.69 / 0.81 / 1.70 | 0, 0, 0 | none in range | no downturn in the first 8 years |
| **1930 normal** | **7.5** | **brutal** (target: brutal) | 0.33 / 0.26 / 0.00 | 0, 0, **2 of 3** | banking crisis of 1931 at year 1.7 (-42 %) | crisis in year 2; sloppy play is bankrupt in 2 of 3 runs; first line takes 4.7 years to pay back |
| 1930 hard | 1.7 | easy | 0.95 / 0.80 / 0.82 | 0, 0, 0 | banking crisis of 1931 (-55 %) | see "Findings" below |
| 1950 normal | 2.0 | easy | 0.80 / 1.04 / 0.91 | 0, 0, 0 | recessions of 1953 and 1973 (-9 %, -10 %) | quiet |
| random map seed 5, 1880 normal | 3.2 | fair | 0.83 / 0.53 / 0.03 | 0, 0, 1 of 3 | Panic of 1884 (-7 %) | skill matters: sloppy play earns 4 % of the strong profit and one run goes bankrupt |

Full-lookahead check (`difficulty-eras-full.md`, Strategist 18 months, 1 seed, 8 years): 1870 normal easy (0.7; Strategist year-5 profit 1.61M against 1.37M quick), 1930 normal brutal (7.2; 0.48M against 0.33M). The bands did not move.

The two anchors hold: **1870 easy** (0.3, edge 2.5) and **1930 brutal** (7.5, edge 6.5). The easy edge sits above the highest "everyday" era (1950 at 2.0) and below the first map with a real problem (1920 at 3.5, random seed 5 at 3.2). The hard / brutal edge (6.5) is below 1930's 7.5 and above everything else measured; **no era lands in the hard band**, so the 4.5 and 6.5 edges are set by reasoning (a map where the strong player is fine but ordinary play fails in most runs, or the strong player itself fails once, reaches 4.5 to 6.5) and not pinned by a measured era. Scenarios fill the gap (Coal for Trieste and Silver Rush rate hard by their margin rule). If a future run puts a known-hard map in that gap, move the edges here and in `BANDS` (rating.ts); `--from docs/bench/difficulty-runs.jsonl` re-rates all saved runs in seconds.

## The reasons, in plain words

The report lists up to four, strongest first:

- **even the lookahead player goes bankrupt**: the strong player failed in some runs. Always first.
- **ordinary play goes bankrupt**: the sloppy or cautious player failed in some runs; shows the percentages.
- **capital-limited**: the first line costs over 60 % of cash plus credit and cash never sits idle (under 5 % of the months): the player cannot build as fast as good projects appear.
- **crisis at year N**: a downturn of 8 % or more in demand falls in the horizon; the name, year and depth come from the game's own panic schedule. A coming crisis is why 1930 is brutal.
- **weak profit**: year-5 profit under about 0.5x the starting cash.
- **slow start**: first profit late, or the first line pays back in more than a few years.
- **skill matters**: sloppy play earns under 65 % of the best player's profit, so mistakes are punished.
- **few good town pairs**: three or fewer projects pay back within 9 years on a fresh map.
- **long distances**: the best passenger pairs are over 45 tiles apart.
- nothing in the way, when none applies.

## Scenarios

A scenario is rated by the margin the goal-directed Strategist (Phase 82b) wins with, not by the economy score: lost = brutal; won with 60 % or more of the allowed time left = easy, 25 % or more = fair, less = hard; for the survival goal the margin is the last-year profit over the top star's bar (1.5x = easy, 1.0x = fair, less = hard). Fewer stars than the solver reaches moves it one band harder.

| scenario | Strategist | rating | main reason |
|---|---|---|---|
| Semmering | won, 2 stars (solver 2), 71 of 72 months to spare | **easy** | the whole Vienna-Trieste line is built in month 1 with the first-line start-up credit (the owner flag from Phase 82b: the $450k start does not force staging) |
| Transcontinental | won, 2 stars (2), 83 of 84 months to spare | **easy** | same: one direct line in month 1 |
| Panic of 1873 | won, 3 stars (3), profit 1.42x the top bar | **fair** | survival needs debt repayment, not growth; it works but with only 40 % over the bar |
| Coal for Trieste | won, 2 stars (2), 9 of 96 months to spare | **hard** | a second mine at a very long payback is needed; the goal arrives with 9 % of the time left |
| Silver Rush | won, 2 stars (solver 3), 30 of 132 months to spare | **hard** | the silver chain (ore line, bars line, own stations) is built late; the Strategist finishes in June 1888, the solver in May 1885 (shared-station deadlock, Phase 82b) |

## Findings worth the owner's attention (not changed; tools and docs only)

- **Hard is not harder in these runs.** 1870 Hard rates 1.5 against Normal 0.3 (one sloppy bankruptcy), 1900 Hard equals Normal, and 1930 Hard (0.95M year-5 profit) is **easier** than 1930 Normal (0.33M), although its crisis is deeper (-55 % against -42 %). One seed each, so this is not proof, but it echoes the Phase 79/80 complaint that Hard does not play harder. The Phase 84 canary is the place to pin it.
- **The quick Strategist is not better than plain play in 1840, 1860 and 1930** (year-5 profit 0.32 against 0.76 in 1840; 1.11 against 2.79 in 1860). The cause is the short lookahead plus building only every 60 days; the full Strategist is far ahead of V2 (Phase 82). That is why the rating uses the best player.
- Scenario ratings depend on one run each (the scenarios have fixed seeds).

## How far to trust it

`--quick` is a coarse rating: one Strategist seed, an 8-year horizon and three seeds of the cheap players. Bankruptcy is a rare, seed-dependent event, so one more bad seed can move a map by a band; the full mode (3 seeds, 16 years) is the one to quote for a decision. Scores near an edge (2.5, 4.5, 6.5) should be read as "either side". The rating compares maps by playing them; it does not say how much fun they are.
