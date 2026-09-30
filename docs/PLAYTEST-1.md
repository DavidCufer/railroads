# Playtest 1

Play-tester report. No game code was changed. Screenshots referenced below are in `docs/playtest-1/`.

- **Builds:** game 1 on `origin/main` b7966d3 (Phase 26B). Games 2 and 3 and the deadlock repro on 8dd2b3d (includes Phase 27 B junction work) — the gridlock bug still reproduces there.
- **Setup:** headless Chromium, 800×360 @1×, `?debug=1`. A small Playwright server held one page open; I drove it with mouse events.
- **Real UI:** Track / Double / Electrify / Bulldoze drags, Station tool, Buy-Train wizard (first few trains), station Build tab (upgrades), Goals / News / Finance / Menu / Help, year-in-review and new-loco cards.
- **Debug API:** `runDays` fast-forward, bulk `buyTrain` / `setOrders` / `buildStation` once I knew the flow, and reading numbers. One deliberate cheat: in game 1 (Sep 1855) I used `debugSetCash` (+~$360k) to test whether Terminals fix a gridlock.
- **Not tested:** touch gestures (pinch, finger scroll). I could not scroll panels with a mouse drag and used `scrollTop` instead.

## Verdict

**Beautiful, readable and clearly built with care. It is not yet fun to *play*, because three systems break the loop:**

1. **Gridlock.** Once a station pair has more trains than platforms, everything deadlocks *permanently* (Bug 1). It happened to me **five times in three games**, plus one silent freeze (Bug 4). Each time it cost 6–24 months of income, and the only signal was "traffic jam" news. This is the single biggest problem.
2. **Era balance is unbalanced by two orders of magnitude.**
   - **1830–1850:** the economy is a slog. Game 2 (1830 start) ended 24 years later at **65 % of the starting net worth**. Game 1 (1840) took 8 years to reach even.
   - **1900+:** money explodes. On **Hard**, a single Atlantic earned **$500–900k per year**. Four trains gave **$2.6M/year** and **$21M net worth in 15 years**, with nothing to spend it on.
   - Hard is not meaningfully harder than Normal once you are past the first hundred thousand.
3. **Breakdown repair call-outs** (Engine Shed distance) eat 20–90 % of revenue in the 1830–1870 era, and **you cannot build another Engine Shed**.

**Difficulty**

| Start | Verdict |
|---|---|
| 1830, Normal | Too hard / boring. Nothing profitable until 1848. |
| 1840, Normal | Fair-to-slow for 8 years, then good fun 1848–1862 (long lines between big cities feel great). After ~1862 it is too easy. |
| 1900, Hard | Far too easy. |

**Pace (measured, real minutes per game year):**

| Speed | Time per game year | 30-year game |
|---|---|---|
| 1× | 6.1 min | ~3 h |
| 2× | 3.0 min | 1.5 h |
| 4× | 1.5 min | 45 min |
| 8× | 46 s | 23 min |

- At 1× the early game (nothing to do, nothing pays) is much too slow; at 8× it is fine.
- The interesting decisions come every ~2–3 game years, so 8× is the real default, and 8× is also when the modal popups pile up (UX §).
- I played about 70 game years across the three games, almost all via `runDays` and 8×.

## Game logs

### Game 1 — Central Europe, 1840, Normal, played to mid-1869 (29 years)

Trieste–Ljubljana first, then Venice / Milan / Turin / Genoa / Graz / Vienna / Munich, plus a grain → food chain.

| Year | Revenue | Op. cost | Breakdown repairs | Net worth (approx.) | What I did / what happened |
|---|---|---|---|---|---|
| 1840 | $61k | $25k | — | $0.93M | Trieste–Ljubljana (16 tiles, $47k), Trieste–Venice, Venice–Milan (60 tiles, $146k), 4 Norris 4-2-0. Cash $1.0M → $0.28M |
| 1841 | $95k | $45k | $6k | $0.82M | |
| 1842 | $100k | $59k | | | grain farm → food plant → Venice chain (lost money), Graz spur |
| 1843 | $115k | $56k | | $0.83M | Graz through the Alps: **$153k for 15 tiles** |
| 1844 | $122k | $97k | $23k | $0.69M | took $200k loan; doubled Port–Venice ($30k) |
| 1845 | $150k | $97k | $25k | $0.68M | Post Offices |
| 1847 | $166k | $84k | | $0.68M | Milan–Turin (30 tiles, $100k) |
| 1848 | $262k | $146k | **$55k** | $0.77M | American 4-4-0. One American on Turin–Trieste earned **$101k in year 1** |
| 1849 | $293k | $142k | | $0.86M | |
| 1850 | **$41k** | $164k | | $0.71M | **Gridlock #1** |
| 1851–53 | $260–300k | $120–150k | $50k (1852) | $0.78M → $0.93M | doubled Venice–Milan ($79k) |
| 1854–56 | $222k / $130k / $150k | $172k (1856) | | $0.84M → $1.06M | Genoa branch → gridlock #2; Vienna extension → `noRoute` + gridlock #3 |
| 1858–59 | $393k / $509k | $147k / $244k | | $1.19M / $1.36M | |
| 1860 | ~$390k | | | | gridlock #4 |
| 1862–63 | $553k / $424k | $318k / $298k | **$144k / $170k+** | $1.8M | 4 trains frozen at Turin all of 1863 (Bug 4) |
| 1865 | $726k | $263k | | $2.6M | Moguls (9 cars) |
| 1866 | $977k | $312k | | $3.2M | Munich line: **$650k for ~83 tiles** of Alps |
| 1868 | $1.18M | $313k | | $4.35M | goal "connect Munich–Milan" reached |
| Jun 1869 | | | | **$4.7M**, cash $2.0M, loans $0 | 16 trains, 15 stations, 26 cities |

- **Survive 5 years?** Yes. Net worth never dropped below $0.68M, and cash stayed above $5k. When cash went negative the game silently added loans (they grew from $306k to $372k by themselves).
- **Money explosion:** yes, from ~1862. Profit was $150k in 1849, $250k in 1858, $665k in 1866 and $870k in 1868.

### Game 2 — random medium map (seed 7, 256×192), 1830, Normal, played to 1854 (24 years)

- Ashtown (86k) and Woodfield (90k) were the only real cities, and the rest were < 25k.
- Only the Grasshopper 0-4-0 (25 km/h, 3 cars, reliability 2/5) exists in 1830. Planet arrives 1832 (35 km/h), Norris 1838 (45 km/h), American 1848 (60 km/h).
- One tile = 5 km (`KM_PER_TILE`), so my 25-tile first line was 125 km. The balance report says a Grasshopper *loses* money beyond ~50 km (10 tiles). Nothing in the UI tells you that before you build.

| Year | Cash | Net worth | Revenue | Op. cost | Notes |
|---|---|---|---|---|---|
| 1830 | $0.79M | $0.92M | $9k | $14k | Ashtown–Northford, 2 stations ($40k each), 2 Grasshoppers ($20k), a coal train on a spur that happened to be on the line |
| 1831–37 | $0.70M → $0.52M | $0.89M → $0.71M | $11–15k | $18–38k | **Nothing profitable exists.** Every year loses $10–25k. Passenger Grasshopper ≈ $1–2k revenue per train-year |
| 1838 | $0.50M | $0.71M | $36k | $58k (**$33k repairs**) | Norris; Northford → Eastton ($100k) |
| 1839–47 | $0.29M → $0.42M | $0.59M → $0.65M | $44–59k | $30–60k | 3 trains, break-even for 10 years |
| 1848 | $0.42M | $0.65M | $60k | $30k | American; Eastton → Woodfield ($150k) + 2 Americans on the 100-tile Ashtown–Woodfield line |
| 1849–51 | ~$0.1M | $0.55M | $69–88k | $37–83k (repairs $27–39k) | flat |
| 1852–54 | $0.08M → $0.21M | $0.53M → $0.65M | $92k → $128k | $69k → $54k | Post Offices: mail 44k → 68k (+54 %), the first real gain in 22 years |

- After 24 years the company is worth **$0.65M, 35 % below the starting $1M**.
- Goals: 2 of 3 reached (connect Woodfield–Ashtown; deliver 500 carloads of passengers in a year, which was trivial). Gold is $5M annual revenue by 1880 (I was at 3 %).
- Counters over 24 years with ≤ 4 trains: 101 traffic-jam news items, **47 breakdowns**, 12 discoveries, 0 frontier villages.

### Game 3 — random medium map (seed 11, 256×192), 1900, Hard, played to 1918 (18 years)

Hard = $600k cash, revenue ×0.8, build cost ×1.2, breakdowns ×1.5, 8 % loans.

- Wolfmerehaven (138k) and Wolflandridge (61k) are 22 tiles apart on opposite sides of a lake.
- I built the first station (with the free Engine Shed) in the big city, then added Pineburg and Southborough lines (54 and 56 tiles, $377k and $481k).

| Year | Cash | Net worth | Revenue | Op. cost | Notes |
|---|---|---|---|---|---|
| 1900 (Jul) | $0.34M | | $257k in 6 months | | Atlantic ($188k + cars = $223k) on the 22-tile line. Track $90k, 2 stations $177k |
| 1902 | $0.92M | $1.7M | $678k | $38k | + Pineburg line |
| 1903 | $1.7M | $2.5M | $815k | $51k | + Southborough line. Post Offices, a Hotel and a Terminal at the hub |
| 1904–06 | $2.6M → $7.1M | $4.0M → $8.3M | $1.4M → $2.3M | $68–85k | 3 trains. One train earns **$900k/yr** |
| 1907–09 | ~$6.3M → $7.3M | $8.7M → $9.6M | $1.7M → **$0.63M** | $124–211k | I added a freight chain (coal ×2, iron, steel, goods): gridlock #5 killed everything for 3 years |
| 1910 | $8.3M | | | | fixed by selling the 5 freight trains; electrified 18 double tiles ($191k) and bought an Early Electric ($339k) |
| 1911–15 | $10.2M → $20.1M | $11.9M → **$21.7M** | $2.5–2.65M | $122–163k | 4 trains |
| 1918 | **$28M** | | | | |

- Cities 1900 → 1915:
  - Wolfmerehaven 138k → 176k
  - Wolflandridge 61k → 105k
  - Pineburg 22k → 34k
  - Southborough 23k → 29k
  - Unserved Eastford 24.4k → 24.4k
- Goals: bronze (connect) reached; gold "annual revenue $3M by 1950" was at $2.6M in 1915 and would have been reached ~1908 if the gridlock had not cut revenue.

## Economy

### Early game (first 5 years)

- **1840 Normal:** yes, you survive easily; the $1M start makes bankruptcy impossible for a decade. But the *return* is poor:
  - Track + stations cost $475k in year 1 and produced a **$35k/yr operating profit (7 %)**.
  - One Norris earns $20–40k/yr revenue for a ~$60k train.
  - **Adding a second train to the same city pair only splits the same supply** (train 2 on Port–Venice: $1.5k vs the sibling's $7.5k). Growth has to come from *new places*, not more trains.
- **1830 Normal (game 2):** a Grasshopper passenger train earns $1–2k/yr and costs $2k/yr to run. The only way not to lose money is to do nothing. I sat through 8 game years (~6 min at 8×, 50 min at 1×) with no meaningful decision.

### Mid game

- Breakdown repair call-outs are the biggest hidden cost. Measured repair share of revenue:

  | Game / year | Repairs | Share of revenue |
  |---|---|---|
  | Game 2, 1838 | $33k | ~92 % |
  | Game 1, 1848 | $55k | 21 % |
  | Game 1, 1862 | $144k | 26 % |
  | Game 1, Jan–Jun 1863 | $95k | 43 % |

  - One breakdown ≈ $8–18k, and they scale with the distance from the single Engine Shed.
  - Trains that earn $22k/yr paid $29k/yr in repairs (train 3, game 1, 1848). Expanding away from the first station is *punished*.
  - In 1900 (game 3) repairs were $0–47k against $2.5M revenue, so they only matter for the first ~70 years of the calendar.
- **Long lines pay:**
  - The 300-km Turin–Trieste American made **$101k** in its first year, vs $38k for the 60-tile Milan–Venice Norris.
  - A 9-car Mogul on Munich–Turin made $109–155k/yr.
  - The catch is that longer lines = more trains on the same trunk = more gridlock, and longer repair call-outs.

### Passengers vs freight vs mail

- **Mail ≈ passengers.** Mail was 55 % of revenue in every game once Post Offices existed (game 1 1865: $415k mail vs $304k passengers).
- **Freight in the 1840s is a loss.**
  - Grain Grasshopper: $6k/yr revenue, $1.3k running cost.
  - Food Norris: $2.8k/yr vs $2.9k running cost. I sold it.
  - In 1900 (game 3) my freight trains earned only $6–9k each in year 1 before triggering gridlock. I never got to see the chain pay.
- **Freight chains need infrastructure players are not told to build.** Even with the big Consolidation loco, the 5-train chain (2 coal mines + iron → steel mill → factory → goods) sharing a mainline killed the passenger cash cow (Bug 1).

### Money explosion

- **Yes:** Normal from ~1862, Hard 1900 immediately.
- Game 1 reached $2.0M cash and $4.7M net worth by 1869 with 16 trains. Game 3 had $20M cash by 1915 with 4 trains.
- There is no late-game sink: no dividends, no taxes, no competitors, no upkeep growth. Operating cost was **5 % of revenue** in game 3.
- Gold goals (`netWorth $30M by 1930` on Central Europe; `annualRevenue $3M by 1950` in game 3) are trivially reachable after a good start.

### Loans

- Normal 1840: loans mattered for one window only. I took $200k (1844), +$100k (1848, to buy the American that earned $100k) and repaid everything by 1861.
- The game also grows the loan automatically when cash goes negative (306 → 372k).
- On Hard 1900 loans are irrelevant.
- Interest (6 %/8 %) is far below the observed 20–100 % train ROI once past 1848, so the optimal play is "borrow the maximum whenever there is a supply-rich pair to serve". The sim does not punish it.

## Upgrades

| Upgrade | Evidence | Verdict |
|---|---|---|
| **Station type: Depot** (3×3, 2 platforms, $15k) | A city stop yielded 10 pax / 5 mail per month; the same tile as Station gave 67 / 34; Terminal 96 / 49 | Only useful at freight producers (worked fine at a farm, a coal mine and a steel mill). The **new-station panel defaults to Depot every time**, and I had to re-pick Station on each placement. A new player who just taps Build gets a 6-times-worse city stop |
| **Station** (5×5, 3 platforms, $40k) | Right default for cities | Pays. Clear from the supply numbers shown in the card |
| **Terminal** (7×7, 5 platforms, $67k upgrade in 1855; $135k in 1903 Hard) | +43 % supply at the hub; raises the deadlock threshold from 3 to 5 platforms | Pays at hubs; also the *only* fix for platform gridlock, but the UI never says so. The upgrade card reads "loads 30 % faster, up to 16 cars" |
| **Post Office** ($28k in 1845; $47k in 1903 Hard) | Mail supply +50–64 % (131 → 214), mail revenue +25 % → measured **+54 % mail revenue** (game 2: 44k → 68k). At Venice, mail 112 → 168 | **Best ROI in the game** (payback < 1 year on any big city). Clear why to build it |
| **Hotel** ($56k in 1865; $101k in 1915) | Game 3, Pineburg: the train serving it went $568k → $652k (+15 %) and the city grew +5 %/yr for two years | Pays only where revenue is already high. Would not pay in the 1840s ($56k for +25 % of ~$20k) |
| **Engine Shed** | Only the first station has one; **there is no way to build another** (SPEC §6.2 says $30k improvement). Trains can only be *bought* at that station, and repair call-outs start there | Design gap, and the source of the repair-cost problem |
| **Double track** (~$1.5k/tile in 1844, $2.7k in 1863, $3k in 1909) | Fixes head-on single-track jams; **does not** fix platform deadlock | Needed once ≥ 3 trains share a link. Nothing tells you that. "Traffic jam — consider double track" is the only hint |
| **Electrification** ($10.6k/tile in 1910; 400 tiles for the silver goal ≈ $4M) | Early Electric ($339k, 90 km/h) earned $267–351k vs the Atlantic's $890–950k on the *same* saturated line | No economic reason to electrify. The engine is *slower* than the steam Atlantic (100 km/h) |
| Warehouse, Cold Storage, Freight Yard, Livestock Pens, Water Tower | **Not tested** | The Build-tab benefit text and "No livestock ranch in range yet" hints are clear |

## Cities

- **Growth speed:**
  - Unserved cities barely grow: +5 % in 25 years (Berlin 148k → 155k) and 0 % in 15 years (Eastford).
  - Served ones grow decently:
    - Trieste 25k → 60k in 25 years.
    - Wolflandridge 61k → 105k (+71 %) in 15 years.
    - Pineburg +55 %.
  - But some heavily served big cities barely moved (Turin +5 %, Vienna +5 %, Genoa +5 % in 25 years). Pineburg (with a Hotel) stalled at 37,636 after two +5 % steps and never grew again.
- **Tiers unlock:** village = passengers / mail / food / lumber, town + goods, city + fuel, metropolis + steel. I found **no reason to care**: passenger and mail volume already scale with population, and I never built anything that consumed a tier-unlocked cargo. The "Next tier" text in the city panel is a nice touch, but the rewards are invisible.
- **Serving them:** rewarding while a *new* big city joins the network (Turin doubled my income, Vienna / Munich +100k rev/yr each). It is not rewarding to keep feeding a saturated pair.

## Industry chains, discoveries, frontier villages, repair crews, breakdowns, goals

- **Chains:** they work mechanically. The "Station" panel names industries ("Ashtown Steel Mill", "Southborough Coal Mine 2") and lists what the station accepts. But:
  - Multi-input chains (steel mill needs coal *and* iron) are a lot to expect, with no guidance.
  - Freight is unprofitable in 1830–50.
  - In 1900 it sank the network because of Bug 1. A freight chain is an *active harm* if you have passenger trains on the same trunk.
- **Resource discoveries:**
  - 4 / 12 / 6 in games 1 / 2 / 3, announced only as "Coal discovered near X" news.
  - The toast does not focus the camera. They have no visible effect unless you happen to build there. They matter little.
- **Frontier villages:**
  - Game 3 produced 3 (Highfordhollow, Millport, Riverside), founded next to my freight stations after 24+ months of service. I had since sold the trains, so they appeared even though the stations were no longer used.
  - Each is at 1,000 people and had **not grown after 8+ years**. They do not matter.
- **Repair crews:**
  - They work: the train panel says "Broken down — repair crew from Wolfmerehaven Crossing arriving in 11 days" (`docs/playtest-1/g3-repair-crew.png`). 11 days is long.
  - Cost is the real issue (Economy §). Breakdown counts: 84 in game 1 (16 trains, 29 years), 47 in game 2 (≤ 4 trains, 24 years), 14 in game 3.
- **Goals:**
  - Presented well (bronze / silver / gold cards with progress bars; `g1-goals.png`, `g2-goals.png`).
  - Bronze "connect A–B by rail" is a good early nudge. It cost me **$650k** for Munich–Milan in game 1, which was a fun challenge.
  - Silver / gold are far too soft (see money explosion).
  - The "delivered 500 carloads of passengers in a year" silver was done with 4 trains.
  - I never saw a celebration dialog appear, only the ✓ in the panel. It may have been swallowed by the popup queue.

## UX friction (800×360)

- **Route step of the Buy-Train wizard:** the panel covers the right half of the map, and at 360 px height only ~1 order row is visible. To add a station behind the panel you must pan the map first. Better: a bottom sheet plus a station list.
- **Modal popups arrive very late and steal input.**
  - Year-in-Review cards appeared up to **14 months late** ("1852 Year in Review" in Apr 1854; "1850 Year in Review" in May 1851), one at a time as you close the previous one.
  - The "New locomotive: Planet (1832)" card appeared in May 1838.
  - While a card is open, drags on the map do nothing: several of my track builds silently failed.
  - At 8× you get a modal every ~46 s.
- **Year-in-Review "Net profit" counts investment as loss** ("−$677k" for a year with $61k revenue), and the revenue and expense bars share red for "Mail" and "Expenses" (`g1-year-review.png`). The Finance panel's "Operating profit" is much clearer. Later panels format Expenses as "−$228k" while the others are unsigned.
- **Bulldoze:**
  - The drag must cover a complete edge, otherwise the ghost shows "$0" and nothing happens (no explanation).
  - When it did work on a 1-tile stub next to a station, it **removed the two adjacent main-line edges too and cut the station off** (Bug 5).
  - I never managed to remove an unwanted station.
- **Track building from a station tile:** a drag that starts on a station whose next leg would be a sharp turn ghosts a tiny path and builds nothing useful. The turn rules are not explained.
- **Top bar hit area:** anything starting at y < 44 is swallowed by the HUD. Camera framing with two stations 18+ tiles apart at zoom 0.5 puts one under the top bar (my scripted builds failed until I added a margin).
- **Demands row** on the station Cargo tab is icons only (greyed vs coloured is not explained). Wizard text "Slow engines lose the speed bonus on long routes — keep this one to short lines" appears before any route exists.
- **No "trains waiting" indicator.** A 7-of-10-trains-stuck network shows only news toasts (144 of them in game 1) and "stuck" text inside each train panel. A HUD ⚠ with a count and a tap-to-jump would have saved me years.
- **Help panel:** the "platforms" numbers (Depot 2 / Station 3 / Terminal 5) exist only here, and are never connected to trains / deadlocks.
- **Desktop only:** dragging across the HUD selects text (`user-select`).
- **Good:**
  - The Buy-Train wizard (engine card with stats, "Passengers + mail" suggestion, cost total on the Next button; `g1-new-loco.png`, `g1-mogul.png` for the new-loco card).
  - Ghost cost preview + Build / Close bar.
  - The Finance panel (`g1-finance.png`).
  - The Goals panel.
  - Station Build-tab benefit lines and "why not" hints (`g3-upgrade-card.png`).
  - The News panel folding repeats ("×3") and the Clear-all footer (`g1-news.png`).
  - Visuals at ~50–60 fps (`g3-hub-1915.png`).

## Bugs

**Bug 1 — CRITICAL: permanent platform deadlock ("hold-and-wait").** Trains that have reached a station wait there for a platform at the *next* station. When there are more trains than platforms across a station pair, every train ends up `waitingForStation` forever.

- **Repro (deterministic, ~1 minute):**
  1. New game, seed 11, medium, start 1900 (any difficulty), lots of cash.
  2. Track from (127,122) to (109,123) (Wolfmerehaven–Wolflandridge, 18 tiles). Optionally double it.
  3. Build a Station at each end.
  4. Buy N Atlantics alternately ordered A→B / B→A and run 400 days after each one.
- **Observed (single track / station type):**

  | Trains | Result |
  |---|---|
  | 1 | $818k |
  | 2 | $868k |
  | 3 | $807k |
  | 4 | $397k (3 waiting for block) |
  | 5 | $181k |
  | 6+ | **all `waitingForStation`, revenue ≈ 0 forever** |

- **Double track / station type:** 5 trains OK ($956k), **6 trains → all 6 deadlocked**. So doubling does not help.
- **Terminals (5 platforms), single track:** deteriorates from 5 trains, full deadlock at 10, i.e. **N ≥ 2 × platforms**. Both stations' platforms fill with departing trains that each wait for the other station.
- **Real-game occurrences:**
  - Game 1: Venice/Milan (1850), Port/Venice (1854), Milan/Turin (1860), Turin (1862).
  - Game 3: freight chain (1907).
- **Cost:** 1850 revenue fell from $293k to $41k; game 3's fell from $2.3M to $0.63M for 3 years.
- **Only recovery:** sell trains, which frees a platform.
- **Screenshots:** `g1-deadlock-venice.png`, `g1-deadlock-milan.png`, `repro-6-trains-deadlock.png`.

**Bug 2 — a `noRoute` train parked in a station holds a platform and causes Bug 1.**

- After I sold the two `noRoute` trains parked in Venice's Terminal, all others recovered at once.
- `noRoute` trains are never removed, warned about beyond one news item, or sent to a depot.

**Bug 3 — station on a sharp corner of a through line blocks everyone.**

- Repro:
  1. Build a line ending at Graz and put the station on the dead-end tile.
  2. Extend the line beyond the station in a different direction (I went from the station heading NE after the line arrived heading NW).
  3. Track builds fine and no warning appears, but no train can route through, so every Vienna train is `noRoute`.
- Fix I applied: build a straight bypass and a new station on it (`g1-graz-zigzag.png`).
- Suggestion: reject the extension or show a red "trains cannot pass this station" marker.

**Bug 4 — trains with status `moving` and speed 0 for 18 months (game 1, Turin, 1863).**

- 4 fully loaded trains sat around Turin (positions (71,253) / (58,258) / (55,258) / (56,258)), `moving`, speed 0, `distanceTraveled` static, zero revenue all of 1863. The status never became `stuck` and no jam news was raised.
- Suspect: a one-tile stub `(55,257)–(56,258)` next to the station that I had created with an aborted Track drag starting on the station tile (I cannot be certain of its origin).
- Selling the trains and re-buying them fixed it.

**Bug 5 — Bulldoze over-removes.**

- Dragging along the stub from (55,257) to (56,258) in Bulldoze mode removed 3 edges, including both main-line edges leading into the terminal (`(54,257)-(55,257)`, `(55,257)-(56,257)`). The station was cut off and trains lost their route until I rebuilt it.
- The refund ghost showed $6k and no list of what would go.

**Bug 6 (design gap) — no way to build an Engine Shed.**

- Only the first station gets one (`hasEngineShed: state.stations.length === 0`, `src/sim/commands.ts:364`).
- SPEC §6.2 lists it as a $30k improvement.
- The station Build tab shows "Free Engine Shed" only on the first station.
- Consequences:
  - You can only buy trains at that one station.
  - Repair call-outs cost up to $18k each, as far away from it as your network extends.

**Bug 7 — Year-in-Review / new-loco cards are queued and shown late.** See UX §. `g1-year-review.png` shows the "1840 Year in Review" in Jul 1842.

**Bug 8 (minor) — Station tool defaults to Depot on every placement.**

**Bug 9 (minor) — the "Passengers + mail" suggestion fills only 4 of 6 car slots for a 6-car engine.** The total price on Next is right, so a player can end up with an under-filled train.

**Bug 10 (debug only) — after `regenerate`, a previously open train panel stays open** (Edit cars / Replace / Sell on an empty map), and the debug overlay covers the minimap.

## Top 10 recommended changes (priority order)

1. **Fix platform deadlock (Bug 1) and `noRoute` parking (Bug 2).**
   - A train must reserve a free platform at the next station *before it leaves its current platform*; otherwise it waits outside, like a signal. That removes hold-and-wait.
   - Auto-remove or auto-depot `noRoute` trains after 30 days.
   - Add a regression test: N = 2 × platforms trains between two stations must keep ≥ 90 % of the N−1 throughput.
2. **Surface gridlock.**
   - A top-bar ⚠ with a count ("3 trains stuck"), tap → camera jumps to the first stuck train.
   - Status must never read `moving` at speed 0 for > 5 days (Bug 4).
   - Fold "traffic jam" news to one line per station pair.
3. **Let players build Engine Sheds** ($30k, per SPEC), and cap call-out cost.
   - Suggest `cost = $3k + $40/tile × era`, max $8k, and a −50 % breakdown chance only within the shed's reach.
   - Target repair spend ≤ 10 % of revenue in every era (today 21–92 %).
4. **Fix the 1830–1850 economy.**
   - A passenger Grasshopper earns $1–2k/yr and costs $2k/yr, so nothing pays for 18 years.
   - Halve pre-1860 station upkeep ($250 → $125/month), double pre-1850 fares (or halve running cost), and make freight pay ≥ 1.5× passengers before 1850.
   - Target: a Norris on a 10-tile line returns ≥ 25 % ROI per year.
   - Or default new games to 1848 and mark 1830 "expert".
5. **Give the late game a sink and make Hard hard.**
   - In 1900 one train makes $500–900k/yr and operating cost is 5 % of revenue.
   - Options:
     - Passenger / mail fare multiplier ×0.5 after 1890.
     - Scale track / station upkeep with network size.
     - Yearly dividend / tax.
     - Raise `hard.revenueMult` from 0.8 to 0.5.
   - Raise gold goals: NW $30M → $150M for 1840 starts; annual revenue $3M → $15M for 1900 starts.
6. **Make modals non-blocking and timely.**
   - Year-in-Review becomes a badge on the Finance button plus a dismissible toast on Jan 1.
   - Collapse pending "New locomotive" cards into one.
   - A modal must never swallow a map drag silently.
7. **Route step of the Buy-Train wizard becomes a bottom sheet.**
   - The map stays visible and tappable.
   - Show all orders as a compact scroll list, with tap-to-add from a station list too.
8. **Track / bulldoze safety.**
   - Reject or warn on extending a line through a station with a > 45° turn (Bug 3).
   - Bulldoze must highlight exactly what will be removed (Bug 5), and say why when a drag yields "$0".
   - Stub tiles beside stations should be auto-pruned.
9. **Station tool defaults and guidance.**
   - Default to Station (not Depot), and remember the last choice.
   - When a build would put ≥ 3 lines' trains through one platform count, hint "Terminal recommended".
   - Add a Help line: "keep trains per station pair ≤ 2 × platforms". Show the platforms number on the type card, not only in Help.
10. **Make electrification, frontier villages and discoveries matter.**
    - Electric locos should beat their steam era rivals: `early-electric` is 90 km/h at $6k per year, slower than the Atlantic. Make it ≥ 110 km/h and −30 % running cost, or reduce the silver goal to 100 tiles, or add a speed bonus (currently −$191k for zero gain).
    - Frontier villages should grow to ≥ 3,000 within 10 years of founding (all three I saw stayed at 1,000 for 8+ years).
    - Discovery news should be tappable (focus camera on the new industry).
