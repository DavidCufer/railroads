# Phase 90 step 1: why freight pays so little, and what would fix it

Branch `phase-90-route-demand`. Nothing in `src/` was changed for freight; the levers below are bench switches (`tools/bench/p90Env.ts`, `strongBot.ts` env options, rows in `docs/explore/data/pax89.jsonl`, table generator `tools/bench/freight90Table.py`).

## Why a freight train earned about 1/20 of a passenger train (plain words)

Phase 89 measured it in the bots' games, not in the rules. In the rules a freight train is fine:

1. **Hand-built, one train, one route** (`tools/bench/freightRoutes90.ts`, the balance fixtures): a coal or grain train earns **$60-150k a year**, the same as a train between two 12k towns, and a 40k-town passenger train earns $90-400k. Per train the gap is 1x to 3x, not 20x.
2. **One source is small.** A mine, camp or farm makes about 60 t a month, three carloads: about one train's worth. A pair of big towns carries 3-4 trains. So a freight *line* earns about one train ($40-50k profit) where a passenger line earns $0.3-0.8M.
3. **The track costs the same.** A freight line needs the same rails and two stations as a passenger line. The bot's own candidate list at 1870 shows it: passenger lines pay back in **1.1-1.6 years**, freight lines in **10-150 years** (`tools/bench/freight90.ts`).
4. **The bot builds the nearest buyer, at least 12 tiles away.** Fares grow with distance, loading and the train's fixed costs do not, so these short hauls pay almost nothing (a 15-tile grain line earned $0). Its estimate was right for such a line; the choice was the problem.
5. **Freight runs loaded one way** and is paid less per ton-km; late engines and wages are dear (a 1900 coal train: $142k revenue, $18k profit).

So the 1/20 is "nearest buyer, one source, full track bill, passengers always rank first", not a broken freight rate.

## Bench (V2 strong bot, central-eu Normal, 1840 / 1870 / 1900, seeds 1-2, 10 years, year-10 values, mean of the runs)

Route demand at pair share **0.33** (passenger income about 0.4-0.6 of today's at the same horizon: 1870 $2.9M against $6.0M, 1840 $1.0M against $1.6M, 1900 $2.6-3.8M against $3.8M). The curve is steep: 0.30 gives -45 to -75 %, 0.35 -30 %, 0.5 +55 %.

| configuration | runs | passenger $M | freight $M | freight share | profit $M | pax / freight trains |
|---|---|---|---|---|---|---|
| today's passenger model | 6 | 3.92 | 0.01 | 0 % | 2.04 | 50 / 0 |
| route demand 0.33, game as is | 6 | 2.42 | 0.00 | 0 % | 1.11 | 35 / 0 |
| + bot ranks freight first, best buyer | 6 | 2.31 | 0.05 | 2 % | 1.07 | 33 / 3 |
| + industry output x3 | 6 | 1.59 | 0.10 | 6 % | 0.73 | 23 / 10 |
| + freight rates x1.5 | 6 | 1.57 | 0.35 | 18 % | 0.83 | 24 / 10 |
| + output x3 and rates x1.5 | 6 | 1.05 | 0.24 | 18 % | 0.55 | 16 / 13 |
| + output x2 and rates x1.25 | 6 | 1.67 | 0.16 | 9 % | 0.81 | 24 / 10 |
| + freight rates x2 | 6 | 1.31 | 0.48 | 27 % | 0.81 | 19 / 9 |
| + output x2 and rates x1.5 | 4 | 1.36 | 0.31 | 19 % | 0.79 | 20 / 14 |

"Bot ranks freight first" is a bench policy (freight payback x 0.35, best of several buyers), the thing a player who wants freight does; without it the bot builds 0-3 freight trains whatever the levers (rows `r30*`, `r50*`).

## Levers -> value -> effect

| lever | new value | effect (bench above) |
|---|---|---|
| Freight base rates (all freight cargo; `CARGO[...].baseRate`, SPEC 8.1) | x1.5 / **x2** | freight share 18 % / **27 %** of passenger + freight income at year 10; profit $0.8M (route demand alone $1.1M); single runs reach 35-60 % |
| Raw producers' monthly output (`INDUSTRIES[...].produces`) | x2 / x3 | **small**: x3 alone 6 %; on top of rates x1.5 no gain (18 % -> 18 %), x2 with rates x1.5 19 %. Revenue per ton-km, not tons, is what limits a line |
| Bot (V2 and the Strategist, bench only): weigh several buyers and rank freight ahead | payback x 0.35 | needed: without it 0-2 % in every setting |
| Not benched: loads back (return cargo), longer minimum haul | | untested, no numbers |

Caveats: 10 years is short, freight lines are capital heavy and still ramping (profit is lower than route demand alone at year 10: $0.8M against $1.1M); 2 seeds per era, big spread between seeds; no tested setting averages 50 %.

## Proposal (for the owner's OK)

1. **Freight base rates x2** (the one lever that moved the share: 27 % average, up to about 60 % in single runs, rising with the years).
2. **No change to industry output.**
3. **The bots weigh freight like a player who wants it** (best buyer, payback x 0.35) in the step 4 re-bench; this is bot-side.
4. To get closer to half and half: rates x2.5, or a lower pair share. I would first look at 16-year runs of x2 in step 4 before going further.

Effects to expect from rates x2 (flag for approval, not applied): the balance bounds on freight against passengers (`tests/sim/balance*.test.ts`, e.g. pax/coal) move; I will not loosen any bound without your OK.
