# Railroads — Game Design Specification

A 2D top-down railway-building tycoon game for Android, inspired by *Sid Meier's Railroad Tycoon Deluxe*.
**No competitors, no stock market.** The player builds track to cities and resources, runs trains,
earns money from deliveries, and upgrades stations, cities' service, and rolling stock as the eras
progress from steam to diesel to electric.

This document is the source of truth for *what* the game does. `docs/PLAN.md` says *in what order*
to build it. If an implementer must deviate, record the deviation in the "Deviations" section at the
bottom of this file with a one-line reason.

---

## 1. Platform & technology (fixed decisions)

| Concern | Decision |
|---|---|
| Language | TypeScript, `strict: true` |
| Bundler / dev server | Vite |
| Rendering | HTML5 Canvas 2D (no WebGL, no game engine) |
| UI (menus, panels, dialogs) | Plain DOM + CSS overlaid on the canvas. No React/Vue. Small helper `h(tag, props, ...children)` is fine. |
| Android packaging | Capacitor (Android platform), landscape-locked |
| Unit tests | Vitest (simulation code must be testable without a DOM) |
| E2E / visual checks | Playwright against the Vite dev/preview server, using Chromium at `/opt/pw-browsers` |
| Persistence | IndexedDB (via a tiny wrapper) for saves; `localStorage` only for settings |
| Assets | **All graphics drawn procedurally in code** and cached into offscreen canvases. No sprite sheets or external images except the app icon. No external fonts required (use system sans-serif). |
| Sound | Optional, Phase 11 only, generated with WebAudio (no audio files) |
| Randomness | One seeded PRNG (e.g. mulberry32/sfc32) stored in the game state. Never `Math.random()` in simulation code. |

### Code layout

```
src/
  main.ts              bootstraps app, screens
  sim/                 PURE simulation: no DOM, no canvas, deterministic
    state.ts           GameState type + factory
    map/               terrain, generation, real-map loading
    track/             track graph, building, costs, pathfinding, blocks
    stations/
    trains/
    economy/           cargo, industries, cities, finance
    time.ts            calendar, tick
    rng.ts
    commands.ts        all player actions go through here (see §12)
  render/              canvas drawing only; reads state, never mutates it
  ui/                  DOM panels, toolbars, dialogs, input handling
  data/                JSON/TS tables: locomotives, cargo, industries, regions
  save/                serialization, migrations
tools/mapgen/          Node scripts that generate real-world map JSON (run offline, output committed)
tests/                 vitest unit tests (mirrors src/sim)
e2e/                   playwright tests
android/               Capacitor-generated project
```

Rule: `src/sim` must never import from `render` or `ui`. Rendering and UI read state and issue
**commands** (§12); they never mutate state directly.

---

## 2. Core loop

1. Pick a map (real region or random) and start year.
2. Lay track between cities and industries; bridges and hills cost more.
3. Build stations; their catchment area determines what cargo they supply and accept.
4. Buy locomotives, choose cars, set orders (stations to visit, what to load).
5. Trains earn revenue on delivery based on cargo, distance, and speed.
6. Reinvest: double track, better stations, station improvements, newer locomotives,
   electrification, more routes. Well-served cities grow and demand more.
7. Time advances; new locomotive technologies unlock (steam → diesel → electric).

The game is open-ended (sandbox). Each scenario may also have optional **goals** (§11) that give a
medal rating; the game continues after a goal is reached or missed.

---

## 3. Time

- Calendar: one simulation **tick = 1 in-game hour**. Days/months/years derived from ticks.
- Game speeds: Pause, 1× (1 in-game day ≈ 1.0 s real), 2×, 4×, 8×.
- Simulation runs on a fixed timestep independent of frame rate. At high speeds, run multiple ticks
  per frame (cap ticks per frame so the UI stays responsive; drop to fewer if frame time > 12 ms).
- Periodic processing:
  - Every tick: train movement, loading/unloading progress.
  - Daily: industry production accrues to stations, cargo waiting ages.
  - Monthly: maintenance and interest charged, city growth evaluation, industry changes, autosave.
  - Yearly: annual financial report dialog (dismissable), new technology announcements.
- Start year chosen per scenario (1830–1950). No end year; the game continues indefinitely
  (the locomotive table ends in the 1990s; the last models just remain available).

---

## 4. Map

### 4.1 Grid

- Square tile grid. Sizes: Small 96×64, Medium 128×96, Large 192×128. Real-world maps use their own size (≤ 192×144).
- Each tile has:
  - `terrain`: `plain | forest | hills | mountain | desert | swamp | water | river`
    - `water` = sea/lake, not buildable except by long bridge (§5.3).
    - `river` tiles are land tiles that have a river flowing through them; track needs a bridge.
  - `elevation`: integer 0–9 (0 = sea level). Used for grade (§7.4) and hillshading.
  - optional `cityId`, `industryId`.
- Tile size at zoom 1 = 32 px. Zoom range 0.25×–2× (smooth pinch zoom). At zoom < 0.5 render a
  simplified "overview" style (no per-tile detail, cities as dots with names, track as lines).

### 4.2 Random map generator

Inputs: seed, size, water level (low/normal/high), terrain roughness (flat/normal/mountainous),
city count (few/normal/many), resource density (low/normal/high), start year.

Algorithm (deterministic from seed):
1. Elevation: fractal value/simplex noise (4–5 octaves) + a gentle continental falloff so edges tend
   toward water when water level ≥ normal. Quantize to 0–9 after choosing a sea-level threshold that
   hits the target land fraction (low 85%, normal 70%, high 55%).
2. Terrain from elevation + a second moisture noise: high → mountain, mid-high → hills, wet → forest or
   swamp (low + wet), dry → desert (rare, only if moisture very low), else plain.
3. Rivers: 4–12 sources at high elevation; follow steepest descent to water, carving through local
   minima (lake if stuck > N steps). Mark tiles as `river`.
4. Cities: place by score (flat, near river/coast, spaced ≥ 8 tiles apart). Initial sizes: mostly villages,
   a few towns, 1–2 cities. Names from a generated list (combine syllable tables; avoid duplicates).
5. Industries: place raw producers by terrain affinity (§8.2), then processors near cities.
6. Ensure playability: at least 3 pairs of towns/cities within 15–30 tiles of each other over land.

### 4.3 Real-world regions

Shipped regions (each is a JSON file in `src/data/regions/`, generated by `tools/mapgen`):

| Id | Name | Bounds (lon, lat) | Default start | Notes |
|---|---|---|---|---|
| `us-east` | Eastern United States | −92…−68, 29…46 | 1830 | NY, Philadelphia, Boston, Baltimore, Washington, Pittsburgh, Buffalo, Cleveland, Detroit, Chicago, Cincinnati, Louisville, St. Louis, Richmond, Charleston, Savannah, Atlanta, Albany, Montreal, Toronto, Nashville, Memphis, Norfolk, Columbus, Indianapolis (~25 cities) |
| `gb` | Great Britain | −6.5…2, 50…56.5 | 1830 | London, Birmingham, Manchester, Liverpool, Leeds, Sheffield, Bristol, Newcastle, Glasgow, Edinburgh, Cardiff, Plymouth, Southampton, Norwich, Nottingham, York, Hull, Carlisle, Aberdeen*(may be off map)… |
| `central-eu` | Central Europe & the Alps | 5…20, 44…54 | 1840 | Berlin, Hamburg, Munich, Frankfurt, Cologne, Vienna, Prague, Zurich, Milan, Venice, Trieste, Ljubljana, Budapest, Leipzig, Dresden, Stuttgart, Nuremberg, Salzburg, Innsbruck, Graz, Turin, Genoa, Strasbourg, Basel, Zagreb |
| `us-west` | American West | −125…−104, 32…49 | 1860 | San Francisco, Sacramento, Los Angeles, San Diego, Portland, Seattle, Salt Lake City, Denver, Reno, Phoenix, Tucson, Santa Fe, Albuquerque, Boise, Cheyenne, Spokane |

Real maps must be recognizable (coastlines, big lakes, major rivers, mountain ranges, real city
positions and relative sizes for the start year) but are allowed to be stylized.

**Map generation pipeline (`tools/mapgen`, Node + TypeScript, run manually, output committed):**
1. Region definition file `tools/mapgen/regions/<id>.ts` containing: bounds, grid size, start year,
   city list (name, lat, lon, start size tier, optional founding year), mountain ranges as polylines
   or polygons with peak elevation (e.g. Appalachians 5, Alps 9, Rockies 9, Sierra Nevada 8,
   Pennines 3, Scottish Highlands 5), resource hint zones (e.g. Pennsylvania coal, Mesabi iron,
   Midwest grain, Texas/Pennsylvania oil after 1860s, Ruhr coal, Silesia coal, Styria iron, Welsh coal).
2. Land/water: rasterize Natural Earth 1:50m land, lakes and rivers GeoJSON
   (fetch from `https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_land.geojson`,
   `ne_50m_lakes.geojson`, `ne_50m_rivers_lake_centerlines.geojson`; cache under `tools/mapgen/.cache/`, gitignored).
   Projection: equirectangular with x scaled by cos(center latitude).
   **Fallback** if the network is blocked: hand-author simplified coastline polygons in the region file.
3. Elevation: base low-amplitude noise on land + distance-weighted contribution of mountain features,
   rivers pull elevation down along their course. Terrain derived as in the random generator, with
   region-specific moisture hints (e.g. desert in the US southwest).
4. Place industries using the resource hint zones plus terrain affinity; seeded, deterministic.
5. Emit `src/data/regions/<id>.json` (compact: run-length or base64-packed tile arrays). Target < 300 KB each.

### 4.4 New game screen

Tabs: **Real World** (card per region, with a small preview thumbnail rendered from the map data,
default start year, difficulty hint) and **Random** (seed field with 🎲 button, size, water level,
roughness, cities, resources, start year 1830/1850/1870/1900/1930/1950). Common options:
difficulty (Easy/Normal/Hard, §9.6), starting cash shown.

---

## 5. Track

### 5.1 Track model

- Track connects **tile centers** of adjacent tiles in 8 directions (N, NE, E, SE, S, SW, W, NW).
  Each connection is an **edge** in the track graph; tiles with any track are **nodes**.
- Edge properties: `double: boolean`, `electrified: boolean`, `bridge?: 'wood' | 'stone' | 'steel'`.
- Turn constraint: a train may pass through a node from edge A to edge B only if the direction
  change is ≤ 45°. Sharper geometry is allowed to exist but is not traversable as a through route
  (shown with a small red marker in the build preview). 90°+ turns are only possible at stations
  (trains may reverse at stations).
- A tile may carry multiple edges (junctions/crossings). A diagonal X-crossing of two diagonals on the
  same 2×2 block is allowed (they don't share a node).

### 5.2 Building UX (touch-first)

Build toolbar modes: **Track**, **Double**, **Electrify** (era-gated), **Station**, **Bulldoze**, **Info**.

- **Track mode**: touch-and-drag from any tile. The path follows the finger, snapped to the 8
  directions (use A* on the grid between the drag start and current tile, preferring straight lines
  and cheaper terrain, with a penalty for direction changes; this makes dragging on a phone feel good).
  While dragging, show a ghost path with color: green (buildable), red (blocked/unaffordable), and a
  floating label with the **total cost**. Releasing shows a confirm bar: **✓ Build ($X)** / **✕**.
  With "Quick build" setting on, releasing builds immediately.
- **Double mode**: drag along existing single track to upgrade; cost preview as above.
- **Electrify mode**: drag along existing track (single or double).
- **Bulldoze**: drag over track/station; refunds 25% of build cost. Cannot remove track under a train.
- Pan with one finger when not in a build mode; in a build mode, pan with two fingers.
  Pinch zooms in all modes. Desktop: left-drag builds, right/middle-drag pans, wheel zooms.

### 5.3 Costs (in dollars; UI shows `$12k`, `$1.2M`)

Per edge, base cost × terrain multiplier (use the more expensive of the two tiles) × diagonal factor
(1.41 for diagonal edges) × era inflation (§9.5).

| Item | Cost |
|---|---|
| Base single track, plain | $4,000 per tile |
| Terrain multipliers | plain 1.0, desert 1.2, forest 1.5 (clearing), swamp 2.0, hills 2.0, mountain 4.0 |
| Grade surcharge | +$2,000 × \|Δelevation\| per edge |
| Double track | 1.6 × the single-track cost of that edge (upgrade cost = 0.6× if single exists) |
| Electrification (from 1905) | $6,000 per edge (+50% on double track) |
| River bridge (single-tile river crossing) | wood $20k (all eras), stone $45k (from 1840), steel $80k (from 1870) |
| Water bridge (over `water` tiles) | per water tile: wood — not allowed; stone $60k (max 3 tiles); steel $110k (max 8 tiles, from 1870) |
| Tunnel | Not in scope for v1 (listed in §14 as a later option) |

Bridges:
- When a path crosses river/water, the build preview auto-picks the cheapest valid bridge type and
  the confirm bar lets the user tap to cycle types.
- **Wooden bridges**: max locomotive weight class "medium" (heavy locos can't route over them — the
  pathfinder treats them as impassable for that train), and a 1%/year per bridge chance of washout
  in a flood event (bridge destroyed, news message, trains reroute or wait). Stone/steel never wash out.
- Double track over a bridge costs 1.8× the bridge.
- Bridges are drawn distinctively (wood trestle brown, stone arches grey, steel truss dark blue-grey).

### 5.4 Maintenance

Monthly: $10 per edge single, $16 double, +$5 electrified. Bridges: +$50 wood, +$30 stone, +$40 steel.
(Scale by era inflation.)

---

## 6. Stations

### 6.1 Types

| Type | Catchment radius | Footprint | Max train length (cars) | Storage per cargo | Cost | Monthly maint. |
|---|---|---|---|---|---|---|
| Depot | 1 (3×3) | 1 tile | 6 | 40 units | $15k | $100 |
| Station | 2 (5×5) | 1 tile | 10 | 80 | $40k | $250 |
| Terminal | 3 (7×7) | 1 tile | 16 | 150 | $100k | $600 |

- Placed on a tile with existing track (straight or diagonal through-track or a dead-end). Stations
  may be placed in Station mode by tapping a track tile; the catchment overlay is shown while choosing
  (tiles tinted; supplied cargo icons and accepted cargo icons listed in a preview panel).
- Upgrade in place: Depot → Station → Terminal, paying the difference.
- Trains longer than the station max can still stop but load/unload 50% slower.
- Station name defaults to the nearest city name (with "Junction", "Mine", "Crossing" etc. suffixes
  when not in a city, e.g. "Harlow Coal Mine").
- Catchments of two stations may overlap; overlapping supply is split evenly between them.

### 6.2 Station improvements (buildable once per station)

| Improvement | Available | Cost | Effect |
|---|---|---|---|
| Engine Shed | always | $30k | Trains whose orders include this station get periodic servicing: breakdown chance −50%. New trains can only be bought at a station with an Engine Shed (the first station built gets a free one). |
| Water Tower | steam era | $8k | Steam locomotives stopping here are refilled; steam trains that go > 40 tiles without a Water Tower stop lose 20% speed until next refill. (Diesel/electric ignore.) |
| Post Office | always | $25k | Mail supply +50%, mail revenue +25% for mail loaded here. |
| Hotel | always | $50k | Passenger revenue +25% for passengers delivered here; +20% city growth contribution. |
| Warehouse | always | $30k | Storage ×2; waiting cargo doesn't decay. |
| Cold Storage | 1880 | $40k | Food and livestock waiting here don't decay; their revenue +15% when loaded here. |
| Freight Yard | 1870 | $60k | Loading/unloading 2× faster. |
| Livestock Pens | always | $12k | Required to *load* livestock at this station. |

### 6.3 Supply and demand

- **Supply**: every day, each producer inside the catchment adds its daily output to the station's
  waiting pile for that cargo (split if multiple stations cover it). Cities supply passengers and mail
  proportional to the population inside the catchment. Waiting cargo is capped at storage;
  cargo older than 30 days (passengers 10 days, mail 15) starts to decay 5%/day unless a Warehouse/Cold Storage applies.
- **Demand/acceptance**: a station accepts cargo *c* if the sum of acceptance points for *c* of tiles
  in its catchment ≥ 8 (like RRT). City tiles and processor industries provide acceptance points
  (§8). The station panel lists "Supplies" and "Accepts".
- Cargo delivered to a station that doesn't accept it is **not unloaded** (stays on train, warning shown once).

---

## 7. Trains

### 7.1 Composition

- A train = 1 locomotive (optionally 2 = double-heading, from 1850, doubles power and cost/maint)
  + up to N cars, where N ≤ locomotive max cars.
- Car types: Passenger, Mail, Coal, Ore, Grain (hopper), Livestock, Boxcar (goods, food, lumber, steel),
  Tanker (oil, fuel), Flatcar (steel, lumber) — see cargo table §8.1 for which car carries what.
  Car cost $2k–$6k each (see cargo table), bought with the train.
- Each car carries 1 "carload" = 20 units of its cargo (passengers: 40 people per car = 1 carload).

### 7.2 Orders

- Orders: an ordered list of 2–8 stations, looping.
- Per stop: loading rule — **Auto** (unload what's accepted, then load any cargo the cars can carry
  that is supplied here and accepted at some later stop in the list), **Wait for full load** (with
  optional max wait days), **Unload only**, **Pass through** (non-stop).
- Per stop "consist change" (optional, v1.1): skip in v1.
- Train priority: Normal / Express (express trains get block reservations first when waiting).

### 7.3 Movement & routing

- Trains move along the track graph node-to-node with continuous position (fraction along edge).
- Route: A* over the track graph from current position to the next order station, respecting the
  45° turn rule, wooden-bridge weight limits, and electrification (electric locos only on electrified
  edges). If no route exists: train stops, shows a ⚠ icon, news message "Train 7 has no route to X".
- Reversing is only possible at stations (and at dead ends: a train that reaches a dead end that isn't
  its target reverses after a 6-hour delay — this is mainly for recovery).
- Recompute route when track changes on or near the current path.

### 7.4 Speed model

Each locomotive has `maxSpeed` (km/h), `power` (abstract units), `weight class` (light/medium/heavy).
Each carload weighs 1 unit when loaded, 0.4 empty; locomotive itself 2 units.

```
load        = locoWeight + Σ car weights
grade       = max(0, Δelevation along current edge)          // uphill only; downhill no penalty
effort      = load × (1 + 0.6 × grade)
speedFactor = clamp(power / effort, 0.15, 1.0)
targetSpeed = maxSpeed × speedFactor × conditionFactor
```

- Accelerate/decelerate at simple constant rates (reach max in ~1 in-game hour; decelerate before
  stations and occupied blocks so trains stop smoothly).
- Curve penalty: max 70% of maxSpeed through a 45° turn node.
- Double track doesn't increase speed but eliminates head-on waits (§7.5).
- Display speeds in km/h or mph (setting).

Movement scale: 1 tile = 10 km for revenue/distance display. Movement per tick = speed (km/h) × 1 h / 10 km per tile.

### 7.5 Blocks & signaling (single vs. double track)

Keep it simple and deadlock-resistant:

- The track graph is partitioned into **blocks**: maximal chains of edges between "block boundaries".
  Boundaries are: stations, junction nodes (degree ≥ 3), and dead ends. (Recompute blocks when track changes.)
- **Single-track block**: at most one train at a time in *either direction*. A train must reserve the
  whole next block before leaving a boundary; otherwise it waits at the boundary.
- **Double-track block**: one lane per direction; multiple trains may follow in the same direction
  with a minimum spacing of 2 tiles; opposing trains never conflict.
- **Stations** hold up to 2 trains at once (Depot 1, Station 2, Terminal 4) — a train waiting to enter
  a full station waits in the preceding block. This is what makes stations act as passing loops on
  single-track lines.
- Mixed: a block counts as double only if *every* edge in it is double.
- **Deadlock handling**: if a train has waited > 5 in-game days, it tries an alternate route
  (A* with the blocking block penalized). If still stuck after 10 days, show ⚠ and news message
  "Traffic jam near X — consider double track or more stations". No teleporting.
- Waiting trains render with a small red signal icon.

### 7.6 Breakdowns & aging

- Each locomotive model has `reliability` 1–5. Monthly breakdown chance = base (0.5%, 1%, 2%, 4%, 7%
  for reliability 5…1) × (1 + age/20 years) × (0.5 if serviced at an Engine Shed in the last 60 days).
- Breakdown: train stops for 2–5 days, repair cost $5k (era-scaled).
- Obsolescence: once a model is > 25 years past introduction, maintenance +50%. Steam maintenance
  +50% after 1955, and steam models can't be bought after 1960.
- **Replace locomotive** action on a train: pay new loco price minus 30% trade-in of the old loco's
  price (reduced by 3% per year of age, min 10%), keep cars and orders.

### 7.7 Locomotive roster

Names are generic (wheel arrangements / descriptive), not trademarks. `weight`: L/M/H.
Costs and maintenance in $ at introduction year (era inflation applies to later purchases; see §9.5).

| Model | Type | Intro | Max km/h | Power | Max cars | Weight | Reliab. | Cost | Maint./yr |
|---|---|---|---|---|---|---|---|---|---|
| Grasshopper 0-4-0 | Steam | 1830 | 25 | 2 | 3 | L | 2 | $20k | $2k |
| Planet 2-2-0 | Steam | 1832 | 35 | 3 | 4 | L | 2 | $28k | $2.5k |
| Norris 4-2-0 | Steam | 1838 | 45 | 4 | 5 | L | 3 | $34k | $3k |
| American 4-4-0 | Steam | 1848 | 60 | 6 | 6 | M | 3 | $45k | $4k |
| Mogul 2-6-0 | Steam | 1862 | 55 | 9 | 9 | M | 3 | $55k | $5k |
| Consolidation 2-8-0 | Steam | 1872 | 50 | 12 | 12 | H | 3 | $70k | $6k |
| Ten-Wheeler 4-6-0 | Steam | 1880 | 75 | 9 | 8 | M | 4 | $70k | $6k |
| Atlantic 4-4-2 | Steam | 1895 | 100 | 8 | 6 | M | 4 | $85k | $7k |
| Pacific 4-6-2 | Steam | 1905 | 115 | 11 | 9 | H | 4 | $110k | $9k |
| Mikado 2-8-2 | Steam | 1912 | 75 | 16 | 14 | H | 4 | $120k | $10k |
| Hudson 4-6-4 | Steam | 1927 | 135 | 14 | 10 | H | 4 | $150k | $12k |
| Articulated 4-8-8-4 | Steam | 1941 | 95 | 26 | 22 | H | 3 | $250k | $22k |
| Early Electric | Electric | 1905 | 90 | 12 | 9 | M | 3 | $120k | $6k |
| Streamliner Diesel | Diesel | 1934 | 145 | 12 | 8 | M | 3 | $180k | $12k |
| E-Unit Electric | Electric | 1928 | 160 | 18 | 12 | H | 4 | $200k | $10k |
| Cab Unit Diesel | Diesel | 1939 | 120 | 16 | 14 | M | 4 | $170k | $11k |
| Road Switcher Diesel | Diesel | 1949 | 105 | 19 | 16 | M | 5 | $160k | $9k |
| Modern Electric | Electric | 1960 | 180 | 24 | 16 | H | 5 | $300k | $12k |
| High-Horsepower Diesel | Diesel | 1963 | 125 | 26 | 20 | H | 5 | $280k | $15k |
| Heavy Diesel | Diesel | 1976 | 130 | 32 | 24 | H | 5 | $350k | $17k |
| High-Speed Trainset | Electric | 1981 | 270 | 16 | 10 | M | 5 | $600k | $25k |
| Heavy Freight Electric | Electric | 1994 | 140 | 40 | 28 | H | 5 | $500k | $20k |

- High-Speed Trainset: passenger & mail cars only.
- Electric: requires every edge of its route to be electrified; ~40% cheaper maintenance than diesel
  of the same era (already reflected), no water towers needed.
- Diesel: no water towers needed, higher reliability.
- When a new model becomes available: news message + card in the yearly report, "New!" badge in the buy dialog.
- Locomotives are drawn procedurally: steam = dark body + boiler + chimney (animated smoke puffs),
  diesel = colored hood unit, electric = boxy body + pantograph when on screen at zoom ≥ 1.

---

## 8. Cargo, industries, cities

### 8.1 Cargo types

`base` = revenue per carload per 10 tiles (100 km) at era-1830 prices for an on-time delivery.
`decayDays` = expected transit days before revenue starts falling (fast cargo decays sooner).

| Cargo | Car | Car cost | Base rate | decayDays | Color | Notes |
|---|---|---|---|---|---|---|
| Passengers | Passenger | $4k | $3,000 | 3 | white | two-way from cities |
| Mail | Mail | $4k | $4,000 | 2 | red | two-way from cities |
| Coal | Coal hopper | $2k | $1,200 | 30 | black | |
| Iron Ore | Ore hopper | $2k | $1,100 | 30 | rust | |
| Wood | Flatcar | $2k | $1,000 | 30 | brown | logs |
| Grain | Grain hopper | $2k | $1,300 | 20 | gold | |
| Livestock | Livestock | $3k | $2,000 | 6 | tan | needs Livestock Pens to load |
| Oil (1860+) | Tanker | $3k | $1,600 | 30 | dark green | |
| Steel | Flatcar | $2k | $1,800 | 30 | steel blue | processed |
| Lumber | Flatcar | $2k | $1,500 | 30 | light brown | processed |
| Food | Boxcar | $3k | $2,200 | 8 | orange | processed; cold storage helps |
| Goods | Boxcar | $3k | $2,600 | 15 | purple | processed |
| Fuel (1890+) | Tanker | $3k | $2,000 | 30 | yellow | processed |

**Revenue on delivery (per carload):**
```
distanceTiles = straight-line (Euclidean) distance between the station where it was loaded and destination
days          = in-game days since loaded
timeFactor    = days <= expected ? 1.0 + 0.25*(1 - days/expected) : max(0.2, 1 - (days-expected)/(decayDays*2))
                where expected = decayDays * (distanceTiles / 20)  (min 1 day)
revenue       = base × (distanceTiles / 10) × timeFactor × stationBonuses × eraInflation × difficultyRevenueMult
```
Minimum distance for revenue: 3 tiles (shorter pays 0, warns once). Show a floating `+$12k` above the
station on each delivery (color = cargo color), and add to the train's lifetime/yearly revenue.

### 8.2 Industries

| Industry | Terrain affinity | Produces (units/month) | Consumes | Acceptance points | Era |
|---|---|---|---|---|---|
| Coal Mine | hills, mountain | Coal 60 | — | — | 1830 |
| Iron Mine | hills, mountain | Iron Ore 50 | — | — | 1830 |
| Forest (logging camp) | forest | Wood 60 | — | — | 1830 |
| Farm | plain | Grain 60 | — | — | 1830 |
| Ranch | plain, desert edge | Livestock 40 | — | — | 1830 |
| Oil Well | plain, desert | Oil 50 | — | — | 1860 |
| Steel Mill | near city | Steel (1 per 1 coal + 1 ore, both needed) | Coal, Iron Ore | Coal 8, Ore 8 | 1830 |
| Sawmill | near forest/city | Lumber (1 per 1 wood) | Wood | Wood 8 | 1830 |
| Food Plant | near city | Food (1 per 1 grain or 1 livestock) | Grain, Livestock | Grain 8, Livestock 8 | 1830 |
| Factory | in/near city | Goods (1 per 1 steel or 1 lumber) | Steel, Lumber | Steel 8, Lumber 8 | 1830 |
| Refinery | near coast/city | Fuel (1 per 1 oil) | Oil | Oil 8 | 1880 |
| Port (coastal cities only) | coast | Goods 20 (imports) | accepts everything except passengers/mail | 8 each | 1830 |

- Processing: delivered inputs are stored at the industry; output equals input processed that month
  and appears at stations covering the industry the following month. Steel needs both inputs (output =
  min(coal, ore)).
- **Industry dynamics** (monthly, small probabilities): raw producers that are served (≥ 50% of output
  picked up over the last 12 months) have a 3%/month chance to grow +20% (max 3× base); unserved ones
  have 1%/month to shrink −20% (min 50% base). A new industry appears somewhere with 0.5%/month chance
  (higher near served cities). Industries never close entirely in v1.
- Industries render as small multi-tile-looking icons on their tile (mine headframe, trees+saw, silo, etc.).

### 8.3 Cities

- A city occupies a cluster of tiles; its size tier determines footprint and buildings drawn:
  Village (1–4 tiles, pop ~1–5k), Town (5–12, ~5–25k), City (13–30, ~25–150k), Metropolis (31+, 150k+).
- Supply per month: passengers = pop/250, mail = pop/800 (units), split among covering stations
  by the fraction of city tiles each covers.
- Acceptance points per city tile: passengers 4, mail 4, goods 2, food 2, fuel 1 (1890+), lumber 1
  (village/town only), plus a Metropolis accepts everything processed at +1.
- **Growth** (monthly): `growthScore` = (passengers+mail delivered to the city last 12 months) ×
  (hotel bonus) + 3×(food + goods + fuel delivered) − decline if not served at all.
  Crossing thresholds grows population (and adds a tile to the city footprint on free adjacent land);
  unserved cities grow very slowly (0.2%/year baseline).
- **City upgrades by the player** (v1): the player can't buy city buildings directly, but can pay for a
  **"Civic Investment"** in a city connected by rail (cost $100k × tier, once per 5 years per city) that
  immediately grants +15% population and a one-off growth tick. This is the "upgrading cities" lever.
- City names render at all zooms; bigger tiers use bigger, bolder labels.

---

## 9. Finance

### 9.1 Starting conditions

- Starting cash: $1,000,000 (Easy $1.5M, Hard $600k).
- Loans: take in $100k increments up to a credit limit = 50% of company net worth (min $500k).
  Interest 6%/year (Easy 4%, Hard 8%) charged monthly. Repay anytime in $100k increments.
- No stock market, no shares, no competitors.

### 9.2 Ledger categories (tracked per month and per year)

Revenue: passengers, mail, freight (per cargo type).
Expenses: train maintenance, track maintenance, station maintenance, breakdown repairs, interest,
construction (track, stations, improvements, electrification — capital), rolling stock purchases (capital).

### 9.3 Net worth

`cash − loans + 50% of (track + station + improvement build cost) + locomotive/car value (depreciating
5%/year from purchase price, min 10%)`.

### 9.4 Bankruptcy

If cash < 0 at month end: forced loan up to the credit limit. If still < 0, show warning; after
3 consecutive months with negative cash and no credit left → "Bankruptcy" game-over dialog
(options: load last autosave, new game). Easy difficulty: no bankruptcy, just can't spend.

### 9.5 Era inflation

All costs and revenues scale by `eraInflation(year) = 1.0 + (year − 1830) × 0.012` (so ≈2.4× in 1950).
Keep it simple; the player mostly perceives it as bigger numbers.

### 9.6 Difficulty

| | Easy | Normal | Hard |
|---|---|---|---|
| Cash | $1.5M | $1.0M | $0.6M |
| Revenue mult | 1.25 | 1.0 | 0.8 |
| Build cost mult | 0.8 | 1.0 | 1.2 |
| Breakdowns | ×0.5 | ×1 | ×1.5 |

---

## 10. UI

Landscape only. Design for a ~6.5" phone (e.g. 2400×1080 physical, ~800×360 CSS px) and scale up to tablets.
All tap targets ≥ 44 CSS px. Respect Android safe-area insets.

### 10.1 Layout

- **Top bar** (thin, translucent): company cash (tap → finances), date, speed controls (⏸ 1× 2× 4× 8×), ☰ menu.
- **Left build toolbar** (vertical, collapsible): Track, Double, Electrify, Station, Bulldoze, Info (default).
- **Bottom-right**: Trains button (list), News button with unread badge.
- **Panels** slide in from the right (max 45% width): Station, Train, City, Industry, Finance, Train list, Buy train.
- **Toasts** for news (non-blocking) at top-center; important news pauses nothing.
- **Mini-map** (toggle) bottom-left: whole map, viewport rectangle, tap to jump.

### 10.2 Key panels

- **Station panel**: name (rename), type & upgrade button, improvements (buy), waiting cargo bars,
  supplies/accepts lists, trains serving it, catchment overlay toggle.
- **Train panel**: loco model & age & reliability, consist (car icons; add/remove/reorder while at a
  station), orders editor (tap stations on map to add while "Edit orders" is active), current status
  (moving/loading/waiting for block/broken down), this-year and lifetime revenue/profit, Replace Loco, Sell.
- **Buy train dialog**: loco list filtered by availability & fuel type, stats, "New!" badges;
  car picker; orders defaulting to "the station you're at → tap next station".
- **City panel**: population, tier, growth trend arrow, supplies/demands, Civic Investment button.
- **Finance panel**: cash, loans (borrow/repay), this year vs last year ledger table, simple line chart
  of cash & net worth over time (monthly samples).
- **Train list**: sortable by profit/age/name; tap → focus camera on train.
- **Overlays** (menu toggles): catchment of all stations, cargo supply heatmap per cargo, track type
  (single/double/electrified colors), train profit colors.

### 10.3 Visual style — "original, but more modern"

Keep RRT Deluxe's readable top-down map look, but cleaner:
- Muted, slightly desaturated natural palette with soft hillshading (light from NW, derived from elevation).
- Terrain tiles blended at borders (dithered/soft transitions, not hard squares); subtle procedural
  texture (grass speckles, tree clusters for forest, contour-ish shading for hills/mountains).
- Water: deep/shallow blue with a subtle animated shimmer (cheap: redraw a few highlight dots per second).
- Rivers: blue lines with width by flow.
- Track: dark rails with ties at zoom ≥ 1; a single dark line at low zoom. Double track = two parallel
  lines. Electrified = small catenary poles every 2 tiles.
- Cities: clusters of small roofs (red/brown/grey), denser and taller-looking (drop shadows) at higher tiers;
  metropolis has a few taller blocks.
- UI: flat, rounded panels (8 px radius), semi-transparent dark background, white text, cargo-colored chips.

Suggested base palette (tweak freely):
```
plain #9DBA6A  forest #5E8A4A  hills #A9A46A  mountain #8C8272  snowcap #EDEDE8
desert #D8C48A swamp #6F8A6A   water-deep #2E5E8C water-shallow #4F86B5 river #4A7FB0
track #3B3430  tie #6B5A4A     city-roof #B5533C / #8E6B5A / #7A7A80
ui-bg rgba(24,28,34,0.88) ui-accent #F2B544 good #5BC27A bad #E05A4F
```

### 10.4 Performance targets

- 60 fps on a mid-range Android phone (e.g. Snapdragon 7-series) on a Large map with 60 trains.
- Terrain pre-rendered into cached chunk canvases (e.g. 16×16 tiles per chunk) per zoom bucket
  (1×, 0.5×, 0.25× — redraw chunk when its tiles change). Track layer cached per chunk as well.
- Only dynamic things (trains, smoke, floating revenue labels, water shimmer, selection) drawn per frame.
- Simulation tick must stay < 2 ms for 60 trains on a Large map (profile block/route recomputation; cache paths).

---

## 11. Scenarios & goals

Each real-world region ships with 1–2 optional goal sets (bronze/silver/gold), e.g.:
- `us-east`: "Connect New York and Chicago by 1860", "Annual revenue $5M by 1880", "Chicago reaches Metropolis".
- `gb`: "Connect London–Birmingham–Manchester–Liverpool by 1845", "Deliver 1,000 carloads of coal in a year".
- `central-eu`: "Cross the Alps: connect Munich/Vienna to Milan or Venice/Trieste", "Electrify 200 tiles by 1930".
- `us-west`: "Connect Sacramento to Salt Lake City by 1870", "Net worth $50M by 1920".

Goal types (data-driven): `connect(cityA, cityB, byYear)`, `annualRevenue(amount, byYear)`,
`netWorth(amount, byYear)`, `cityTier(city, tier, byYear)`, `delivered(cargo, amount, withinYear)`,
`electrifiedTiles(n, byYear)`. Random maps: goals generated from the same types.
Goals panel shows progress; reaching gold shows a celebration dialog; game continues.

---

## 12. Commands & determinism

All state changes caused by the player go through `sim/commands.ts`:
`buildTrack(path, options)`, `upgradeTrack(...)`, `electrify(...)`, `bulldoze(...)`, `buildStation(tile, type)`,
`upgradeStation`, `buildImprovement`, `buyTrain(...)`, `setOrders`, `sellTrain`, `replaceLoco`,
`borrow`, `repay`, `civicInvestment`, `setSpeed`, `renameStation`.
Each command validates (money, terrain, era) and returns `{ ok: true } | { ok: false, reason: string }`.
The UI shows `reason` as a toast. Given the same initial state, seed and command log, the simulation
must produce the same result (enables tests and replay debugging).

---

## 13. Persistence

- Autosave monthly (rotating 3 slots) and when the app is backgrounded (Capacitor `App` pause event /
  `visibilitychange`). Manual save to 5 named slots. Load menu shows slot name, company date, cash, map.
- Save = JSON of `GameState` (tile arrays packed as base64 typed arrays), with `version` number and a
  migration function per version bump. Target < 2 MB per save.
- Settings (localStorage): units km/h vs mph, quick build, sound, show grid, UI scale.

---

## 14. Out of scope for v1 (possible later)

Competitors, stock market, tunnels, signals placed by the player, multiplayer, seasons/weather,
terraforming, roads/other transport, cargo transfer between trains at stations, hand-drawn sprite art,
localization (English only, but keep strings in one `strings.ts` file for later).

---

## Deviations

(Implementers: append `- [Phase N] what changed — why` here.)

- [Phase 1] `GameMap` stores `terrain`/`elevation`/`riverFlow` typed arrays; no separate generic
  "flags" array — nothing needs per-tile boolean flags yet. `cityId`/`industryId` will be added in
  Phase 3 when cities/industries exist.
- [Phase 3] Calendar uses a simplified 12×30-day (360-day) year instead of the real Gregorian
  calendar (`src/sim/time.ts`) — "monthly"/"yearly" processing (§3, §8.2, §8.3, §9) lands on exact
  tick boundaries with no irregular month-length bookkeeping. Months are still named/numbered 1–12.
- [Phase 3] Scenario start year defaults to a fixed 1900 (`DEFAULT_START_YEAR`,
  `src/data/mapGen.ts`) since there's no new-game year picker yet (Phase 10). §4.2's "city count"
  and "resource density" generator inputs exist as `MapGenOptions` fields with a `"normal"` default
  but aren't exposed in the (dev-only) debug controls yet — same reason, Phase 10's new-game screen
  is the intended home for those controls.
- [Phase 3] City/industry placement is deterministic but not exactly "by score, greedy" as a single
  pass: candidates are chosen from local-best tiles over a 4×4 block grid (not every tile) for
  performance on Large maps, and the playability check (§4.2 step 6) does one deterministic retry
  with a larger city-count target (continuing the same RNG stream) if fewer than 3 qualifying
  town/city pairs are found — it does not regenerate the terrain itself.
