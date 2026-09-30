# Playtest 1

Play-tester report (no game code changed). Build at `origin/main` b7966d3 (Phase 26B/27 plan). 800×360 viewport, `?debug=1`, headless Chromium.
Driven through the real UI where practical (Track/Double/Bulldoze drags, Station tool, Buy-Train wizard, station Build tab, Goals/News/Finance panels); the debug API was used to fast-forward (`runDays`), to place stations/trains in bulk, and to read numbers.
Screenshots are in `docs/playtest-1/`.

> **Status: STAGE 1 — game 1 complete (Central Europe 1840, Normal, 29 years). Games 2 and 3 still to come.**

## Game logs

### Game 1 — Central Europe, 1840, Normal, played to mid-1869 (29 years)

| Year | Revenue | Operating cost | of which breakdown repairs | Net worth (year end, approx.) | What I did |
|---|---|---|---|---|---|
| 1840 | $61k | $25k | 0 | $0.93M | Trieste–Ljubljana (16 tiles, $47k), Trieste–Venice, Venice–Milan (60 tiles, $146k). 4 Norris 4-2-0. Cash $1.0M → $0.28M |
| 1841 | $95k | $45k | 6k | $0.82M | — |
| 1842 | $100k | $59k | — | — | grain farm → food plant → Venice chain (lost money), Graz spur |
| 1843 | $115k | $56k | — | $0.83M | Graz through the Alps: $153k for 15 tiles |
| 1844 | $122k | $97k | $23k | $0.69M | loan $200k, doubled Port–Venice ($30k) |
| 1845 | $150k | $97k | 25k | $0.68M | Post Offices |
| 1846 | $154k | $100k | — | $0.71M | — |
| 1847 | $166k | $84k | — | $0.68M | Milan–Turin (30 tiles, $100k), Turin stn supply 320 pax/mo |
| 1848 | $262k | $146k | **$55k** | $0.77M | American 4-4-0 (60 km/h, 6 cars). One American on Turin–Trieste earned **$101k** in its first year |
| 1849 | $293k | $142k | — | $0.86M | 2 more Americans |
| 1850 | **$41k** | $164k | — | $0.71M | **gridlock #1** (see Bugs) |
| 1851 | $260k | $120k | — | $0.78M | doubled Venice–Milan ($79k) |
| 1852 | $288k | $149k | $50k | $0.85M | — |
| 1853 | $301k | $147k | — | $0.93M | — |
| 1854 | $222k | $139k | — | $0.84M | Genoa branch ($95k) → **gridlock #2** |
| 1855–56 | $130k / $150k | $172k (1856) | — | $1.06M→0.96M | Vienna extension ($79k), 2 trains got `noRoute`, **gridlock #3** |
| 1858 | $393k | $147k | — | $1.19M | after fixing Graz |
| 1859 | $509k | $244k | — | $1.36M | more trains → **gridlock #4** (mid-1860) |
| 1861 | ~$550k | ~$300k | — | $1.56M | Terminals at Venice/Port/Milan/Turin |
| 1862 | $553k | $318k | **$144k** | — | Budapest station placed out of range, train earned $0 |
| 1863 | $424k | $298k | $170k+ | $1.8M | 4 trains frozen at Turin the whole year (see Bugs) |
| 1865 | $726k | $263k | — | $2.6M | 4 Moguls (9 cars) |
| 1866 | $977k | $312k | — | $3.2M | Munich line through the Alps: $650k for ~83 tiles |
| 1868 | $1.18M | $313k | — | $4.35M | goal "Munich–Milan" reached |
| 1869 (Jun) | — | — | — | $4.7M, cash $2.0M, loans $0 | 16 trains, 15 stations |

Time budget: ~1 real-time hour of my interaction time for 29 game years, almost all at 8× (the game itself would have taken ~3 h at 1×).

_(Games 2 and 3, verdict, economy, upgrades, cities, UX, bugs and the top 10 follow in the next stage.)_

## Bugs found so far (game 1)

See the full list in the final report. Highlights: recurring **permanent gridlock** between busy stations (mutual "wait for station"), **noRoute trains parked in a terminal cause gridlock**, **stations can be built at a 90° corner of a through-line and then block every train**, a **one-tile stub next to a terminal froze 4 trains for a year while their status read "moving"**, only the first station can have an **Engine Shed**, so repair call-outs cost 20–40 % of revenue.
