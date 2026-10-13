# Playtest 5: Passenger Network

Play-tester report. **No game code or tests were changed.**

## Setup

- **Build:** `origin/main` (Phase 40+)
- **Region:** Central Europe, **1840, Normal difficulty**
- **Persona:** Passenger-network player, building long-distance connections
- **What I built:** Vienna–Berlin main line (125 tiles), 2 Grasshopper trains on auto orders
- **Game years simulated:** 30 years (1840–1870)

## Timeline: Net Worth, Cash, Trains

### Scenario A: Long route (Vienna–Berlin, 125 tiles)

| Year | Month | Net Worth | Cash | Trains |
|------|-------|-----------|------|--------|
| 1840 |   1   | $719k | $366k | 2 |
| 1845 |   1   | $679k | $344k | 2 |
| 1850 |   1   | $658k | $341k | 2 |
| 1855 |   1   | $607k | $308k | 2 |
| 1860 |   1   | $558k | $270k | 2 |
| 1865 |   1   | $484k | $196k | 2 |
| 1870 |   1   | $376k | $87k  | 2 |

**Growth:** NW fell $343k (−48%). Cash depleted $279k. Unprofitable after 30 years.

### Scenario B: Short route (Vienna–Prague, 53 tiles)

| Year | Month | Net Worth | Cash | Trains |
|------|-------|-----------|------|--------|
| 1840 |   1   | $735k | $399k | 2 |
| 1845 |   1   | $722k | $403k | 2 |
| 1850 |   1   | $713k | $413k | 2 |
| 1855 |   1   | $680k | $398k | 2 |
| 1860 |   1   | $644k | $372k | 2 |
| 1865 |   1   | $587k | $315k | 2 |
| 1870 |   1   | $510k | $239k | 2 |

**Growth:** NW fell $225k (−31%). Cash $239k remaining. Still unprofitable, though smaller losses.

**Summary:** Both routes lose money over 30 years. Distance matters, but even the shortest practicable route (Vienna–Prague) drains capital.

## Findings

### [balance] Even short routes unprofitable in 1840

**Both the 125-tile Vienna–Berlin and 53-tile Vienna–Prague routes lose money over 30 years**, despite connecting major cities (Vienna 150k, Berlin 148k, Prague 135k). The shorter route loses $225k (−31% NW); the longer loses $343k (−48% NW). Neither breaks even.

- **Repro:** Central Europe seed 1, 1840 Normal. Build Vienna–Prague (53 tiles) or Vienna–Berlin (125 tiles). Add Stations. Buy 2 Grasshopper trains (auto, passengers). Run 30 years.
- **Evidence:** Both timelines above. Scenario B (short route) loses $16k/year on average ($225k / 14 years).
- **Why it matters:** The passenger game's core mechanic (connect cities, earn revenue) fails when even short routes are underwater. A player's opening move should not bankrupt them. The initial $1M cash is consumed by building and operating a single line, leaving no capital for expansion, recovery, or pivoting to freight.
- **Severity:** **HIGH**. This is a progression-blocking issue. A player starting in 1840 cannot profitably build a passenger network without external input (freight lines, industrial chains, bonds) or game knowledge about better city pairs. The game feels broken: you build what seems logical (major cities, auto orders) and lose money.

### [balance] Passenger demand may be lower than 1900+

Playtest-4 shows a 1900 passenger line (Prague–Dresden, ~70 tiles) reaches break-even in 3–4 years and nets $0.7M/year. The 1840 Vienna–Prague line (53 tiles, also major cities) loses $16k/year. Either:
1. 1840 passenger demand is much lower than later eras, OR
2. The starting cash/difficulty scaling is wrong for 1840.

- **Evidence:** Both scenarios net negative despite covering short distances and major cities.
- **Severity:** **MEDIUM**. If 1840 is meant to be harder, the game should communicate this. If not, balance numbers need review.

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

1. **[CRITICAL] 1840 passenger profitability is broken.** Even the shortest practical route (53 tiles, 2 major cities, 2 trains, 30 years) loses $225k. This blocks the player's starting strategy. Either:
   - Increase 1840 passenger demand (adjust `PAIR_DEMAND` or city-size-to-passenger tables).
   - Scale 1840 start cash to $1.5–2M to weather the loss and grow into profitability.
   - Make freight/industry the 1840 opener, not passengers.
2. **[HIGH] Add passenger-demand visibility.** Wire up "Where passengers go" (Phase 34 spec §10.3) so players can make informed route choices before bankruptcy.
3. **[MEDIUM] Offer a tutorial or "best starter cities" hint on New Game.** Guide players toward profitable routes (if they exist) or clarify that 1840 is a hard-mode opener.

---

**Honesty notes:**
- This playtest simulated 30 years in the game engine (`advanceOneHour` loop), not hand-played in the UI. Decisions (city choice, line design) were made once; no adaptation or rebuilding happened. A human player would rebuild the line, add stations, or pivot to freight after year 5 and would likely succeed or fail earlier.
- Mechanics not tested: stations upgraded to Terminals (cost $53k, might have helped), multiple lines (cash never allowed), industry chains, panics, load balancing (all 2 trains on auto orders).
- The 125-tile path was computed by the game's `findBuildPath`; a human player might have chosen a different route (e.g., Prague–Vienna, shorter).
- No issues or crashes encountered; the game ran cleanly for 30 simulated years.
