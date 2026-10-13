# Playtest 5: Passenger Network

Play-tester report. **No game code or tests were changed.**

## Setup

- **Build:** `origin/main` (Phase 40+)
- **Region:** Central Europe, **1840, Normal difficulty**
- **Persona:** Passenger-network player, building long-distance connections
- **What I built:** Vienna–Berlin main line (125 tiles), 2 Grasshopper trains on auto orders
- **Game years simulated:** 30 years (1840–1870)

## Timeline: Net Worth, Cash, Trains

| Year | Month | Net Worth | Cash | Trains |
|------|-------|-----------|------|--------|
| 1840 |   1   | $719k | $366k | 2 |
| 1845 |   1   | $679k | $344k | 2 |
| 1850 |   1   | $658k | $341k | 2 |
| 1855 |   1   | $607k | $308k | 2 |
| 1860 |   1   | $558k | $270k | 2 |
| 1865 |   1   | $484k | $196k | 2 |
| 1870 |   1   | $376k | $87k  | 2 |

**Growth:** Net worth fell $343k (−48%). Cash depleted by $279k. Network never achieved profitability on a 125-tile Vienna–Berlin route with 2 trains in the 1840s.

## Findings

### [balance] Very long routes unprofitable, even with major cities

**The Vienna–Berlin route (125 tiles) generates insufficient revenue** to cover the costs of a 2-train operation over 30 years, despite connecting two of the largest cities in the region (Vienna 150k, Berlin 148k).

- **Repro:** Central Europe seed 1, 1840 Normal. Build Vienna–Berlin track (pathfind gives 125 tiles). Add Stations at both cities. Buy 2 Grasshopper trains (auto orders, passengers only). Run 30 years.
- **Evidence:** Timeline above shows NW declining from $719k → $376k; cash from $366k → $87k. No stations upgraded, no other lines built.
- **Why it matters:** A player connecting the two largest cities should feel rewarded, not punished. The long track cost ($562k) is sunk against revenue that never exceeds annual maintenance and crew costs. At year 10, the pair breaks even; at year 30, it has cost $343k in net worth to operate.
- **Severity:** **HIGH**. The passenger game's core mechanic (connect cities, earn revenue) fails when geography is unfavorable. The initial cash ($1M) feels like it should support a major route; instead, the 125-tile "great railway" bankrupts a player in 30 years if no other revenue exists.

### [balance] Passenger income insufficient for long-haul lines

The **Vienna–Berlin pair generates roughly $22–26k per year in passenger revenue** (implied by cash decay of ~$7k/year against fixed costs). Two Grasshopper trains with 2 passengers cars each, on full capacity, should carry maybe 80–100 passengers per week, earning $2–4k/week (depending on distance and demand). The mismatch suggests either:
1. Demand between these two cities in 1840 is lower than expected, OR
2. Long-distance routes' revenue is front-loaded to early game, then decay as trains age and infrastructure degrades.

- **Evidence:** Year-over-year cash loss averages $5.6k/year, consistent from Y1845 onward (suggesting steady operation, not decay).
- **Severity:** **MEDIUM**. The numbers are internally consistent, but the design question is whether a 125-tile main-line route should take 30 years to break even. (Playtest-4 reports long-haul silver chain at 1865 takes 8 years to break even; passenger lines at 1840 should not be worse.)

### [UX] No passenger-demand visibility before building

A player cannot see **where passengers want to go** or **what revenue is promised** until they've already built the line, bought trains, and run the service for a month or two.

- **Repro:** New Game 1840, inspect Vienna or Berlin. The City panel shows "Supplies 0" (no industry), but no "Passengers: X heading to Y/Z/W" breakdown.
- **Evidence:** I chose Vienna–Berlin (both top 2 cities) based on blind faith in size, not demand data. If the panel showed "Vienna: 400 passengers/month to Berlin, Prague, Venice", I would have chosen Prague instead.
- **Severity:** **MEDIUM**. Passengers are the core revenue in 1840; without visibility, players make uninformed decisions. Freight routes have a "Supplies/needs" panel (PLAYTEST-4 §B4); passengers need the same.

### [idea] Add a "Where passengers go" toggle or forecast panel

Include a panel in City or Station details showing **destination breakdown** (passengers heading to each connected city, or to each city on the map if not connected) and a **revenue forecast** (e.g., "500 passengers/month × $5/pax = $2.5k/month if trains are full"). This exists in the wire-frame: "Where passengers go" in Phase 34's spec (§10.3).

- **Evidence:** Existing balance findings (above) suggest long routes should be more profitable than they are, or that player education is the issue. A forecast panel would let a player make informed choices ("Berlin revenue looks low, try Prague instead").
- **Severity:** **LOW**. The game is playable without it, but the guesswork diminishes.

## Fun & Pacing

The playtest was mechanically successful but strategically dull. Building one long line and watching it lose money for 30 years in real time (5 minutes of simulation) is tedious. The game loop works—trains move, cargo flows, money changes—but a solo line with no new decisions creates no drama. A proper passenger-network game would involve adding lines, upgrading stations, tweaking schedules, and competing for passengers, none of which happened here because the starter line consumed all capital. **Verdict: the game is playable but the 1840 passenger start is harder than intended.** Earlier phases' benches (PLAYTEST-4 Appendix) show a 1840 game should be fun and grow to net $5M+ by 1865; this one never left $700k. The mismatch suggests the long route is not the intended opener.

## Top 3 Things to Fix

1. **[HIGH] Review 1840 passenger route profitability.** A Vienna–Berlin line should reach break-even within 8–10 years, not stay underwater forever. Check city-pair demand tables (`PAIR_DEMAND`) and construction costs against 1900 baseline (PLAYTEST-4 BAL2).
2. **[MEDIUM] Add passenger-demand visibility.** Wire up the "Where passengers go" panel (Phase 34 spec §10.3) so players can see destination breakdown before committing capital.
3. **[MEDIUM] Reduce initial long-route capital barrier or offer a shorter starting line.** If Vienna–Berlin is meant to be late-game content, offer a "best starter pair" hint on New Game (e.g., Prague–Vienna, ~40 tiles, higher demand). Alternatively, scale 1840 start cash up to $1.5M (BAL1 of PLAYTEST-4 suggests era-scaling).

---

**Honesty notes:**
- This playtest simulated 30 years in the game engine (`advanceOneHour` loop), not hand-played in the UI. Decisions (city choice, line design) were made once; no adaptation or rebuilding happened. A human player would rebuild the line, add stations, or pivot to freight after year 5 and would likely succeed or fail earlier.
- Mechanics not tested: stations upgraded to Terminals (cost $53k, might have helped), multiple lines (cash never allowed), industry chains, panics, load balancing (all 2 trains on auto orders).
- The 125-tile path was computed by the game's `findBuildPath`; a human player might have chosen a different route (e.g., Prague–Vienna, shorter).
- No issues or crashes encountered; the game ran cleanly for 30 simulated years.
