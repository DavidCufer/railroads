# Playtest 3

Play-tester report. **No game code or tests were changed.** Screenshots: `docs/screenshots/playtest-3-*.png`.

- **Build under test:** `origin/main` after Phase 36 (passenger destinations, one-month waiting rule, visible industry growth, car costs).
- **Setup:** headless Chromium 800×360 (×2 DPR), `?debug=1`, Vite dev server. Long games were run on the sim API with my own scripts (kept in a gitignored `.scratch/`) plus `tools/bench/goodPlayer.ts`. UI checks used the real title screen (Load Game) and the station, train and city panels.
- **Honesty notes:**
  - My "human" game is a script on seed 1, central-eu: Prague–Dresden passenger line with a passing loop, then farm → Food Plant → Prague with Full-load orders at the farm. It is a passive player (4 trains, no later expansion). The expansion curve comes from `goodPlayer.ts`, which is passenger-only (freight revenue 0 in its ledger).
  - **Not tested:** touch gestures, the 45° junction rules through the UI (sim-level only, below), the buy-train wizard, Cold Storage, 1830 start, discoveries. I did not verify that the "smallest legal connection" suggestions are *good*, only that they return something.
  - The toast pile in the station screenshot was seen only after I injected a loaded state into a `?debug=1` page (see UX 3). It is unverified in a real game.

## Verdict

**Phase 34–36 delivered what it set out to do on the surface: panels are short, the numbers agree, growth is visible. Underneath, the freight chain is hollow, a processor stockpile is unbounded, and money still has nowhere to go.**

1. The passenger UI is good: "Where passengers go" is one line per destination plus a "Not connected" line. City panel "Connected 542 / month (28 %)" matches the station sheet (542). The 1953 city total is consistent with it.
2. Industry growth is visible and works: the farm goes 60 → 110 grain/month by 1848 and reaches the 3× cap (180) by 1870, with a one-line "↑ 8 %/yr".
3. **But growth only pays on the first leg.** A processor makes at most its fixed output (Food Plant 60 food/month = 3 car loads) however much is delivered. Grain deliveries are paid in full, the surplus piles up without limit, and the food leg pays almost nothing (below).
4. A bulldozed track in front of a moving train leaves it "moving" at speed 45 and not advancing, with no stuck marker.
5. A passive player is safe on every difficulty and ends with millions of idle cash (1840: $4.4M idle by 1870 with 4 trains; 1900 Normal: $10M by 1930 with 3 trains).

## Findings

### Bugs

**B1. Track removed ahead of a moving train freezes it as "moving" (no Stuck chip, no news).**
- Repro (sim): single-track Prague–Dresden, 26 tiles, one train. After 10 days, `bulldoze` the segment just ahead of the train (`path[idx]..path[idx+1]`).
- Result: for 100 days the train is `moving`, `speed 45`, `route` of length 2, `routeIndex 0`, same tile (26011). It never becomes `noRoute` or `stuck`. After rebuilding the segment ($3.6k) it moves again at once.
- Why it matters: a player sees a train "moving" that never arrives, and the Stuck indicator that exists for exactly this never fires. Expected: either refuse the bulldoze ("train ahead") or set the train to `noRoute` and post the news item.

**B2. `INDUSTRY_INPUT_STORAGE_CAP = 240` is never used; a processor's input stock grows forever.**
- Repro (game A): grain train farm → Food Plant, run 30 years. Food Plant `inputStock.grain` = **2,098 t at Jan 1848 (8 years)** and **20,232 t in 1870**. Grep: the constant is defined in `src/data/industries.ts` and referenced nowhere else.
- The Food Plant panel prints "Waiting: 2098 t grain" (screenshot `playtest-3-08-foodplant-station.png`). "Waiting" for what? The number has no meaning to a player.
- The farm's trains are paid in full for all of it, so over-delivering is free money (grain revenue $125k/yr, flat from 1853).
- Fix idea: enforce the cap (the station stops accepting the cargo, and the panel says "full"), or at least stop paying for what is rejected.

**B3. Demolishing a station that trains use leaves them parked forever (still open from PT2 Bug 2).**
- Repro: two trains Prague ↔ Dresden; `demolishStation(Dresden)`. Both trains end with 1 order and sit in `noRoute` for 120+ days. The news item appears (good: "Dresden demolished, 2 trains"), but nothing sells or reassigns them, and they keep their running costs. Demolishing the last Engine Shed station is correctly refused (`last-engine-shed`); the Bulldoze tap refuses with `station-in-use` (OK).

### Balance

**BAL1. The chain's second leg is worthless.** Same game: grain leg $124.8k/yr (1,600 units); food leg **$7.7k/yr** (369 units, about $21 a unit) from a $47k line plus a $34k Engine Shed and 4 food cars. The processor's cap is 60 food/month while the farm alone is allowed to reach 180 grain, so building "mill → town" is a loss-maker. Meanwhile the chain's town end gives almost no city growth benefit that the player can see. Consider: processors scale output with input (up to a higher cap), or the Food Plant cap follows the farms around it.

**BAL2. Freight does not catch up with passengers over the decades; it stays flat.** Per train, fixed lines:

| | 1850 | 1930 (1900 start) |
|---|---|---|
| passenger + mail train (2 trains) | ≈ $37k each | ≈ $197k each |
| freight train (grain 4 cars, 2 trains) | ≈ $44k each | ≈ $87k each |

In the 1840 start freight starts ahead, then plateaus at $133k/yr for 20 years: one grain train carries 80 units a trip, so the farm's 3× growth changes nothing unless the player adds trains. With one train per cargo, freight revenue is capped by the train, not the industry. That is acceptable, but it means "industry growth is meaningful" only for a player who re-visits and adds cars. The farm panel gives no hint that its output now exceeds what the train carries (the "Waiting" figure on the farm is small because the pile is capped).

**BAL3. No money sinks (unchanged from PT2, now visible even for a passive player).** 1840 Normal, 4 trains: cash $0.45M (1843) → $4.4M (1871), nothing to buy that matters. `goodPlayer` (passenger-only) in 1840: NW 1856 **$3.88M**, 1870 **$19.3M**, revenue plateau ≈ $2.8M/yr from 1865 with 89–92 trains and $9.5M idle in 1870. 1900 Normal passive: $0.3M → $10M cash by 1930.

**BAL4. Fares fall with the era: a fixed route loses about a third of its income in 30 years.** Prague–Dresden, 2 trains, same ~3,000 passengers a year: fare per passenger $20.5 (1843) → $19.3 (1849) → $17.7 (1855) → $15.7 (1870) (−23 %), revenue $62k → $43k. Population grows (Prague 110k → 134k, Dresden 65k → 91k), but unserved demand stays ~8–9k units a year (73 % lost) because the line never gets more capacity. That is the design (real fares anchors), and it is a good pressure to expand, but the game never tells a player "your fares per head are falling" and the passive revenue just bleeds. Worth a one-line hint in the Finance panel or station panel.

**BAL5. "Full load" on a passenger pair costs 36 % of the revenue.** Two trains, Prague–Dresden, 1 year: `auto` $59.6k vs `fullLoad` at both ends $38.4k. Much better than PT2's −80 to −95 % (the destroyed-cargo bug is gone), but Full load is still a bad choice for passengers and the UI wording ("Wait until every car is full") does not warn. Idea: hide or warn on it at passenger stops.

**BAL6. Many trains on one line: diminishing but sane; "Space trains evenly" works.** 12 Norris trains on one 26-tile single line: year-1 passengers $134k (2 trains: ≈ $60k, so 2.2× for 6× the trains); 3 of 12 sit in `waitingForBlock`. After "Space trains evenly" (gap 1 day): all 12 `moving`, revenue +13 % ($152k). No deadlock. Buying the 12 cost $590k of $787k starting cash, a poor deal, which is correct.

**BAL7. Hard in 1900: the first line is expensive in city centres.** Hard starts at $600k. A city-centre Station in Prague costs **$203k** (land), so two central stations plus a 26-tile line ($218k in Normal 1900 prices) cannot be afforded; my script failed "cant afford path" for 40 candidates. Edge stations are cheap but catch about a quarter of the people: Prague–Dresden with edge stations carried ~1,700 passengers a year (centre stations, 1840: 3,000+ and 8,000 more lost). That is a real choice, which is good. Results: `goodPlayer` 1900 Hard: NW **$7.1M (1916)**, **$33.7M (1930)**, 87 trains, revenue ≈ $7M/yr. Phase 36's Normal figure for 1916 is $30.5M, so Hard is about 77 % lower in 1916 but both end rich. A passive Hard player (1 train): NW $2.0M (1916) → $3.8M (1931), never in trouble.

### UX / clutter

1. **Station subtitle disagrees with the station name.** "Prague Farm" says "Station · Rockton"; "Prague Food Plant" says "Station · Summershire" (`playtest-3-09-farm-station.png`, `-08-`). The name comes from one rule and the subtitle from another (nearest town vs. city containing it?). Pick one.
2. **A station without an Engine Shed just has no "Buy Train" button.** Compare `-09-farm-station` (button) with `-08-foodplant-station` (no button). A chain player has to find out about Engine Sheds ($34k in 1840, $56k in 1900) by reading nothing. In sim, `buyTrain` returns `no-engine-shed`. Add a one-line "Needs an Engine Shed to buy trains here" under the Build tab or in place of the button.
3. **After loading: no focus, a modal, and (in debug) a toast pile.** Loading a 1848 save through the real UI shows blank green with the minimap box over empty land (`playtest-3-04-loaded.png`), with the "New locomotive" card on top and a "Train 4 has broken down" toast. The camera is not centred on the player's network. In the debug-injected run seven toasts stacked over half the map (`playtest-3-06-station-prague.png`); I could not confirm this in a plain game.
4. **"Where passengers go" and the city panel are good.** Short and consistent (`playtest-3-07-where-passengers-go.png`, `-13-city-prague.png`). Small nits: "~448 · ~59 · ~36" under "Not connected" shows towns the player has no hope to connect (Rockton, Summershire are tiny new towns); showing the top 2 would be shorter. The mail supply (61) is 3 % of the passenger figure (1953) on the city panel; mail looks like a rounding error, so the mail car upgrade is hard to justify.
5. **Processor panel text.** "Last month: 80 t grain → 60 crates food" is clear. "Waiting: 2098 t grain" is not (see B2). The farm panel's "↑ 8 %/yr" reads well (`-09-`).
6. **Forced loans are silent.** At negative cash the game borrows up to the credit limit by itself (cash −$50k → loans $149.7k). I saw no player-facing notice in the sim run (news not inspected for this). The player should be told "Borrowed $X to stay solvent".

### Edge cases that passed

- **Save/load:** serialise → deserialise mid-game (3 trains, 200 days), then 200 more days on both: identical cash to the cent, identical train status and routeIndex. A save with `washouts`, `stationFlow` and the industry optional fields stripped (as an older save) loads and runs 3 years without errors. Loading through the real UI works.
- **Zero cash:** `buyTrain` at $0 refuses; loan limit $500k respected (`credit-limit-exceeded`); with no loans and $0 cash for 400 days the line paid for itself and nothing bankrupt. `takeLoan(-5)` is refused. `repayLoan` with no loans returns ok/cost 0 (harmless).
- **Passing loop:** builds on a straight single-track tile ($13.7k in 1840); the second try after `station-no-track` on the first tile worked. The error reason is code-like; the UI shows a toast string, which I did not check.
- **90° junction:** a 5-tile branch off the middle of a line is accepted by `computeBuildPlan` (0 sharp steps, 0 layout violations) and trains keep running (2 trains, 120 days, no stuck). Node routes listed for the new junction: branch↔each side. I did not test the junction rules that *refuse* a build, so the "smallest legal connection" suggestion only got a smoke test (it returned 4- and 7-tile paths).

## Top 5 to fix next

1. **Enforce the processor input cap (B2) and decide what happens to the surplus**: refuse or stop paying for cargo a full processor cannot take; rename the "Waiting" line.
2. **Make chains worth building (BAL1/BAL2)**: let processors scale output with what they receive (to a higher cap), so a growing farm lifts the whole chain and the food leg pays.
3. **Freeze-on-bulldoze (B1)**: refuse bulldozing track a train is about to enter, or mark the train `noRoute` and push the news item.
4. **Give the money somewhere to go (BAL3)**: $4–10M idle with 3–4 trains means the game is over by 1870. The cheapest fix is a second tier of upgrades or a visible goal ladder.
5. **Small clarity items (UX 1, 2, 3, 6)**: station subtitle vs name, "needs an Engine Shed" text, centre the camera on the network after a load, tell the player about forced loans.
