# Playtest 2

Play-tester report. **No game code was changed.** Screenshots are in `docs/playtest-2/`.

- **Build under test:** `origin/main` at 8adc82f (Phase 29).
- **Setup:** headless Chromium 800×360, `?debug=1`, Vite dev server. A small Playwright server held one page open and ran scripts in it (scripts live in a gitignored `.scratch/`).
- **Real UI:** I used the real UI for a full first-hour flow (Track drag → Build, Station tool, Buy-Train wizard with the route sheet and "From list"), and for reading the Finance, station (Cargo / Build tabs), train (Route / Stats) panels and the toasts.
- **Debug API:** bulk work went through the same command layer the UI uses (`buildTrackPath`, `buildStation`, `buyTrain`, `setOrders`, `buildImprovement`, `upgradeTrackPath`, `electrifyTrackPath`, `runDays`) plus the game's own `findBuildPath`. `debugSetCash` was used **only in the exploit/benchmark runs** (marked "unlimited cash"), never in games 1–3.
- **Not tested:** touch gestures; Bulldoze; Cold Storage and Livestock Pens economics; discoveries (news only); road/air competition (my benchmark routes were all > 150 km); freight chains and ports (code read, not simulated).
- **Honesty note:** my "players" in games 1–3 are scripts with simple rules (connect the best unconnected city, 1–2 trains per line). They are weaker than a good human on tactics and blind to the UI's friction, so treat money curves as "a competent but passive player".

## Verdict

**The economy now works from 1840 and the deadlocks are gone. The game has lost its challenge after about year five, and one rule is silently broken.**

1. **Better than play-test 1 (PT1):**
   - No gridlock in any run (12 trains between two Depots, 24 between two Terminals: everything keeps moving).
   - 1840 is a good start: Milan–Venice with 2 Norris earned $143k in year 1; net worth was $1.0M → $19.1M in 30 years (PT1: $4.7M).
   - 1830 is now viable (net worth 65 % → 192 % of the start after 25 years). The first decade is still very slow.
   - Repair costs are 1–4 % of revenue (PT1: 20–90 %).
   - Frontier villages now grow (a $28k Depot made a 24k town in 12 years).
   - Electrification pays.
   - The UI is clearly better (Stuck chip, bottom-sheet route step, Station default, Finance cost chips, per-train Stats tab).
2. **Still broken: the late money explosion.** A competent 1900 start on Central Europe goes $1M → $10.8M (1903) → $108M (1910) → $209M (1916); revenue plateaus at ~$20M a year with nothing to spend it on. The Gold goal "net worth $150M by 1930" is reached in **1913**. On Hard the same play gives $167M in 1916.
3. **Hard is still not hard.** Same revenue as Normal; the differences are +20 % build cost, 8 % interest and a 1.6× tax schedule. Measured: −7 % cash growth in 1840, −20 % in 1900, −28 % in 1940/1960/1980.
4. **New hidden traps** (see Bugs and Exploits):
   - **"Wait for full load" destroys the cargo it just loaded** at any stop that accepts it (every passenger/mail city stop). Revenue falls 80–95 %.
   - Adding trains to a single-track pair lowers income (convoys plus a hard waiting-pile cap).
   - A washed-out wooden bridge silently idles a whole line for years.
   - Nothing tells you the waiting pile is full and passengers are being lost.
5. **Fun:** the first hour is fun and readable. The best stretch is 1840–1860 (picking pairs, watching "+$77k · 24 deliveries" pop up). After about 1855 you only connect more cities and cash piles up. Cities are the real limit on income, and improvements (Warehouse, Post Office, Terminal, Water Tower) are cheap, strong, and poorly explained.
6. **Pace** is unchanged from PT1: 1× = 24 ticks/s = 1 game day per second = **6.1 min per game year**; 2× 3.0, 4× 1.5, 8× 46 s. 8× is the real default.

| | PT1 | PT2 |
|---|---|---|
| Gridlock / deadlock | 5 times in 3 games | 0 in all runs |
| 1840 Normal, 30 years | NW $4.7M, slow first 8 years | NW $19.1M, rich from year 1 |
| 1830 Normal, 24–25 years | NW 65 % of start | NW 192 % of start |
| 1900 Hard, ~15–20 years | NW $21.7M in 15 y | NW $10.6M in 20 y with 6 trains (passive); $167M in 16 y with a good script |
| Hard vs Normal | not harder | not harder (−7 % to −28 % cash growth) |
| Repairs as share of revenue | 20–90 % | 1–4 % |
| Engine Shed | impossible to build | buildable, but economically pointless |
| Early-era upkeep trap | yes | gone |
| Money explosion | yes | yes (and larger on rich pairs) |

### Status of PT1 findings

| PT1 item | Now |
|---|---|
| Bug 1 platform deadlock | **Fixed.** 12 Atlantics on 2 Depots (double) and 24 on 2 Terminals all keep moving. Single-track Depots with 12 trains do not deadlock but lose $66k a year. |
| Bug 2 `noRoute` train holds a platform | Parked trains no longer block, but they are never removed (G1: 10 trains idle 9 years). |
| Bug 3 station on a corner | Now a warning (not re-tested). |
| Bug 4 moving at speed 0 | Not reproduced as a long freeze. Short `moving` at speed 0 appears while a convoy leaves a station. |
| Bug 6 no Engine Shed | **Fixed**, but the shed has no measurable economic effect (see Upgrades). |
| Bug 7 late modals | The new-engine card is merged ("2 new locomotives"). It still shows American (1848) and Mogul (1862) in Sep 1870 when I fast-forwarded. |
| Bug 8 Station tool default | **Fixed.** |
| Bug 9 car suggestion | OK in the wizard. |
| 1830–50 slog | Mostly fixed in 1840; 1830 is still slow. |
| Repairs 20–90 % of revenue | **Fixed.** |
| Late money explosion, Hard | **Not fixed.** |
| Electrification pointless | **Fixed** (pays back in about a year on a rich line). |
| Frontier villages stay at 1,000 | **Fixed.** |
| Bulldoze over-removes (Bug 5) | Not tested. |

## Game logs

### Game 1 — Central Europe, 1840, Normal, 1840–1870 (seed 1)

Opening: Milan–Venice (59 tiles, $147k) + two Stations ($45k each) + 2 Norris with 3 pax + 2 mail cars ($60k each). Policy: every January connect the best unconnected city (population ÷ distance) with 2 trains of the newest engine; repair bridges when I noticed.

| Jan of | Cash | Net worth | Revenue (previous year) | Op. cost | Repairs | Trains | Stations |
|---|---|---|---|---|---|---|---|
| 1841 | $0.77M | $1.01M | $143k | $15k | – | 2 | 2 |
| 1852 | $1.3M | $3.0M | $0.40M | $116k | $11k | 14 | 9 |
| 1853 | $1.5M | $3.5M | $0.76M | $149k | $13k | 16 | 10 |
| 1855 | $2.3M | $4.7M | $0.98M | $189k | $8k | 20 | 12 |
| 1858 | $4.2M | $7.2M | $1.34M | $258k | $11k | 26 | 15 |
| 1860 | $5.8M | $9.1M | $1.41M | $305k | $15k | 30 | 17 |
| 1862 | $7.4M | $11.0M | $1.52M | $366k | $36k | 34 | 19 |
| 1865 | $9.9M | $14.0M | $1.73M | $431k | $41k | 40 | 22 |
| 1868 | $13.5M | $17.0M | $1.64M | $449k | $28k | 40 | 22 |
| 1870 | $15.7M | $19.1M | $1.61M | $467k | $37k | 40 | 22 |

- Revenue per train in 1869: 4 trains earned $0, the median ~$37k, the best $109k. Operating cost was 29 % of revenue by 1870 (crew + wear + fuel + upkeep + tax; repairs only 2 %).
- **Washed-out wooden bridges cut lines silently.** Munich–Prague (washout in 1846: $270k of track and 2 trains idle for 5 years) and Strasbourg (1861: 3 lines and 10 trains idle for 9 years in my run). I only noticed by reading `noRoute` news. The rebuild itself cost $25–30k. The player gets a toast and the ⚠ chip, but nothing marks the gap.
- A city's anchor tile is not always buildable (Dresden, Vienna); a script had to try other footprint tiles.
- Pops 1840 → 1870 (served): Vienna 150k → 182k, Berlin 148k → 171k, Turin 117k → 157k (+16–34 %).

### Game 2 — random medium map (seed 7, 256×192), 1830, Normal, 1830–1855

Same map as PT1 game 2. Opening: Ashtown–Northford (30 tiles, $78k) + 2 Stations ($40k each) + 2 Grasshoppers ($32k with cars).

| Jan of | Cash | Net worth | Revenue (prev. year) | Op. cost | Repairs | Trains | Stations |
|---|---|---|---|---|---|---|---|
| 1831 | $0.79M | $0.93M | $19k | $8k | 0 | 2 | 2 |
| 1836 | $0.79M | $1.00M | $45k | $15k | $1k | 5 | 2 |
| 1838 | $0.38M | $0.90M | $92k | $45k | $10k | 9 | 4 |
| 1840 | $0.53M | $1.00M | $124k | $43k | $7k | 9 | 4 |
| 1843 | $0.43M | $1.08M | $109k | $63k | $14k | 11 | 5 |
| 1845 | $0.67M | $1.27M | $179k | $60k | $7k | 11 | 5 |
| 1848 | $0.24M | $1.34M | $226k | $104k | $15k | 17 | 8 |
| 1850 | $0.51M | $1.53M | $228k | $101k | $7k | 17 | 8 |
| 1853 | $0.39M | $1.73M | $332k | $144k | $20k | 21 | 10 |
| 1855 | $0.43M | $1.92M | $343k | $158k | $16k | 23 | 11 |

- After 25 years: **$1.92M, 192 % of the start** (PT1: 65 %).
- The two Grasshoppers earn $14k and $8k a year; three more on the same line add only $11–21k in total (each earns $5–8k and costs $2–4k).
- Hard 1830 ($600k start, same line): net worth $511k → $564k in 8 years, i.e. about +$7k a year. Normal: $929k → $1.0M. Both are barely alive until the Norris (1838).
- The Norris is the first engine that makes the economy work; the American (1848) the second.
- Pace of decisions: nothing to do for the first ~8 years except wait (that is 50 min at 1×, 6 min at 8×).

### Game 3 — random medium map (seed 11), 1900, Hard, 1900–1920

Opening: Wolfmerehaven (138k) – Wolflandridge (61k), 23 tiles: track $105k, 2 Stations $88k each, 1 Atlantic with 3 pax + 3 mail cars $240k (cash left $77k). My script then connected Eastford, Pineburg, Wolfborough and Valeborough with the engine with the highest speed × cars (a bad pick: Consolidations at 50 km/h earned $16–33k each).

| Jan of | Cash | Net worth | Revenue (prev. year) | Op. cost | Taxes | Trains | Stations |
|---|---|---|---|---|---|---|---|
| 1901 | $0.62M | $1.03M | $616k | $87k | $58k | 1 | 2 |
| 1902 | $0.98M | $1.63M | $720k | $111k | $67k | 2 | 2 |
| 1903 | $1.1M | $2.0M | $694k | $132k | $64k | 3 | 3 |
| 1905 | $1.0M | $2.7M | $727k | $191k | $66k | 5 | 5 |
| 1908 | $2.3M | $4.2M | $860k | $243k | $77k | 6 | 6 |
| 1911 | $4.2M | $5.8M | $912k | $333k | $149k | 6 | 6 |
| 1914 | $6.0M | $7.4M | $942k | $347k | $152k | 6 | 6 |
| 1917 | $7.9M | $8.9M | $979k | $350k | $161k | 6 | 6 |
| 1920 | $9.7M | $10.6M | $990k | $374k | $157k | 6 | 6 |

- One Atlantic earned **$616k in year 1** (cost $240k). Income tax on Hard starts in 1900 (about 9 % of profit), and about 19 % from 1911.
- A second Atlantic on the same pair added only $74k.
- Idle cash $9.7M in 1920; every town ≥ 5k is already served.
- Same opening on Easy / Normal / Hard, 5 years: revenue $769–815k / $615–652k / $615–652k a year. Hard pays $58–62k income tax a year, Normal 0 until 1910. Cash after 5 years: $5.1M / $3.7M / $2.9M.

### Benchmarks: a "good player" on Central Europe, 1900 (script, reinvests everything)

Berlin–Hamburg first (1 Atlantic), then every year: connect the best new city with Terminals + double track + 2 trains (Stations on single track before 1870), add Post Office / Warehouse / Hotel in cities ≥ 40k, add trains per pair up to 4. Hard needs a $200k loan on day 1 (see Bug 5).

| Jan of | Normal NW | Normal revenue (prev. yr) | Hard NW | Hard revenue |
|---|---|---|---|---|
| 1901 | $1.8M | $1.1M | $1.3M | $1.1M |
| 1902 | $3.9M | $2.6M | $2.4M | $1.4M |
| 1903 | $10.8M | $7.9M | $4.9M | $3.2M |
| 1904 | $21.4M | $11.6M | $12.0M | $8.4M |
| 1905 | $32.9M | $12.4M | $22.0M | $11.9M |
| 1908 | $75.3M | $17.0M | $54.5M | $15.7M |
| 1910 | $107.8M | $18.1M | $83.3M | $17.7M |
| 1913 | $156.9M | $19.0M | $124.6M | $19.7M |
| 1916 | $208.6M | $21.9M | $166.8M | $20.1M |

**Gold goal "net worth $150M by 1930" (Central Europe): reached in 1913 (Normal) / 1915 (Hard).** There is no reward for goals (no cash, no unlock), so there is nothing to farm, but also no pull.

The same script from 1840 (single track, up to 4 trains per pair, Terminals and improvements) reached only NW $4.5M in 1870 and $5.5M in 1880 with revenue stuck at $0.5–0.8M while operating cost grew to $0.57M. Game 1's passive "2 trains per new line" policy reached $19.1M and revenue $1.6M from the same cities. This is **not a controlled comparison** (different engines), but it matches the controlled single-track test below: **more trains on a single-track pair make less money**.

### Hard vs Normal (same play, measured)

| Test | Normal | Hard |
|---|---|---|
| 1840, Milan–Venice, 2 Norris, 6 years: cash growth | +$610k | +$566k (−7 %) |
| 1900, one Atlantic, 5 years: cash after 5 y | $3.7M | $2.9M |
| 1900 good player, NW 1916 | $208.6M | $166.8M (−20 %) |
| 3-train rich pair, net profit 1920 | $2.47M | $2.27M (−8 %) |
| 3-train rich pair, net profit 1940 | $2.56M | $1.82M (−29 %) |
| 3-train rich pair, net profit 1960 | $2.23M | $1.60M (−28 %) |
| 3-train rich pair, net profit 1980 | $1.71M | $1.23M (−28 %) |

## Balance by era

Measured on one rich double-track Terminal pair (Berlin–Hamburg, 67 tiles, 3 trains, my pick of locomotive, years 2–5). *Capital* = track + stations + trains.

| Start | Loco | Capital | Revenue / yr | Op. cost | Tax (Normal) | Net (Normal) | ROI |
|---|---|---|---|---|---|---|---|
| 1920 | Pacific | $1.85M | $3.01M | $194k | $342k | $2.47M | 134 % |
| 1940 | Hudson | $2.37M | $3.43M | $298k | $567k | $2.56M | 108 % |
| 1960 | cab-unit diesel | $2.89M | $3.65M | $362k | $1.06M | $2.23M | 77 % |
| 1980 | heavy diesel | $5.01M | $3.17M | $647k | $813k | $1.71M | 34 % |

(The 1900 row in that sweep chose a slow Ten-Wheeler and is not meaningful; the Atlantic does $2.7M on the same pair.)

- **Early era (1830–1850):** viable and slow. A pair of 12k–90k towns at 150 km makes $14k a year per Grasshopper (ROI ~40 % on the train, 6 % on the whole investment). From 1840, one Norris pays back in a year.
- **Mid era (1850–1895):** steady; cities, not trains, are the limit.
- **Late era (1900–1920):** one train on a rich pair pays back in 4–6 months. Running costs are 4–6 % of revenue on a good pair. After 1920 income tax (up to 32 %) and wear start to bite, but a rich pair still returns 77–134 %.
- **Normal vs Hard:** see the table above. Hard is a −8 % to −29 % tax on an economy that has no way to lose.

## Upgrades

All numbers: unlimited-cash benchmarks, same pair with and without the upgrade, years 2–4 averaged. 1840 = Milan–Venice, 2 Norris, single track. 1900 = Berlin–Hamburg (or Milan–Venice), 3 Atlantics.

| Upgrade | Cost | Measured effect | Payback | Verdict | Real-world sense |
|---|---|---|---|---|---|
| **Station type: Depot → Station** | +$56k (1840), +$92k (1900) | 1840: $63k → $119k a year; 1900: $476k → $1.0M | 1 year / 2 months | **OP, mandatory** | Bigger catchment = more passengers. Fine, but a Depot in a city is a trap that the new defaults hide. |
| **Station → Terminal** | +$134k (1840), +$221k (1900) | 1840: +$20k; 1900: $1.0M → $1.64M | 6.7 years / 4 months | Weak in 1840, strong in 1900 | Good: 7×7 catchment, 5 platforms. |
| **Double track** | $140k for 59 tiles (1900) | 1900: +$216k (Station) / +$241k (Terminal) | 7–8 months | Balanced; **required** for more than 2 trains | Real. The only hint is "traffic jam — consider double track". |
| **Post Office** | $46k per station (1900), $28k (1840) | 1900: +$795k a year (+28 %) for 2 stations; 1840: +$23k (+19 %) | 1.4 months / 2.4 years | **OP in the late era**, balanced in 1840 | Mail supply +50 % and pay +25 %. Mail is as big as passengers here (see Economic model). |
| **Hotel** | $92k per station (1900), $56k (1840) | 1900: +$367k (+13 %); 1840: +$14k (+12 %) | 6 months / 8 years | Balanced late, weak early | Plausible (+25 % passenger fare, +20 % growth). |
| **Warehouse** | $55k per station (1900), $34k (1840) | 1900 on **Stations**: $1.47M → $2.93M (**+100 %**); on Terminals +26 %; 1840: +17 % | 1 month / 3.4 years | **OP on Stations, broken as a mechanic** | A warehouse does not create passengers. The effect is the ×2 waiting-pile cap (80 → 160): see Exploits. |
| **Freight Yard** | $110k per station (1900) | +7 % (Station) / +3 % (Terminal) | 2–2.5 years | Weak | Faster loading: sensible, small. |
| **Water Tower** | $9k per station in 1840, $14.5k in 1900 | Steam train that goes > 40 tiles without one loses 20 % speed: 1840 +$24k (+20 %); 1900 93 tiles +$284k (+19 %) | 0.75 years / 5 weeks | **Strong and invisible** | Real (water every ~100 km). Nobody tells a new player. |
| **Engine Shed** | $34–41k (1840/1860) | Repairs were $3–4k a year of $160–260k revenue (1–2 %); extra sheds changed nothing measurable (rev $161k vs $177k vs $178k, within noise) | n/a | **Pointless**, except as the place where trains are bought | The repair-crew model is real; costs are now so low that placement is irrelevant. |
| **Electrification** | $589k for 67 tiles in 1912 ($8.8k a tile) | Early Electric on it: revenue $3.55M vs $2.74M for the Atlantic (+30 %), op cost $146k vs $119k, engine +$70k | ~0.8 years | Balanced / strong on rich lines | Real (speed, wear −20 %). The goal (120 tiles ≈ $1M) is trivial late. |
| **Civic Investment** | $559k per city (1900) | +15 % population plus a growth tick: Berlin 148k → 170k; with 4 rounds + Hotel + Post Office, 20 years: 148k → 330k (served only: 189k) | not measurable (trains were the limit) | Weak / pointless when capacity-bound | No obvious real-world mechanism; "the city council builds" is fine. |
| **Cold Storage, Livestock Pens** | $40k / $15k | not measured | – | untested | The Build-tab "No livestock ranch in range yet" hints are clear. |

Station Build tab (`station-build-tab-1.png`, `station-build-tab-2.png`) shows what each upgrade does in words and greys out ones that would not help. It never shows an estimated gain in money or supply.

## Economic model v2

| Cost | Size (measured) | Feels real? | Visible? |
|---|---|---|---|
| Fuel & servicing, crew wages | 1840: $2–4k per train a year; 1922: $25k + $18k for 5 Pacifics in 7 months | Yes, and small | Finance chips plus train Stats ("$2k/yr FUEL & SERVICING", "WAGES · CREW OF 3") |
| Track upkeep | 2–4 % of revenue early | Yes | Finance chip |
| **Track wear** | 1922 (Hard, 5 Pacifics): **$100k in 7 months, 50 % of all running costs** | Yes (heavy fast steam really wears rail) | Finance chip + train Stats; the largest cost late and the one a player cannot see coming |
| Repairs / locomotive complexity | 1–4 % of revenue | Plausible, but now invisible | Finance chip; train panel shows risk "1.1 % / month" |
| Property tax | 0.5 % of book value: 1.4 % of revenue early | Yes | Finance chip |
| **Income tax** | Normal 0 until 1910 then 6–32 %; Hard ×1.6 and from 1900. Example: $342k on a $2.8M profit in 1920 | Yes | **Booked as a lump at year end.** The monthly "Running costs" excludes it and nothing accrues, so January surprises |
| Competition (road, air) | starts 1930 for < 150 km | Yes (not tested) | Train panel text |
| Wage and fare curves | – | Yes | Help text only |

- The model is fair and understandable per item. What is **missing** is the *consequence* view. Running costs are 4–6 % of revenue on a good pair (14 % in G3's first year, 29 % across Game 1's many weak lines), so none of the "real" costs creates a decision except income tax late. The model adds realism, not play.
- **Mail ≈ passengers:** mail is 48–55 % of revenue in every run. Mail supply is about pop/425 and a bag pays 1.74× a passenger, plus the Post Office's 1.5 × 1.25. Real railways earned a small share from mail (a high-value contract, but small volumes), so a 140k city producing as much mail revenue as passengers feels generous and makes the Post Office the best-ROI improvement.
- **Speed matters a lot, and it is not explained:** on the same Milan–Venice line in 1900: Atlantic (100 km/h, 6 cars) $1.06M, Ten-Wheeler (75 km/h, 8 cars) $0.36M, Consolidation (50 km/h, 12 cars) $0.17M. The cause is trip frequency against passengers' 10-day waiting decay, not the speed bonus. The buy wizard shows speed and cars, but a 12-car freight engine looks like a bargain.

## Transparency

**Good:**
- Finance This-year tab: revenue by cargo and 8 cost chips (`g1-finance-costs.png`, `finance-hard-1922-costs.png`).
- Train Stats tab: profit this year / last year / lifetime ("Paid back 152 % of $86k"), fuel, wages (crew size), wear, repairs, risk.
- Station supply per month and demands; the new-station card shows catchment, platforms, storage and upkeep.
- Stuck chip with count, tap-through news, the "no livestock ranch" style hints.

**Missing:**
1. **No per-station or per-line profit and loss.** You cannot tell which of your 20 lines makes money, or whether an upgrade paid off.
2. **No lost-cargo indicator.** The station panel shows "152 waiting" (the cap) but not that passengers are being turned away. This is the single most valuable fact in the game (it explains why Warehouses, Terminals, more trains and frequency pay).
3. **No payback estimate on upgrades.** The upgrade card says "Mail +50 % here" but not "+$X a year at your current flows".
4. **Income tax is not accrued monthly** (see above).
5. **The Help is only two tabs** ("Station upgrades", "How money works"). It says "pay grows with distance and speed" but does not mention: waiting piles and decay, convoys and single-track capacity, double track, the steam Water Tower rule, "Wait until every car is full", bridge washouts, or that loans exist for the first locomotive.
6. **Distances are in tiles** in the route list ("33 tiles") but km everywhere else (speed, bonuses, the Help).
7. **First-hour hints stop at four steps** (track, station, train, orders). Nothing about upgrades or loans.
8. **The buy wizard lets you walk three screens toward a locomotive you cannot afford** ("Buy · $241k" greys out only on the last step) and offers no shortcut to Borrow (`hard-cant-afford-train.png`).

## Exploits (ranked)

Method: fresh game, unlimited cash, same route with and without the trick, 3–5 years, revenue per year. "Good normal" reference: Berlin–Hamburg 3 trains on double Terminals: **$2.7–2.8M a year for $1.43M capital**; whole-network good play $20M a year by 1910.

| # | Trick | Steps | Result | Verdict |
|---|---|---|---|---|
| 1 | **Warehouse on a passenger Station** | Berlin–Hamburg, 3 Atlantics, double track, Stations. Add Warehouse at both ends ($110k). | $1.47M → **$2.93M a year (+$1.46M, +100 %)**. On Terminals +26 % ($2.74M → $3.46M). 1840: +17 %. | **Exploit-grade**. The doubled pile cap, not a warehouse, is the cause. |
| 2 | **Post Office + Hotel stacking** | Berlin–Hamburg, add PO ($92k), Hotel ($184k), then Warehouse ($110k) + Freight Yard ($220k). | base $2.79M; PO $3.59M (+$795k); Hotel $3.16M (+$367k); both $3.95M (+$1.16M for $276k); all four $4.52M (+$1.73M for $606k) | Merely **strong**, but payback of weeks. |
| 3 | **Water Tower** | Vienna–Munich 93 tiles, 2 Atlantics. $29k for 2 towers. | +$284k a year (+19 %). | **Strong**; invisible rule. |
| 4 | **Terminal + double track + many trains on one pair** | Milan–Venice, Atlantics. 1 train, single, Station: $1.06M. 8 trains, double, Terminals: **$2.81M** for $2.3M. | **2.6× the naive line**; 12 trains: $2.62M (cap reached); 24 trains: $2.86M | Normal progression, but the cap on revenue per pair is soft. |
| 5 | **Frontier Depot** | Atlantic line Wolfmerehaven–Pineburg; $27.6k Depot on empty land ≥ 13 tiles from a town, train stops there. | A village appeared in year 3. **1,000 → 4.3k (y5) → 12k (y9) → 23.8k (y15)** | **Strong but historic** ("railroad towns"). Free city creation for $28k. |
| 6 | **Loans** | 8 % (Hard) / 6 % against 150–290 % ROI. Credit limit = max($500k, 50 % of net worth). | Hard 1900: without a loan you cannot buy the first locomotive (Bug 5). With a $200k loan: NW $1.3M after year 1. | Not an exploit; **the interest is irrelevant**, and the limit is only a speed bump. |
| 7 | **Mail-only trains** | Berlin–Hamburg, 2 Atlantics, 6 mail / 6 pax / 3+3 / 4+2 cars. | mail-only $1.23M; pax-only $1.26M; **mixed 3+3 $2.21M**; 4 pax + 2 mail $2.09M | **Fine** (each cargo has its own supply; mixing wins). |
| 8 | **One super-train vs many small** | Milan–Venice, 1900: Atlantic (100 km/h, 6 cars) / Ten-Wheeler (75, 8) / Consolidation (50, 12). 1870: American $108k / Mogul (9 cars) $158k. | 1900: $1.06M / $0.36M / $0.17M | **Fine**: slow big trains are punished (visit frequency and speed). Many small, fast trains win. |
| 9 | **Very short route** | Two stations 6.3 tiles apart inside Milan, 2 Atlantics. | $164k revenue, ROI 22 % | **Fine**. |
| 10 | **Very long route** | Hamburg → Berlin → Prague → Vienna (193 tiles), 4 Atlantics. | $1.79M revenue (pax $1.34M, mail only $0.45M), capital $3.06M, ROI 58 %. Berlin–Hamburg (67 tiles) is $1.1M a train. | **Fine** (peak at 60–90 tiles). |
| 11 | **Warehouse transfer loops** | Milan–Venice–Munich with a Warehouse hub at Venice. Direct Milan→Munich 4 trains $0.32M; hub transfer (A→hub→B) $2.04M; bounce (A→hub→A) $1.35M; **separate pairs Milan–Venice + Venice–Munich $3.54M** | Transfers pay only once (crow-fly origin → delivery, nothing for the transfer leg) and always lose to plain point-to-point. | **Fine**. No double pay. |
| 12 | **Buy-sell loops** | Sell a new Atlantic ($200,560): returns $100,280 (50 %, even at age 0 and at age 1). Bulldoze 20 tiles of track ($90k): refund $22.5k (25 %). Station demolish refused for the last Engine Shed. | −50 % / −75 % per loop | **Fine**. (But a 1-year-old engine resells at 50 % flat while net worth counts it at 95 %.) |
| 13 | **Perpetual city growth (Civic + Hotel + Post Office)** | Berlin–Hamburg, 20 years, 4 Civic rounds ($559k each, per city). | 148k/130k → 330k/290k (served only: 189k/166k; unserved: 0 % growth) | **Merely strong, expensive**. Not a spiral: linear, capped by the 5-year cooldown. |
| 14 | **Goal farming** | Goals have no reward (no cash, no unlock). | Gold NW reached in 1913. | **Nothing to farm**; but no motivation. |
| 15 | **Yard queues** | 12 Atlantics on two Depots (2 platforms), double: revenue $746k, profit $520k, ROI 18 %; **single track: −$66k a year**; 16 trains on Stations $1.9M; 24 on Terminals $2.86M. | No deadlock; marginal trains cost $10k a year for ~$0 revenue | **Fine** (over-subscribed = unprofitable, not broken). |
| 16 | **Electrification** | see Upgrades | +$812k a year for $589k + $70k | **Strong but fair**. |
| 17 | **Port export of everything, discoveries, interest-free intramonth loans** | Code read only. A Port accepts 10 bulk cargoes at the same rate as a steel mill (BALANCE.md: coal ROI 33 % vs 290 % for rich passengers in 1900). Interest is charged on the month-end balance with no fee. | Not simulated | Port: **pointless** (not an exploit). Intramonth loan: trivial. |

**Fix the cause, not the number:** exploits 1 and 2 share a root, the hard waiting-pile cap (and the waiting decay), which makes anything that raises the cap, or the visit frequency, look like a multiplier.

## Bugs

**Bug 1 — HIGH: "Wait for full load" unloads the cargo it just loaded and throws it away.**
- *Repro:*
  1. Central Europe 1900 (or any), `?debug=1`. Chain two city Stations (Milan–Venice), double the track.
  2. Buy one Atlantic with 3 pax + 3 mail cars. Orders: both stops `fullLoad`, max wait 1 day (or via the UI: tap the "Auto" chip until it reads "Full load", `bug-fullload-order-chip.png`).
  3. Run 60 days and read the cars at departure.
- *Observed:* the cars fill (40/40/40/30/30/28), then on the next daily re-plan of the wait they read **40/2/0/5/0/0**. The loaded cargo is "delivered" back at the station it came from (distance 0, no revenue) and the cars refill from what is left of the pile.
- *Cause (code read):* `stepLoading` re-runs `planLoadUnload` on every extra wait day (`src/sim/trains/loading.ts`, comment "re-runs this plan on each extra wait day"). The plan unloads any car whose cargo the station accepts, including cargo with `loadedTile === station.tile`.
- *Cost:* one train, same line: **$1.02M a year on Auto vs $0.17M (wait 1 day), $0.41M (wait 5), $0.31M (wait 20)**. Two trains with wait 20: $94k vs $1.2M. Eight trains with wait 20 on double track: $64k. Freight at a non-accepting station is not affected.
- *Fix:* skip unload for cars loaded at this tile, or run the unload only on the first pass of a stop.

**Bug 2 — MEDIUM: washed-out wooden bridge is a silent, permanent outage.** (G1 ×2; reproduced with `yearlyWashoutStep` in a 1850 game.)
- Toast "A wooden bridge near Munich has washed out" and "Train 1 has no route to Berlin", plus the ⚠ count. After the toasts fade nothing marks the gap on the map, and `noRoute` trains wait forever.
- Rebuilt as wood again for $25–30k, 1 %/yr chance each. With 7 wood bridges that is about one outage in 14 years on average, each costing years of income.

**Bug 3 — MEDIUM (UX trap): more trains on a single-track pair lowers income.** Milan–Venice, Stations, 1900, Atlantics (unlimited cash, 3-year average):

| Trains | 1 | 2 | 3 | 4 | 6 | 8 |
|---|---|---|---|---|---|---|
| Revenue | $1.06M | $1.20M | $0.96M | $0.71M | $0.57M | $0.39M |

  - With double track: 8 trains $2.0M; Terminals + double: 8 trains $2.81M.
  - Trains travel in convoys; the first takes the pile, the rest run empty; the pile cap and decay waste the supply between convoys. All trains read `moving`.
  - The only hint is the "Traffic jam — consider double track" news. The status shows `moving` at speed 0 for queued trains.

**Bug 4 — LOW: stacked toasts cover the Finance panel's tabs** (`finance-hard-1922-costs.png` was taken after waiting; the first attempt showed "Wood discovered…", two "Year in Review", "Berlin has grown into a Metropolis" over the header, and my tap on "This year" missed). They clear after about 8 s. Phase 27 D said toasts never cover an open panel's header.

**Bug 5 — LOW: you can strand yourself on Hard.** Berlin–Hamburg (67 tiles) + 2 Stations leaves $78k; the Atlantic is $188k–$241k. The wizard lets you pick engine and cars and only greys "Buy" on the last step (`hard-cant-afford-train.png`), with no Borrow shortcut. A script that did not borrow ended with NW −$248k after 16 years. Finance → Borrow fixes it.

**Bug 6 — INFO (script-level, not UI-verified):** a city's anchor tile can be unbuildable (Dresden, Vienna): `findBuildPath` returned no path to it, while other footprint tiles worked.

## UX friction at 800×360

- **The panel is half the screen.** The Station Build tab body scrolls 805 px inside 171 px visible, nearly five screens, and the Buy button bar sits on top. With the "New station" card open the second city is behind the panel; I tapped a tile I could no longer see.
- **The route sheet** covers the bottom third; both stations were off-screen (one under the top bar), so "From list" was the only usable path. It works, and the tiles distance is shown, but there is no cost-of-route or expected-revenue hint.
- **A tap on the order's rule chip silently cycles** Auto → Full load → …; one stray tap turned my second stop into Full load without a prompt (and see Bug 1).
- **Toasts** (Bug 4), the debug overlay (debug only), and the top bar swallowing taps below y = 44.
- **The new-engine card after a fast-forward** lists several locomotives from years ago in one card ("American 1848, Mogul 1862" in Sep 1870, `g1-late-modals-1870.png`).
- **Good:** wizard (engine card, "Passengers + mail" suggestion, total on the Next button), ghost cost and Build/✕ bar, Station card, Finance chips, Stuck chip, the year-in-review as a badge.

## Fun factor

- **Delightful:** the first line. The ghost cost, the Station card, the wizard, then "+$77k · 24 deliveries" floating over a city. Picking big-city pairs in 1840–1860 is a real decision.
- **Flat:** 1830–1838 (nothing to do) and everything after ~year 5 of a 1900 start (money doubles every year; 63 trains; $148M idle in 1916). A player wants a sink and a risk.
- **Confusing:** why the 8th train earns less than the first; why "Wait for full load" kills income; why a Warehouse doubles passengers.
- **Unmet promise:** goals celebrate but give nothing.

## Top 10 changes (priority order, each tied to a real mechanism)

1. **Fix Bug 1** (wait-for-full-load unloads at the origin). Do not unload cargo whose pickup tile is this station; add a regression test on a pax stop with `fullLoad`.
2. **Replace the hard waiting-pile cap with passengers' real behaviour: people give up and go by road or stay home.** Passengers and mail should have an explicit "turned away" counter on the station panel (units and $ per month) and a longer wait before they leave, rather than a fixed cap of 80 units that a Warehouse doubles. Warehouses should store *freight* (grain, coal, goods), as in real life. This removes exploit 1 and explains frequency.
3. **Hard = capital and land, not a tax multiplier.**
   - Real mechanisms: way-leave and land purchase per tile that rises with the population around the line and with the year; rising marginal interest as debt ÷ net worth grows; scarcity of good sites (a railway needs a franchise).
   - These also give the late game a sink that grows with success. Hard at 1900 is today only −20 %.
4. **Make track a wasting asset.** Track wear exists as a cost (it is 50 % of late running cost) but never as *condition*. Let rail and sleepers age by tonnage and cause slow orders until relaid, and let locomotives wear out (retire at ~30–40 years). That is a real recurring investment that scales with the network.
5. **Surface "where the money goes and what it would do":** per-line and per-station P&L; lost cargo per month; "this upgrade would have added ~$X last year"; an income-tax accrual line each month (companies pay provisional tax). Add Help lines on piles, convoys, Water Tower, double track.
6. **Passing loops and timetables for single track.** Real railways spaced trains with headways and loops. Add a cheap passing loop and an optional "min days between departures" so more trains can raise income on a single line; replace the "traffic jam" news with a diagnosis ("2 trains share this single line: 1 train earns more").
7. **Persistent washout marker and one-tap rebuild** (crews rebuilt bridges within weeks, usually in iron or stone afterwards). Offer a stone/steel upgrade at rebuild.
8. **Give the Engine Shed a reason to exist.** Real sheds serviced engines on a mileage cycle; make breakdown chance rise with km since last service and the −50 % apply only inside it, so sheds along a long line matter. Today repairs are 1–4 % of revenue.
9. **Rebalance mail by contract, not by volume.** Real mail was a steady contract, a small share of income. Give mail a smaller supply per head (or fixed contracts per city pair) so the Post Office is an option and not the best ROI in the game; keep the mixed-train advantage.
10. **First-hour guidance for money:** the wizard should say "You need $241k; you have $78k — Borrow $200k?"; the hints should mention loans and "keep $250k for the locomotive" on Hard; show distances in km; make a tap on the order rule open a small picker instead of cycling.

Smaller notes: add a goal reward (e.g. a franchise discount) so goals pull; make the 1830 start begin with a visible "wait for the Norris (1838)" hint or default to 1840; make the new-engine card show the year of the engine.
