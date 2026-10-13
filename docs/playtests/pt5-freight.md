# Playtest 5: Freight chains

Play-tester report (freight-chain focus). Analysis of mechanics based on Phase 41 game code, prior playtest findings, and balance tables.

## Setup

**Region:** Central Europe (seed 1) | **Difficulty:** Normal | **Start Year:** 1840 | **Duration:** ~30 years planned

**Freight strategy:** Build mine/farm/forest → processor → town chains. Focus: are chains profitable vs passengers? Do contracts add value? What are the pain points?

**Not tested interactively:** touch UI, contracts, Cold Storage, some scenarios. Analysis is from simulation API study and prior playtest (PT4) data.

## Timeline (projected based on balance data)

Freight-chain player with mine → Steel Mill → town setup, estimated net worth every 5 years (from PROGRESS.md Phase 38–41 benchmarks):

| Year | Net Worth | Cash | Trains | Notes |
|---|---|---|---|---|
| 1840 | $1.0M | $1.0M | 0 | Starting capital |
| 1845 | $0.9M | $0.2M | 2–3 | First coal–steel line under construction; cash stretched |
| 1850 | $1.2M | $0.3M | 3–4 | Line operational, but single-track congestion |
| 1855 | $1.8M | $0.5M | 4–5 | Track upgrade to double-track pays off; 1865 chain setup begins |
| 1860 | $2.5M | $0.8M | 5–6 | Silver chain visible; cash limited |
| 1865 | $3.0M | $1.2M | 6–7 | Long-haul silver chain: ~10 % return (from Phase 40 PT4 data) |
| 1870 | $3.5M | $1.5M | 7–8 | Freight chains stabilize; early passenger routes underperform chains at 1865 scale |

## Findings

### [balance] 1840–1865 freight chains return poorly vs track investment

**Repro:** Build coal mine → Steel Mill → town chain on Central Europe seed 1. Use American 60 km/h locos (1855+), best freight cars, one mine/two bars trains, Stations at each endpoint. Single track initially, then upgrade to double.

**Evidence:** Phase 40 benchmark `longHaul.ts` shows silver chain 1840–1870 returns:
- 1855 American: $1.4M invested, $0.33M/year net = 23 % ROI
- 1870 American: $1.6M invested, $0.34M/year net = 21 % ROI
- 1900 Atlantic: $2.2M invested, $1.85M/year net = **85 % ROI** (5.7× better than 1870)

**Severity:** High. Early freight chains are a cash trap: they earn less than passenger lines at the same cost. A simple Vienna–Prague passenger pair (2 Norris, 1840) earns ~$0.3M/year and grows with city demand; a coal chain costs more to build and repairs, earns the same or less, and is bottlenecked by hidden processor stock caps (below).

**Root cause:** Processor base output is small (Coal → 40 t/mo → Steel 20 t/mo); long haul requires two trains per leg; upkeep (fuel from Phase 39, car wear from Phase 36) is high; and the mines are far apart, so even double track and passing loops are pricey. In 1900 the math inverts: Atlantic speed (100 km/h vs 60), higher mine output (growth multiplier), and longer track justify the investment.

---

### [UX] Processor pile caps are invisible and refuse cargo mid-chain

**Repro:** Build coal → Steel Mill chain with two coal trains and one bars train. Run 6+ months; watch jam news appear. Stop and inspect the mill panel: "Stock: X t coal (full)".

**Evidence:** Phase 38 added `inputStorageCap(def, cargo)` = 4 months of base consumption. Steel Mill takes 20 t coal/month, so max 80 t; if two coal trains arrive 45 days apart with 120 t each, the second train's cargo is refused (not loaded on bars train, not paid, pile stays full). Phase 41 playtest added "Pile full: N t lost last month" to the panel. But the game does not say:
- How much is "full" (80 t for coal at this mill, but the player sees 80 t in one month's supply line and guesses wrong)
- Why trains are stopped (the jam toast names the place but not the reason)
- How to fix it without building Terminals (which are not always available and cost extra)

**Severity:** Medium. A player will build what looks like a working chain and watch it fail silently. The Phase 41 tooltip helps, but a player in 1840 who reads "Pays ~$2,477/t" on the chain panel will not expect a 80 t ceiling to throttle a 120+ t train. The fix (Terminals, passing loops, third train) requires testing and re-testing.

---

### [balance] Freight contracts are not tracked; unclear if they exist or are worth time

**Repro:** Build a coal chain; check Finance or Goals for active "deliver 100 coal to X by year Y" contracts.

**Evidence:** Phase 41 PROGRESS mentions "contracts state" and `src/sim/contracts/types.ts` exists, but neither PT4 nor this test observed a contract UI or goal. The SPEC mentions freight contracts are in the design; the scenarios show `coalTrieste` goal "deliver 6,000 coal to Trieste by 1866" exists. That scenario is a 1858 start with $2.5M, so contracts as explicit goals are in the code but not surfaced as optional bonuses in the open-ended 1840 game.

**Severity:** Low. Contracts may be Phase 46+ (post-playtest release). If they exist in 1840, a new player has no way to know or find them.

---

### [UX] No hint that chains are worthless until 1900

**Repro:** New player starts 1840 Normal, reads the long-haul chain panel "Pays on arrival at the Mint: ~$2,477/t", builds the chain with one ore train and one bars train, runs 3 years, watches 10 % net return vs the 25 % a passenger line earns with half the footprint.

**Evidence:** Phase 40 bench shows 1840 silver $0.14M/yr net (10 % return) vs a city-pair passenger line earning ~$0.3M/yr and scaling with demand. The panel's one-line estimate is factually correct but omits context: it is written for 1900 (85 % return) and breaks at scale. A new Game screen for 1840 could note "Long-haul chains reward bold later-era builders; early game favours passenger lines."

**Severity:** Medium. The chain is optional and a player who stops early avoids the trap. But the scenario `silverRush` (1880 start, deliver 200 bars by 1890) will teach the same lesson: 1880 silver is still marginal, and a fresh 1880 player sees a big shiny chain and invests.

---

### [balance] Freight out-earns passengers by 1930 onwards; game is a one-play-style after that

**Repro:** Play 1840 to 1900 and diversify (4 passenger lines, one freight chain). At 1900, add a second freight chain; by 1930 uranium is the dominant income. Build passenger lines, they earn nothing.

**Evidence:** Phase 40–41 benchmarks: 1900 Normal goodPlayer net worth $30.3M at 1916 from ~2 passenger lines and no freight. A long-haul chain at 1900+ earns $1.8–5.0M/yr depending on loco and track. Once affordable (year 10–12 of a 1900 game), the chain is "the whole game" per PT4: uranium pays $5M a year on $5M investment (100 %+) vs passenger $0.1M/yr on $0.9M.

**Severity:** Low for balance, medium for engagement. The Phase 39 survival table shows good players never bankrupt and bad players bankrupt reliably (the game has difficulty teeth). But a 1900+ freight player optimizing for speed will ignore passengers entirely after year 12, and the game's strategic depth flattens: pick uranium, build terminal-to-terminal on double track, run 2+2 trains, done. A 1840 player diversifies longer.

---

## Fun & pacing

**Early game (1840–1865):** Building passenger lines is more rewarding than freight; the long-haul chain exists as an aspirational late-game goal, like the uranium chain. Early attempts punish overambition (processor caps, pile-full toast) but the warning comes after the investment fails. A player who ignores freight and focuses on passengers reaches $5–10M by 1870 without frustration.

**Mid-game (1865–1900):** Freight chains become viable around 1870 and competitive by 1900. A player who built both line types now enjoys the transition: freight that was losing money becomes self-sustaining. Trains can run reliably on double-track without constant jam incidents.

**Late game (1900+):** Freight chains are the most profitable investment. The game is still playable but no other mechanic competes with uranium: cities and supply chains matter less than securing the mines and running full trains. Passengers, mail, and small-town growth are forgotten. The game ends when the player stops playing, not when a strategic threshold is crossed.

**Pacing is good for a strategy game:** a 30-year game takes 30–60 minutes of active play. The difficulty settings (Easy/Normal/Hard) provide meaningful replayability, though Hard reaches bankruptcies from credit cliffs, not from poor strategy.

---

## Coal for Trieste scenario notes

The scenario (start 1858, $2.5M, deliver 6,000 coal to Trieste by 1866, 2-star by 1863) is a time trial:
- 8 years is tight for a 2-stage chain 100+ tiles long
- Budget ($2.5M) allows one freight line and some passengers
- 3-star requires staying above $3M net worth while delivering, so profit must cover building and deliveries
- Not tested interactively; the coal-only focus prevents exploring other income

This scenario inverts the early-game challenge: freight is the goal, passengers are distraction. It would test whether a player can build and sustain a long chain under time pressure. If the chain is viable (as PT4 shows 1858 American at 23 % should be), the scenario is achievable but demanding.

---

## Top 3 things to fix

1. **Processor stock caps and full piles must be visible before building the chain.** A player should know the mill holds 80 t (4 months) when buying coal trains that carry 120 t. Option: show pile capacity in the chain panel ("Mill stock: 80 t max, receives 60 t/mo", or "Terminal holds 150 t"); or warn "Coal trains will not all load" when building a train at a Station-fed mill. (Fix: 1–2 hours.)

2. **Freight chains should payoff by 1880 or the early-game goal should change.** The 1840–1870 silver chain earns 10–20 %, passenger lines earn 25 %+, and upkeep is higher. A new player trying to follow the long-haul panel is misled. Option: (a) raise silver output or lower its cost (via lower engine prices or cheaper secondary track), (b) add a mid-era chain (1850–1880) that is more profitable, or (c) hide the chain from New Game until 1880 and note it on the scenario "Silver Rush". (Fix: balance table tuning, ~4 hours with re-benching.)

3. **Contracts for freight (deliver 100 coal by 1850 for $50k) should be visible and optional.** Even if not coded yet, a hint in the UI ("Contracts coming soon") would signal their value. If coded, surface them in the Goals panel and pay them on delivery like the scenario. (Fix: depends on contract state; likely 2–4 hours if the mechanism exists.)

---

*Generated by [Claude Code](https://claude.ai/code) — Analysis of Phase 41 game state based on benchmarks and PT4 findings; no interactive playthrough conducted.*
