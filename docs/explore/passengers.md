# Exploration E1: which passenger model makes a multi-stop train the natural choice?

Branch `explore-passengers` (from `phase-53c-wip`, rebased on `main`; **not on main**). Switch: `passengerModel` (`m0`..`m3`) on `createGameState` / `state.passengerModel`, constants in `src/data/passengerModels.ts`.
Benches: `tools/bench/explore.ts` (S1–S3), `exploreSummary.ts`; raw rows in `docs/explore/data/`. Not saved in save files; no UI changes.

## Short answer

1. **No model makes multi-stop clearly better in absolute profit.** The best total profit for a set of towns is never higher under M2/M3 than under the current rules (M0). What M2/M3 do is make *shuttles worse*, because a station only draws demand from towns its own trains call at.
2. **The premise "small flows cannot pay for a train" is mostly false in this economy.** With 12–25k towns, a 2-car shuttle at 35–60 % load still earns tens of thousands a year; the current rules (M0) already favour multi-stop in 1900 (+22 %) and nearly tie in 1842 (−5 %, grid-limited). Only with 4–8k towns is the gap larger (+15 % 1842, +54 % 1900).
3. **Recommendation: M2 if you want multi-stop to be the natural choice; skip M3.** M2 gives a 3–4× multi-stop margin in S1, keeps two-city lines unchanged (S2 identical), brings the all-stops train close to express+shuttles (S3, 84–85 % vs 62–75 %), and is the simplest for the player (one pile per station). Its cost is real: ~8–17 % less total profit for the same towns, and a shuttle network without a through train is nearly worthless (no changes). If that feels too harsh, M3 is the softer variant, but it adds a second kind of waiting person for little gain.
4. M1 (fewer, richer passengers) is only a unit change here: results are within 1–5 % of M0, as intended (a full car earns what it did). It does not reduce wagons by itself; cars are sized by demand and the best configurations use 2–6 cars.

## The models (as built)

| Model | Rule | Constants (name = meaning) |
|---|---|---|
| M0 | Phase 53C as it stands (destination lots, changes allowed). Reference. | – |
| M1 | M0, but one game passenger stands for `PASSENGER_PARTY_PEOPLE` = 3 people: demand ÷3, car seats ÷3, fare per passenger ×3. | party size: people per game passenger |
| M2 | Direct trains only. A station's demand = gravity share of towns that a train of *this* station calls at (`maxChanges` = 0), one pile per station, filled from the last departure up to `MAX_WAIT_DAYS` (30, existing). On boarding, people split over the train's later stops (before it returns here) by gravity: population / max(distance, `minDistanceTiles`)^`distanceExponent` (existing `PAIR_DEMAND`). Pay per distance on arrival. Party 3 as M1. | – |
| M3 | M2 plus towns reachable with one change (`M3_MAX_CHANGES` = 1). Those people keep a fixed destination and a pile per destination (Phase 48 lots); the gravity weight uses the real change wait (Phase 53B `changeTilesFor`). | max changes counted |

Same volume and fare scale in M1–M3 (party 3). `PASSENGER_PARTY_PEOPLE` = 3 is a choice, not measured: the 1900 trips table is ~3× the 1842 one, so 3 brings "game passengers" at 1900 down to the 1842 order of magnitude. I did not measure the per-pair monthly flow the brief names (20–40 for a 15k town); the waiting figures below are in people, divide by 3 for what the game would show in M1–M3 (tens, not hundreds).

## Method

Synthetic flat map (no terrain effects), double track on a straight line, a station on each town, all trains of one engine (Norris 1842, Atlantic 1900), same car count on every train of a configuration (1–8 cars; Atlantic max 6). Six unserved background towns (8–20k, 35–70 tiles off the line) soak up the share of a town's trips that nothing of ours reaches, as on a real map. 3 seeds (they vary populations and spacing: chain towns 12–25k, 15–25 tiles apart), 2 years. "Profit" = the line's trains' own books per year (revenue − running − wages − wear − repairs), . Best car count chosen per configuration by profit minus `CAPITAL_CHARGE` = 5 %/yr of the money put into trains and cars. Waiting = average pile per station, people. Train counts searched: multi 1,2,3,4,6; shuttles 1/2/3 per leg (S1); direct 1–4 (S2); all-stops 1–3 vs express 1–2 plus one shuttle per leg (S3). **Limits:** the multi-stop search stops at 6 trains and 8 cars in 1842, and the winner is sometimes at that edge (1842 S1: 6 trains), so multi-stop is slightly understated there. One map family; no terrain, no growth lock (towns may grow over the 2 years).

## Results

Best multi-stop set against best shuttle set (S3: against express + leg shuttles). Columns: scenario | year | model | best multi-stop (cars per train) | profit k/yr | profit per train k | load % | waiting people | best other set | profit | per train | load % | waiting | multi ÷ other.

| Scenario | Year | Model | Multi-stop / direct | k/yr | /train | load % | wait | Shuttles / express | k/yr | /train | load % | wait | ratio |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| S1 12-25k chain turn on | 1842 | m0 | multi-6 ×2 cars (6 tr, 12 cars) | 990 | 165 | 85 | 72 | shuttles-3x ×2 cars (12 tr, 24 cars) | 1038 | 86 | 60 | 43 | 0.95 |
| S1 12-25k chain turn on | 1842 | m1 | multi-6 ×2 cars (6 tr, 12 cars) | 982 | 164 | 84 | 70 | shuttles-3x ×2 cars (12 tr, 24 cars) | 1019 | 85 | 59 | 43 | 0.96 |
| S1 12-25k chain turn on | 1842 | m2 | multi-6 ×2 cars (6 tr, 12 cars) | 958 | 160 | 82 | 39 | shuttles-1x ×1 cars (4 tr, 4 cars) | 248 | 62 | 82 | 23 | 3.86 |
| S1 12-25k chain turn on | 1842 | m3 | multi-6 ×2 cars (6 tr, 12 cars) | 958 | 160 | 82 | 39 | shuttles-2x ×2 cars (8 tr, 16 cars) | 565 | 71 | 48 | 21 | 1.70 |
| S1 12-25k chain turn on | 1900 | m0 | multi-4 ×5 cars (4 tr, 20 cars) | 1916 | 479 | 57 | 114 | shuttles-3x ×2 cars (12 tr, 24 cars) | 1568 | 131 | 54 | 53 | 1.22 |
| S1 12-25k chain turn on | 1900 | m1 | multi-6 ×3 cars (6 tr, 18 cars) | 1821 | 304 | 55 | 84 | shuttles-3x ×2 cars (12 tr, 24 cars) | 1468 | 122 | 51 | 47 | 1.24 |
| S1 12-25k chain turn on | 1900 | m2 | multi-4 ×3 cars (4 tr, 12 cars) | 1649 | 412 | 76 | 60 | shuttles-1x ×2 cars (4 tr, 8 cars) | 502 | 125 | 50 | 26 | 3.28 |
| S1 12-25k chain turn on | 1900 | m3 | multi-4 ×3 cars (4 tr, 12 cars) | 1649 | 412 | 76 | 60 | shuttles-2x ×2 cars (8 tr, 16 cars) | 901 | 113 | 46 | 25 | 1.83 |
| S1 12-25k chain turn off | 1842 | m0 | multi-6 ×2 cars (6 tr, 12 cars) | 1076 | 179 | 82 | 68 | shuttles-3x ×2 cars (12 tr, 24 cars) | 1093 | 91 | 46 | 47 | 0.98 |
| S1 12-25k chain turn off | 1842 | m1 | multi-6 ×2 cars (6 tr, 12 cars) | 1066 | 178 | 82 | 65 | shuttles-3x ×2 cars (12 tr, 24 cars) | 1068 | 89 | 45 | 47 | 1.00 |
| S1 12-25k chain turn off | 1842 | m2 | multi-6 ×2 cars (6 tr, 12 cars) | 995 | 166 | 77 | 38 | shuttles-1x ×1 cars (4 tr, 4 cars) | 273 | 68 | 63 | 17 | 3.64 |
| S1 12-25k chain turn off | 1842 | m3 | multi-6 ×2 cars (6 tr, 12 cars) | 995 | 166 | 77 | 38 | shuttles-2x ×1 cars (8 tr, 8 cars) | 600 | 75 | 71 | 25 | 1.66 |
| S1 12-25k chain turn off | 1900 | m0 | multi-4 ×4 cars (4 tr, 16 cars) | 1973 | 493 | 60 | 74 | shuttles-2x ×2 cars (8 tr, 16 cars) | 1652 | 207 | 49 | 66 | 1.19 |
| S1 12-25k chain turn off | 1900 | m1 | multi-6 ×2 cars (6 tr, 12 cars) | 1874 | 312 | 68 | 67 | shuttles-2x ×2 cars (8 tr, 16 cars) | 1525 | 191 | 45 | 65 | 1.23 |
| S1 12-25k chain turn off | 1900 | m2 | multi-6 ×2 cars (6 tr, 12 cars) | 1692 | 282 | 62 | 54 | shuttles-1x ×1 cars (4 tr, 4 cars) | 537 | 134 | 58 | 24 | 3.15 |
| S1 12-25k chain turn off | 1900 | m3 | multi-6 ×2 cars (6 tr, 12 cars) | 1692 | 282 | 62 | 54 | shuttles-2x ×1 cars (8 tr, 8 cars) | 974 | 122 | 54 | 28 | 1.74 |
| S1s 4-8k chain turn on | 1842 | m0 | multi-4 ×2 cars (4 tr, 8 cars) | 325 | 81 | 43 | 16 | shuttles-1x ×2 cars (4 tr, 8 cars) | 282 | 71 | 50 | 28 | 1.15 |
| S1s 4-8k chain turn on | 1842 | m1 | multi-4 ×2 cars (4 tr, 8 cars) | 319 | 80 | 42 | 16 | shuttles-1x ×2 cars (4 tr, 8 cars) | 279 | 70 | 49 | 28 | 1.14 |
| S1s 4-8k chain turn on | 1842 | m2 | multi-3 ×2 cars (3 tr, 6 cars) | 273 | 91 | 47 | 15 | shuttles-1x ×1 cars (4 tr, 4 cars) | 67 | 17 | 25 | 5 | 4.07 |
| S1s 4-8k chain turn on | 1842 | m3 | multi-3 ×2 cars (3 tr, 6 cars) | 273 | 91 | 47 | 15 | shuttles-1x ×1 cars (4 tr, 4 cars) | 149 | 37 | 52 | 12 | 1.83 |
| S1s 4-8k chain turn on | 1900 | m0 | multi-2 ×2 cars (2 tr, 4 cars) | 361 | 181 | 49 | 28 | shuttles-1x ×1 cars (4 tr, 4 cars) | 235 | 59 | 50 | 18 | 1.54 |
| S1s 4-8k chain turn on | 1900 | m1 | multi-2 ×2 cars (2 tr, 4 cars) | 340 | 170 | 46 | 27 | shuttles-1x ×1 cars (4 tr, 4 cars) | 222 | 56 | 47 | 17 | 1.53 |
| S1s 4-8k chain turn on | 1900 | m2 | multi-2 ×1 cars (2 tr, 2 cars) | 336 | 168 | 85 | 26 | shuttles-1x ×1 cars (4 tr, 4 cars) | 101 | 25 | 24 | 6 | 3.33 |
| S1s 4-8k chain turn on | 1900 | m3 | multi-2 ×1 cars (2 tr, 2 cars) | 336 | 168 | 85 | 26 | shuttles-1x ×1 cars (4 tr, 4 cars) | 159 | 40 | 35 | 10 | 2.11 |
| S3 big-small-big turn on | 1842 | m0 | multi-3 ×8 cars (3 tr, 24 cars) | 740 | 247 | 78 | 457 | express-2+leg-shuttles ×6 cars (6 tr, 36 cars) | 1185 | 197 | 81 | 462 | 0.62 |
| S3 big-small-big turn on | 1842 | m2 | multi-3 ×8 cars (3 tr, 24 cars) | 829 | 276 | 97 | 488 | express-2+leg-shuttles ×8 cars (6 tr, 48 cars) | 989 | 165 | 58 | 178 | 0.84 |
| S3 big-small-big turn on | 1842 | m3 | multi-3 ×8 cars (3 tr, 24 cars) | 829 | 276 | 97 | 488 | express-2+leg-shuttles ×8 cars (6 tr, 48 cars) | 1154 | 192 | 76 | 406 | 0.72 |
| S3 big-small-big turn on | 1900 | m0 | multi-3 ×6 cars (3 tr, 18 cars) | 2325 | 775 | 79 | 1098 | express-2+leg-shuttles ×6 cars (6 tr, 36 cars) | 3102 | 517 | 74 | 930 | 0.75 |
| S3 big-small-big turn on | 1900 | m2 | multi-3 ×6 cars (3 tr, 18 cars) | 2586 | 862 | 98 | 1288 | express-2+leg-shuttles ×6 cars (6 tr, 36 cars) | 3051 | 508 | 57 | 495 | 0.85 |
| S3 big-small-big turn on | 1900 | m3 | multi-3 ×6 cars (3 tr, 18 cars) | 2586 | 862 | 98 | 1288 | express-2+leg-shuttles ×6 cars (6 tr, 36 cars) | 3015 | 503 | 76 | 893 | 0.86 |
| S2 two big turn on | 1842 | m0 | direct-4 ×4 cars (4 tr, 16 cars) | 885 | 221 | 89 | 165 | - | - |
| S2 two big turn on | 1842 | m2 | direct-4 ×4 cars (4 tr, 16 cars) | 885 | 221 | 89 | 165 | - | - |
| S2 two big turn on | 1842 | m3 | direct-4 ×4 cars (4 tr, 16 cars) | 885 | 221 | 89 | 165 | - | - |
| S2 two big turn on | 1900 | m0 | direct-3 ×6 cars (3 tr, 18 cars) | 2432 | 811 | 76 | 177 | - | - |
| S2 two big turn on | 1900 | m2 | direct-3 ×6 cars (3 tr, 18 cars) | 2431 | 810 | 76 | 176 | - | - |
| S2 two big turn on | 1900 | m3 | direct-3 ×6 cars (3 tr, 18 cars) | 2431 | 810 | 76 | 176 | - | - |

(S2 has no alternative set; M0, M2, M3 are identical to within 1 k, as expected: no intermediate town, no changes.)

Reading:
- **S1** (target: multi ≥ 1.25× best shuttles): M0 0.95 (1842), 1.22 (1900); M2 3.9 / 3.3; M3 1.7 / 1.8. M2 and M3 meet it, but by lowering the shuttle side: M2 best total is 958 vs M0 1038 (1842) and 1649 vs 1916 (1900), i.e. −8 % and −14 %. The multi-stop side itself barely moves (+0 to −14 %, +10 % for a single train).
- **S1s** (4–8k towns): M0 already 1.15 / 1.54. Under M2, shuttles lose money at 3 per leg (net negative in 1900).
- **S2**: a direct train is fine in every model. Best fleet 4 (1842) and 3 (1900) trains of 4–6 cars.
- **S3** (target: all-stops competitive): all-stops ÷ express+shuttles = 0.62 / 0.75 (M0), 0.84 / 0.85 (M2), 0.72 / 0.86 (M3). Competitive under M2/M3 in 1900 only; express+shuttles still wins in every case.
- **Turnaround off (S1)**: shuttles gain ~13 % (735→832 k for 4 shuttles, 1842), multi-stop 2–12 %; the ranking and the M2 margin do not change (M2 3.6 / 3.2). The turnaround does not explain the gap.
- **Cars / crowds:** best sets use 2–3 cars per train when many trains run (1842) and 2–6 in 1900; piles average 20–140 people (7–47 game passengers under party 3). A typical early train is 2–3 cars; 3–5 cars appears with few trains. No model changes this much.

## Good-bot read (uncalibrated, seed 1, Normal, 16 years, net worth January)

| Start | M0 | M2 (= M3 here) |
|---|---|---|
| 1840 | 22.4 M | 23.2 M |
| 1900 | 52.9 M | 33.7 M |

The bot builds only pairs of towns, so M2 = M3 for it. M2 leaves 1840 alone and takes 1900 down into the old 0–34 M bracket that Phase 53C missed. One seed, bot's backlog rule scaled by party; do not read more into it.

## Tests

Default (M0) on this branch: the same 4 tests fail as on `phase-53c-wip` (`balanceLongHaul` ×2, `balancePassengers` ×2: pax/coal 1840s and mail/pax). Nothing was changed or loosened. `PASSENGER_MODEL=mX npx vitest run` runs the suite under a model (`tests/setupModel.ts`; lists in `docs/explore/data/tests-mX.txt`):

| Model | Failing (beyond M0's 4, which stay) |
|---|---|
| M1 | 4: `pairDemand` ×2 and `throughJourneys` ×1 and `loading` fullLoad ×1 assert people counts in units (3× fewer), plus the M0 3 (the mail/pax test passes). |
| M2 | ~23: `pairDemand` (≈14: fixtures assume a destination pile per first leg and changes counted), `throughJourneys` ×3 (direct vs change), `waitingForNextTrain` ×2, `legacyPile` ×2, `changeWait` ×1, `loading` ×1. |
| M3 | ~21: same set minus the tests about changes that M3 still counts. |

These are tests of the destination-pile mechanism, which M2/M3 replace on purpose. They need new fixtures, not looser bounds.

## What the player would see

- **M0 (today):** per-destination rows ("Milan 98, every ~21 d"), "(N changes)", changed-here rows.
- **M2:** one number ("Waiting 41, next train ~6 d") and a line "Trains here reach: A, C, D". Nothing per destination. The simplest of the three, and what the owner asked for.
- **M3:** M2 plus a "changing here" row.

## Recommendation and open points

Choose **M2** if "a multi-stop train is the natural choice" is worth losing a network of short lines: a player who builds A–B and B–C separately now gets only neighbour demand and no connections. If playtests find that too punishing, take M3 (shuttles recover about 60 % of their M0 income, multi-stop stays 1.7–1.8× ahead) rather than a bigger change. Neither raises total profit; if the real aim is *more* profit from small towns, the lever is elsewhere (fares against crew and upkeep make even a 35 % shuttle pay).

Not done: an M2 UI, save support for the model, per-pair flow measurement for the party constant, more seeds, the 6-train/8-car search edge, and a re-baseline of the 4+ tests above.
