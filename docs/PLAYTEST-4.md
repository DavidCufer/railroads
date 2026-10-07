# Playtest 4

Play-tester report. **No game code or tests were changed.** Screenshots: `docs/screenshots/playtest-4-*.png`.

- **Build under test:** `origin/main` at `023c0bf` (Phase 40: processor caps and scaling chains, difficulty/bonds/bankruptcy/panics, the silver/uranium long-haul chain).
- **Setup:** Chromium 800×360 (×2 DPR), Vite dev server, `?debug=1` for setup and fast-forward (`buildTrackPath`, `buildStation`, `buyTrain`, `runDays`), plain URL for the real title / New Game / Load Game screens. Long games were played on the sim API with my own scripts (kept in a gitignored `.scratch/`; they build with the game's own commands, station by station, and rebuild washed-out bridges and relay track once a year like a careful player would). Cross-checks with `tools/bench` (`goodPlayer`, `badPlayers`, `longHaul`). Maps: Central Europe, seed 1 unless noted. The silver/uranium chain on that map: Milan Silver Mine (81,230) → Zagreb Smelter (222,279) → Vienna Mint (209,163); legs 138 + 112 tiles.
- **Honesty notes:**
  - **I am not a human and I did not click through 40 years.** Game (a) is a script that makes the decisions a plain player would (Prague–Dresden first, a grain → Food Plant → Prague chain in 1846, two more passenger lines, the silver chain in 1865) and reads the same numbers the UI shows. The UI was used for the screens listed below; the money flow comes from the sim. Both give the same numbers where I compared them.
  - **Not tested:** touch gestures, the Track-mode drag UI (I build by path through the debug hook, so I did not see the bridge-type default or the build preview), Cold Storage, discoveries, sound, the Android build. I did not play the uranium game by hand beyond the sim scripts.
  - `tools/bench/goodPlayer.ts` fails to start a company in 1930 and 1950 (bankrupt in 1932 / 1952 with one train and zero revenue). That is the bench's first-line rule (city-centre stations, fastest engine), not necessarily the game; I replaced it with my own opener (see BAL1).
  - Numbers are from one seed per scenario unless a row says otherwise. The sim is chaotic: ±30 % year to year on freight is normal.

## Verdict

**The Phase 38–40 mechanisms work and the UI is short: the banner, the game-over card, "Load last autosave", the silver/uranium station line, the secure cars and old-save loading all behave. The problems are in what the player can't see and in the eras that were never benched.**

1. **Heavy locomotives cannot cross wooden bridges, and the game says nothing.** A Hudson/Pacific/Mikado train just shows "No route to Vienna Mint". In 1930 a silver chain bought with the newest steam engine earns **$0 and loses $250k a year forever**. The buy wizard, the news and the train panel give no reason (the electric case has one).
2. **The 1930 and 1950 starts are a different, much harder game.** Start cash is a flat $1M in every era while prices are ×2.4 by 1950. A 1950 Normal company with one passenger line grows from $0.9M to $1.8M net worth in 28 years, and the uranium chain (45–110 %/yr, 5–10× any other thing you can build) is out of reach for about 35 years.
3. **Once the chain is affordable it is the whole game** (1950: about $5M a year on $5M, against $0.1M a year on a $0.9M passenger line). In 1900 it is a fair 50 %, in 1865 a poor 10 %.
4. **The insolvency banner is hidden behind the toast pile.** The first toast sits exactly on top of it. The credit cliff at month 24 and lenders' calls arrive with no warning ahead of time.
5. **The chain's headline "Pays ~$2,477/t" is easy to misread, and the chain is throttled by things the player can't see** (80 t pile at a Station, a single-track tangle at the smelter that two $17k passing loops fix).

## Findings

### Bugs

**B1. Heavy engine + wooden bridge = silent `noRoute`, in the very era the long-haul chain is meant for.** *(bug / UX, high)*
- Repro (sim and UI): Central Europe seed 1, start 1930. Build the silver chain (leg 2 crosses one wooden bridge), buy a Hudson 4-6-4 train at the mine, orders Smelter → Mint. `playtest-4-07-heavy-engine-no-route.png`: the train panel says **"No route to Vienna Mint"**, nothing else.
- Scale: bars trains with Hudson / Pacific / Mikado never move. 1930, 2 ore + 2 bars, double-track leg 1: Hudson **$0 freight, net −$0.22…−$0.27M a year for 12 years**; Pacific **−$0.2M a year for 4 years, then +$0.7M a year**; I believe a wooden bridge washed out and my script rebuilt it in stone (inferred, not traced), so the "fix" was an accident; Atlantic (medium) the same chain nets $0.4–0.9M a year at once.
- Why it matters: the engines you most want in 1927+ (Hudson 135 km/h, Pacific, Mikado, Articulated) are all `heavy`; `WOODEN_BRIDGE_MAX_WEIGHT_CLASS = "medium"`. The only explanation is a paragraph in Help. The wizard does show a lock and "Needs electrified track at this station" for the electric case (`playtest-4-06-…png`), so the pattern exists; it was not done for bridges.
- Expected: train panel and the `noRoute` news say "Heavy engine can't cross the wooden bridge near X"; wizard warns if the route to the next stop has a wooden bridge; maybe tap-to-rebuild in stone from that message.

**B2. Insolvency banner is covered by the first toast.** *(UX bug, medium, easy)*
- Repro: Hard 1900, set cash −$400k, run 31 days. `.status-banner` is at y 48–74 (z 20), `.toast-container` starts at y 52 (z 30). A lone toast ("Insolvent: 1 month to recover") already hides all but a red sliver (`playtest-4-09-insolvent-banner-under-toasts.png`). During a crisis there are always toasts (breakdowns, "Borrowed $2k to stay solvent", "Lenders called …"), so the one persistent warning is exactly the one you don't see. The panic banner has the same position.
- Also: banner says "30 days to recover" while the toast says "1 month to recover".

### Balance

**BAL1. 1930 and 1950 Normal: the start is $1M, as in 1840, but prices are 2.2–2.4×.** *(balance, high)*
- First line, best affordable pair (Milan–Turin, ring-1 stations): 1840 $212k; 1900 $387k (Hard prices); 1930 $378k; **1950 $427k plus $450k for the first diesel train** ($575k with an 8-car consist). After the first line you have about $0.2M.
- 1950, my opener, passenger only: revenue **$0.21M** per line, **second and third train add nothing** (demand-capped, $210k with 1, 2 or 3 trains), net about $0.11M a year per line (12 % on $0.9M). One line, then the second one after 7 years and the third after 14: net worth $0.88M (1950) → $1.3M (1956) → $1.8M (1978). `goodPlayer` 1900 reaches $20M in 16 years; 1840 $5M.
- Hard 1900: the cheapest line ($387k) plus one train leaves $74k. With cheap edge stations and one train the line earns **$35k a year** and the company sits at $0.43M net worth for 20 years, flat. The opener that works (centre stations, $500k start-up loan, 2 trains: bench NW $9–11M by 1916) is the opposite of what the numbers on the New Game screen suggest; the screen shows only "$600k" (`playtest-4-01-new-game-hard.png`).
- The New Game screen also gives no hint that 1930/1950 are expert starts (the real-world regions only offer 1830/1840/1860; 1900/1930/1950 are Random-map only).
- Idea: era-scaled start cash (or an era starter fleet), or tell the player in New Game.

**BAL2. The chain's return depends violently on era, locomotive and a hidden pile size.** *(balance, medium)* Real map (central-eu seed 1, 138 + 112 tiles, terminals at mine and smelter, leg 1 double, 2 ore + 2 bars trains, net cash a year after the first two years):

| start | engine | invested | net a year | return | comment |
|---|---|---|---|---|---|
| 1865 | American 60 km/h | $2.1M | ≈ $0.2M (0.05…0.37) | ≈ 10 % | never in 12 y with Stations (−$0.25M over 8 y, see BAL4) |
| 1900 | Atlantic 100 km/h | $3.1M | ≈ $1.6M | ≈ 50 % | with Stations instead of Terminals: $0.7M |
| 1930 | Atlantic | $3.7M | ≈ $1.5M | ≈ 40 % | Hudson/Pacific: 0 (B1) |
| 1950 | Streamliner 145 km/h | $5.0M | ≈ $5.0–6.8M | ≈ 100–130 % | 3+3 trains on single track still net $1.7M |

`tools/bench/longHaul.ts` (flat plains, 100-tile legs) gives 77 % (1900), 96 % (1930), 169 % (1950) with a 2+2 fleet. The real map is 2–4× worse than the bench before the throttles below are removed; the bench's numbers should not be read as what a player sees.
- **1950 is dominant.** Passenger line in 1950: 12 %, $0.1M a year. Uranium: $2.5M a year with **one** ore and **one** bars train on double track ($3.65M), and the revenue is flat in the number of trains (1+1 $2.5M, 3+3 $2.9M, 6+6 $3.0M): the mine output is the cap. After building it, nothing else in the game moves the needle, and before building it nothing can reach it (BAL1). 1900 and 1930 are balanced against ordinary lines; 1865 is a trap (see UX1).
- Cars cost 6× a wagon and 3× upkeep; at 1950 the 12-car fleet cost is minor against track ($2.2M); the secure cars do not change the picture.

**BAL3. Mine and smelter at a Station halve the chain.** *(balance / UX, medium)* A Station holds 80 t per cargo; the mine makes 80 t a month and a train arrives every 45–90 days, so a 6-car (120 t) ore train leaves with ~50 t (traced in the sim: loads 20/20/11 t, pile 50–80 t). Terminals (150 t) double the net in 1900 and 1930 (above). The station panel shows "Supplies 80 per month", never "pile full, ore lost". The Phase 40 PROGRESS note says the bench uses terminals for this reason; nothing in the game says it to the player.

**BAL4. 1865 single track: more trains make the chain worse.** *(balance, medium; the game's hint is right, see UX2)* 1865, same chain, Stations, 8 years, net cash: 1+1 trains **+$0.23M**, 2+2 **−$0.25M**, 3+3 −$0.49M, 4+4 −$0.97M (12 y). 28 traffic-jam news items. Fixes (2+2): double track on leg 1 **+$1.66M** ($274k), double track on leg 2 +$1.63M, both +$1.80M; **two passing loops near the smelter at $17k each: +$1.23M**; upgrading the smelter to a Terminal: no change (−$0.28M). 8 tiles of the two legs are shared at the smelter. So a single player decision, worth about $1.5M over 8 years, costs $35k. The toast ("2 trains share a single line near Zagreb Smelter — add a passing loop or double track") says exactly the right thing; it is also posted twice in a row (`playtest-4-04-single-track-toast-pile.png`).

**BAL5. Panics are a credit squeeze, not an income hit.** *(balance, low)* In the 1840 game the 1847, 1857 and 1873 panics ("demand −28 %") moved passenger revenue by roughly −3 % to −10 % (read off yearly totals, not isolated) for lines that are capacity-limited anyway (2 trains on a line whose demand is 5× capacity). They only bite through credit (calls, see B2 / UX3). That is a fine design for a leveraged player and no pressure at all for a debt-free one.

**BAL6. Idle money is unchanged (PT3 BAL3).** *(balance, low)* 1840 Normal, 14 trains by 1865: cash $5.8M (1865) → $11.4M (1881); with double-tracked silver $13.7M. Nothing to buy. Not new, not made worse.

### UX / clutter

1. **"Pays on arrival at the Mint: ~$2,477/t" reads as a promise.** *(UX, medium)* It is the value of a ton of ore as bars on an on-time delivery; the mine is 80 t a month, so the line suggests about $2M a year when an 1865 chain nets $0.2M (BAL2). One more clause on the same line ("≈ $X a year at full output; needs 2 legs, ~$2M of track") would do, or put the 1865 expectation in the Help paragraph. Otherwise the long-haul UI is clear: smelter panel "Needs silver ore" in red, "details" collapsed, Engine Shed hint ("Needs an Engine Shed") (`-02-`, `-03-`).
2. **Jam/loop hint is good; make it actionable.** The toast names the place but not the cheap remedy price; "add a passing loop" does not open the loop tool at the right tile. It appears twice in a row.
3. **No advance warning for the credit cliff.** *(UX, high for Hard)* Start-up credit ($500k floor) ends at month 24; the new limit is earnings-based: in my 1840 game $226k at 1847 with $1.4M net worth. Hard 1840 leveraged bot: limit **$500k → $146k in month 25**, 6 `loansCalled` news items, first "Insolvent" with 1 month left, **bankrupt at month 30 with net worth +$0.53M**. Nothing in Finance says "start-up credit ends in N months" or "limit $X below debt $Y; lenders call 25 % a month".
4. **Borrow is one tap, no terms.** *(UX, medium)* `playtest-4-11-…png`: tapping Borrow books $100k immediately. The screen shows loans and credit, not the interest rate, the monthly principal (1/120 of the book, $833 for $100k) or "10-year bond". Repay is the same (works; schedule shrinks proportionally).
5. **Game-over card is clear but a bit off.** *(UX, low)* "0 years of railroading" for a 10-month game; no "what went wrong" line (the cause is always in the news: calls and forced loans). "Load last autosave" works (below) but puts the player back in the already-insolvent month with 30 days left and the clock paused.
6. **Wizard default can be an engine you can't use.** *(UX, low)* 1930: first row selected is the E-Unit Electric ($440k) with "Needs electrified track at this station" and a lock; **Next · $440k** is enabled. Better to select the best usable engine. 1862: default is the new Mogul (55 km/h, $78k) while the American is faster and $14k cheaper; for a first train that is a trap. The car tiles show capacity but not price; secure cars are about $17k each (1862) next to about $8k passenger cars and nothing says why (`playtest-4-05-…png`).
7. **"Undeliverable" news wording.** *(UX, low)* In the 1840 game "Train 3 carries 1 car of grain that no stop on its route accepts" repeated 20 times in 16 years (1865–1880) on a grain → Food Plant leg. The stop does accept grain; the plant is probably full at that moment (my guess from the Phase 38 cap, not traced). I did not isolate which event posts it. A full processor therefore reads as a data error.
8. **Toast pile at 1× covers a third of the map during any crisis** (`-04-`, `-09-`): five to seven lines. Same as PT3 UX3; the pile also drives B2.

### Edge cases that passed

- **Hard, 1840 spammer (9 trains on $500k loans):** forced loans from month 5 (a toast each), insolvency banner/news at month 10, bankrupt at month 11. The 5 months of "Borrowed $2k to stay solvent" are the real warning; fair for a spammer. Game-over card OK (`-10-`).
- **Load last autosave:** works from the card (monthly autosave exists; state restored to the previous month, cash −$4k, not bankrupt, paused). One more month and the game is over again unless the player sells trains. No autosave is written once bankrupt (confirmed in code).
- **Leveraged on Normal:** 1840 seed 1, 27 trains: panic ("Railway mania crash", 14 months) and the first call arrive **in the same month (1847 m7)**, "Insolvent" two months later, bankrupt after 3 months with **net worth +$1.34M**. 1900 Normal: calls start in 1905 m1 right after start-up credit ends, bankrupt in m9. A company that is worth money goes bankrupt because it cannot sell anything in time; nothing in the news says "sell trains". The string for that ("borrow, sell trains, or cut costs") exists (`strings.ts:670`) but I did not see it on screen.
- **Hard 1900 leveraged seed 2:** calls after the start-up credit (1902, small), panic of 1907 m3 → bankrupt in m9.
- **Old saves:** a Phase 38 save ($400k plain loan) and a Phase 39 save (amortising loans) made on the old commits load through `migrateSaveFile` and through the real title screen (Load Game: "Old Phase 38 save", `playtest-4-12-…png`, camera centred on the network, $1.2M, Jan 3 1843, no errors) and run 6 more years. The old plain loan is treated as an amortising book (schedule `loans/120`) and is called at once if above the limit (limit $345k vs $400k debt: calls in the first year). Old saves have **no** silver/uranium chain and cannot get one; a save from before Phase 40 plays as before.
- **Full processor:** forced a Food Plant to cap for 120 days with two grain trains: trains run empty, nothing is loaded for the refusing stop, no stuck/jam, no unpaid cargo carried; the farm pile sits at 60. On release, deliveries resume at once. No news says "plant full, your trains run empty". I did not check the panel line "Stock: 240 t (full)" in the UI.
- **Demolished station:** end station of a two-station line removed: refund $13.6k on a $53k build, news "Dresden demolished, 2 trains" + "fewStops" per train; both trains `noRoute`, 120 days parked at ~$1.2k per 20 days each; `setOrders` with one stop is refused (`invalid-orders`), `sellTrain` works.
- **Early repayment:** `repayLoan` pays what is owed when the ask is larger; the monthly principal shrinks in proportion; refused when cash is short. No penalty (fine). I could not find a way to see the schedule.
- **Secure cars in the wizard:** the "Silver Ore train" suggestion shows at the mine; bars cars are offered everywhere (also at the mine; harmless); they show "10 t", 9-car cap for Mogul; the price shows only in the total ($78k → $112k for two bars cars). The one-line "Pays on arrival" in the panel is the only explanation of why bars cars exist.

## Top 5 to fix next

1. **B1: heavy engines on wooden bridges.** Say it on the train, in the `noRoute` news and in the wizard ("Pacific can't cross the wooden bridge near X"), or let the pathfinder/wizard rebuild in stone; it zeroed a whole chain in 1930 and punishes the newest engines.
2. **BAL1: era starting cash.** Scale it (or give an era starter) and say on New Game that 1930/1950 are expert starts. At the moment 1950 Normal is a 35-year grind and then a one-industry game (BAL2); 1930/1950 are also the two eras the benches never cover (`goodPlayer` goes bankrupt there). Add 1930/1950 rows to `survival.ts`.
3. **B2 + UX3: the warnings.** Move the toast stack below the banner (or hide the banner's slot from it); announce the end of start-up credit three months ahead and "limit below debt" before the first call; show the interest rate, monthly principal and the call rule on Borrow.
4. **BAL3 + BAL4: make the chain's bottlenecks visible.** At a mine or smelter: "Pile full: N t lost last month (a Terminal holds 150 t)"; in the jam toast: "Passing loop here: $17k". Both took the 1900 chain from ~25 % to ~50 % and the 1865 chain from −$0.25M to +$1.2M.
5. **UX1 / BAL2: tell the truth about what a chain pays and when.** Give the "Pays on arrival" line a volume (or a yearly figure) and decide whether 1865 silver (10 %) and 1950 uranium (100 %+, flat in trains) are intended. If late-game dominance is intended, give the passenger network something to match it; if not, give the other lines a lever.

## Evidence index

| file | shows |
|---|---|
| `playtest-4-01-new-game-hard.png` | Random tab, Hard: $600k, no hint about eras or difficulty |
| `playtest-4-02-silver-mine-station.png` / `-03-smelter-station.png` | one-line "Pays on arrival", "Needs silver ore", "Needs an Engine Shed" |
| `playtest-4-04-single-track-toast-pile.png` | the jam hint twice, toast pile |
| `playtest-4-05-buy-wizard-secure-cars.png` | two bars cars added, $78k → $112k |
| `playtest-4-06-buy-wizard-1930-electric-default.png` | unusable engine pre-selected, lock hint |
| `playtest-4-07-heavy-engine-no-route.png` | B1: "No route to Vienna Mint" |
| `playtest-4-08-panic-banner.png` | "Railway mania crash: demand −28 %, credit tight, 14 mo left" (clear) |
| `playtest-4-09-insolvent-banner-under-toasts.png` | B2 |
| `playtest-4-10-game-over.png` | game-over card |
| `playtest-4-11-finance-one-tap-borrow.png` | Finance after one Borrow tap ($100k) |
| `playtest-4-12-old-phase38-save-loaded.png` | old save, loaded through the title screen |
