# Exploration 2 (Phase 89): three new passenger models

Branch `phase-89-pax-explore` (never on main). Owner: "stations are always full, need lots of trains between few cities, way too much money, not transparent. Not the same model." Exploration only: the shipped game is unchanged (`PAX.model` is `"today"` unless `?debug=1&paxModel=route|service|ticket` or env `PAX_MODEL`; not saved). Code: `src/data/passengerModels.ts` (all numbers), `src/sim/stations/paxModels.ts`, panels `src/ui/paxModelView.ts`. Benches: `tools/bench/pax89.ts` (+`pax89Batch.ts`, resumable, rows in `docs/explore/data/pax89.jsonl`), `pair89.ts` (one busy pair), mock-ups `tools/bench/pax89Shots.spec.ts` -> `docs/explore/mockups/`.

## 1. Today, in numbers (central-eu, Normal, V2 = strong bot; Strategist 10 years; means over years 3..N)

| | V2 (9 runs: 3 eras x 3 seeds, 16 y) | Strategist (2 runs, 10 y; 1870 missing, still running) |
|---|---|---|
| passenger share of delivered revenue | **97-99 %** (every run) | 98 % |
| revenue per passenger train / freight train | **$89k / $4k** a year | $119k / $4k |
| profit per train (passenger / freight) | $62k / $2k | $86k / $3k |
| passenger trains / freight trains | 45 / 3 | 34 / 0.4 |
| trains on the busiest line | 8 (the bot's cap, always reached) | 8 |
| platform pile in whole trains at month end | 0.79 (1840 0.69, 1870 0.89, 1900 0.80); a full train waits in 29 % of station-months | 1.19; 30 % |
| people turned away | 23 % (1840 37 %) | 40 % |
| V2 year-16 profit / net worth, $M | 1840 3.4 / 11.6, 1870 5.5 / 25.4, 1900 2.9 / 12.5 | |

One busy pair (the two biggest towns 25-45 tiles apart, Milan-Turin, 4 cars, trains spaced evenly, double track), revenue k$/yr for 1..6 trains: 1840 186 212 226 237 234 262; 1870 269 531 665 774 784 783; 1900 525 807 785 803 789 812. It takes 2-4 trains to reach 90 % of the best, and a full train waits on 12-97 % of days.

Finding that matters for the target "passengers at most half": **freight is not an alternative today at all.** A freight train earns about 1/20 of a passenger train, and the bot builds almost none. So under every model below passengers stay 97-99 % of V2's revenue; a passenger model alone cannot reach "half".

## 2. The models

**A. Route demand.** Each pair of towns your trains connect has one number each way a month: share x sqrt(popA x popB) x trips per head, bent down by distance beyond 20 tiles. It does not depend on any other route (a hub is capped at 1.5x its own total). The platform holds 20 days of arrivals. Station panel: "Venice carried 43 of 43"; train panel: "carried 55 of 57 · another train adds ~2".

**B. Service-driven.** Same pair number is a ceiling (x1.3). What really travels is ceiling x (1 - exp(-departures a week / 0.4)), at least 12 %: the first trains add a lot, later ones little. Panel: "52 now · ceiling 56 · 1.1 trains a week". Faster engines and more trains grow it.

**C. Ticket office.** A town sells a fixed budget of tickets a month (22 % of its total); all of it goes to the destinations you serve, split by population / distance among those only. A second destination shares the budget, it adds nothing. Panel: "29 tickets a month: Venice 18 (62 %) · sold 18".

All three: platform holds 20 days (today 30), pay per distance as now. Same single-pair size at 1870 (route 2.8k, ticket 2.9k, service up to 3.5k people a year, today 3.7k).

## 3. Results (same bot, 2 seeds per era for V2, 1 for Strategist; pair test above)

| | today | A route | B service | C ticket |
|---|---|---|---|---|
| V2 mean revenue / yr-16 profit / net worth, $M | 8.1 / 4.0 / 16.5 | 2.2 / 0.84 / 4.7 | **3.7 / 1.46 / 7.0** | 1.3 / 0.40 / 3.0 (one 1900 run bankrupt) |
| passenger share of revenue | 98 % | 98 % | 99 % | 98 % |
| trains for 90 % of a busy pair (1840 / 1870 / 1900) | 4 / 4 / 2 | **3 / 3 / 1** | 6 / 4 / 4 | 3 / 3 / 1 |
| pair revenue at 1 / 3 trains, 1870, k$ | 269 / 665 | 269 / 593 | 237 / 611 | 269 / 602 |
| platform: pile in trains (V2) / full-train station-months | 0.79 / 29 % | 0.57 / 17 % | 0.55 / 19 % | 0.52 / 16 % |
| full train waiting on a pair, days, 1870 at 3+ trains | 12-50 % | 4-28 % | 7-23 % | 7-25 % |
| Strategist profit / net worth, $M (10 y) | 1.9 / 8.7 | 0.52 / 3.0 | 0.92 / 4.2 | 0.43 / 2.9 |

Notes and limits. Platforms are never at the 30-day ceiling, but a bot that adds a train when the pile exceeds a train load keeps piles near one train by construction. "Trains on the busiest line" is 7-8 under all models: that is the bot's cap (8) and its rule (sum of the piles of all stops), so the pair test above is the honest measure. Pair numbers above 3 trains are noisy (about +-10 %: arrivals bunch). Constants are first guesses (`pairShare` 0.28, hold 20 days, budget 0.22, service scale 0.4/week): V2's profit falls 63-90 % for every model, and the goals (Phases 77/84) would be re-derived in the build phase anyway. The bot's payback estimate is capped by the line's visible demand under the prototypes (`paybackEstimate.ts`, `strongBot.ts` `bestPaxLoco`); today's runs are unchanged (byte-identical on the 1870 check). Freight was not touched.

## 4. Ratings

| | transparency | few trains fill a pair | risk |
|---|---|---|---|
| A route | **best**: one number per pair, "carried X of Y", nothing hidden | **yes** (1-3) | too stingy as set (V2 profit -79 %); a pair is fixed, so growth needs more pairs; the 20-day hold still loses people on slow single trains |
| B service | medium: two numbers plus a hidden growth curve (trains a week) | no: rewards 4-6 trains, with diminishing returns | the only model that keeps V2 near half of today's profit; ceiling and curve are two knobs to explain |
| C ticket | medium: budget is visible, the split by population / distance is not | yes | hubs and multi-stop trains starve (they share one budget): V2 profit -90 %, bankruptcy in 1900; does not add to what route does for a pair |

## 5. Recommendation

**A, route demand**, recalibrated up (pair share about 0.5, so V2 earns about half of today's rather than a fifth), and **paired with a freight rebalance**, because no passenger model changes the 97-99 % passenger share: freight trains earn about $4k against $89k. If the owner prefers that growth should reward service, take B's trains-a-week curve as a second layer on A, not on its own. Skip C. Nothing is built until the owner picks; the build phase replaces the model, re-benches the bots and re-derives goals (Phases 77/84 method).

Mock-ups (real screenshots, dev-flag build; station = Ljubljana, the hub of two pairs; train = Venice-Ljubljana): `docs/explore/mockups/{route,service,ticket}-{station,train}.png`.
