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
  change is ≤ 45°. **The same rule is enforced when building** (Phase 18): a new edge must be able to
  connect legally to something at each end — track that is already there, or the rest of the same drag.
  A branch that is sharp against one leg but legal against another (a normal turnout) is fine; a 90°
  corner, a hairpin, or a 90° branch off a straight line is refused ("Too sharp", the offending segment
  drawn red). Sharp joins in old saves still load (marked with the small red marker) and are simply not
  traversable. 90°+ turns are only possible at stations (trains may reverse at stations).
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
- **Bulldoze**: drag along track — exactly the edges the drag runs along go (a junction the drag merely touches keeps its other legs), previewed in red with the refund; a station left with no track goes with it. Tap a station to remove it (confirm; refused while trains have it in their orders, or if it is the last Engine Shed). Refunds 25% of build cost. Cannot remove track under a train.
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
| Engine Shed | always | $30k (era-scaled, ×build-cost difficulty) | Trains that stop here get serviced: breakdown chance −50%. New trains can only be bought at a station with an Engine Shed (the first station built gets a free one; **any** station can build another, Phase 28A). A repair crew leaves from the *nearest* shed, so sheds near the ends of a big network make call-outs short and cheap. |
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
- A train stops only at its **current target** (Phase 32; the Phase 31 "calling points" idea was reverted). A station
  the route merely runs through is passed non-stop, even if it is elsewhere in the orders — list it again where you
  want the extra stop (A, B, C, B). The train panel's Route tab flags such a stop ("Passed without stopping on the way
  from X") with an "Add stop here" action. A train bought at a station that is not its first target leaves empty and
  loads only at its order stops.
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

Movement scale (**revised in Phase 5 review**; the old "1 tile = 10 km at real speed" made trains cross the map in ~1 s):
- Displayed distances still use 1 tile = 10 km, but game time is compressed. A train moves
  `tilesPerDay = speedKmh / 30` tiles per in-game day (so 60 km/h ≈ 2 tiles/day ≈ 2 tiles per real second at 1×,
  and the 270 km/h trainset ≈ 9 tiles/day). Per tick (1 in-game hour) that's `speedKmh / 720` tiles.
- Put the constant `KMH_PER_TILE_PER_DAY = 30` in `src/data/` so it can be tuned.

### 7.5 Signaling: trains wait only at stations (revised after play-testing)

Rule from the player: **trains wait at stations, never out on the line.** A train only leaves a station
when the stretch of track to its next station is safe to run through end to end.

- **Sections**: the track between two consecutive *stations on a train's route* (any station counts, whether or
  not the train stops there, because stations are the passing places). Junctions inside a section are not
  waiting points.
- **Departure check (atomic)**: before leaving a station, the train reserves every block of its path up to the
  next station on its route. It may depart only if:
  no block on that path is occupied or reserved by a train travelling in the **opposite direction**
  (single track).
  (Phase 28A: there is no rule about the destination station's capacity. A train may always enter the station
  it is heading for; **platforms limit simultaneous loading, not entry**, see "Platforms and the yard" below.)
  Otherwise it stays in the station with status "waiting for line clear" (signal icon).
- **Same direction is fine**: any number of trains may be in a section heading the same way. Followers keep a
  2-tile spacing and brake behind the leader (on single and double track).
- **Double track**: opposing trains use separate lanes, so the line rule never blocks them.
- **Platforms and the yard (Phase 28A)**: a station has *platforms* (Depot 2, Station 3, Terminal 5) that limit how many
  trains **load at once**. A train arriving at a destination whose platforms are all busy (or whose yard already holds
  waiting trains) waits in the station's **yard** (holding tracks, unlimited) with status "waiting for platform" and
  takes the next free platform oldest-first (FIFO). A train that has finished loading gives its platform up and needs
  only the line to depart, never a platform at the next station; a `noRoute` train holds no platform either. So no
  train holds a platform while waiting to leave and no platform cycle can form (PLAYTEST-1 Bug 1/2: the old
  hold-and-wait deadlock at N ≥ 2 × platforms). A train standing in a station (waiting for its line) also stops
  holding the blocks its tail lies on — stations are the passing places — so two trains meeting head-on at a
  through-station can never hold each other's tails.
  Trains passing *through* a station they don't stop at take no platform, and they reserve the next section before
  entering, so they never stop on the main line.
- **Releasing**: a block is released when the train's tail leaves it; the section reservation shrinks as the
  train advances.
- **Junctions and crossings (Phase 25A)** (Phase 28A: claims are released for every train at the start of the tick, and a junction that comes free goes to the train that has waited longest for it, so a busy junction cannot starve the trains waiting at a terminal next to it): a node with three or more legs that is not a station (an X
  crossing, a junction, a merge) is used by **one train at a time**. Section reservation stays as above;
  on top of it a moving train *claims* the next junction node — together with every further junction node
  within one train length of it, all or none — once its head is within 4 tiles, and releases each node
  when its tail is 0.35 tiles past. A train whose next junction is claimed by another brakes to a stop
  0.35 tiles short of it and goes as soon as it is free ("Waiting at crossing for Train N"). Exceptions:
  opposing movements over the same two legs on double track use separate lanes and do not conflict; a
  train standing still in a station holds no claims (stations are the passing places).
- **Safety net**: if a train has waited > 10 in-game days *at a station*, try an alternate route; if still
  blocked after 20 days, show ⚠ and a news message ("Line between A and B is congested — add double track or a
  station in between"). No teleporting.
- Waiting trains show a small red signal icon, and the train panel says what they are waiting for.

### 7.6 Breakdowns & aging

- Each locomotive model has `reliability` 1–5. Monthly breakdown chance = base (0.5%, 1%, 2%, 4%, 7%
  for reliability 5…1) × (1 + age/20 years) × (0.5 if serviced at an Engine Shed in the last 60 days).
- Breakdown: train stops where it is; a repair crew (handcar → motor trolley → service truck) drives from the nearest Engine Shed
  station (else the first station, slow) — repair time = dispatch + travel + 2–5 fix days; cost $5k + $120/tile (era-scaled). (Phase 26A)
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
| Passengers | Passenger | $6k | $3,000 | 3 | white | two-way from cities |
| Mail | Mail | $6k | $4,000 | 2 | red | two-way from cities |
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
                where expected = distanceTiles / 2 × urgency + 2   (days; 2 tiles/day ≈ a 60 km/h train, +2 days for loading)
                urgency: passengers 1.0, mail 0.8, livestock 1.2, food 1.3, goods 1.6, all other freight 2.5
                (revised in Phase 5 review so expected times match the compressed movement scale in §7.4;
                 decayDays now only controls how fast revenue falls after `expected`)
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
- **Industry dynamics** (monthly, deterministic; Phase 36): a raw producer's output changes smoothly each month
  with the **share of it that trains carried** (units loaded at covering stations ÷ output, smoothed over ~6 months;
  `INDUSTRY_GROWTH_RATE_ANCHORS`): 0 % carried → −4 %/yr, 40 % → flat, ≥ 80 % → +8 %/yr (a well-served mine roughly
  doubles in 10 years), clamped to 0.5×–3× base. The station panel shows one line under the supply chip ("↑ 6 %/yr",
  nothing when flat). A new industry appears somewhere with 0.5%/month chance
  (higher near served cities). Industries never close entirely in v1.
- Industries render as small multi-tile-looking icons on their tile (mine headframe, trees+saw, silo, etc.).

Cars (Phase 36): a passenger or mail car costs 3× a basic freight wagon ($6k vs $2k) and costs more to keep up: yearly
upkeep is the car's price × 8 % (passenger, mail) or 4 % (freight), at the year's prices, added to the train's running cost
(`carUpkeepRate` in `src/data/cargo.ts`).

### 8.2b The long-haul chain (Phase 40)

One valuable chain per map, on the map from the first day: **silver** (Silver Mine → Smelter → Mint) when the game starts
before 1940, **uranium** (Uranium Mine → Enrichment Plant → Nuclear Power Plant) from 1940 on. A silver game keeps its silver
chain past 1940; there is never more than one chain. `src/sim/economy/longHaulChain.ts` places it on a copy of the map's rng
stream (no other map changes), after the ordinary industries and `ensureIndustryChains`, for generated maps and regions alike.

- **Far apart**: the mine and the processor, and the processor and the customer, are each at least a third of the map's longer
  side apart (and at most two thirds), the mine is at least 1.2 legs from the customer, all three on one landmass (8-neighbour
  land components), 6 tiles off the map edge, with the usual city / industry spacing. The customer stands within 4×scale tiles
  of one of the 8 biggest towns; the mine is on hills or mountains. If a map cannot fit it the legs relax in steps (×0.85 … ×0.4).
  These industries have placement kind `chain`: the growth, discovery and spawn code never touches them.
- **Paid only on final delivery.** Ore (`chainLeg: "intermediate"`) pays nothing at the smelter; it only hands its origin tile to
  the processor (`IndustryEconomyState.oreOriginTile`). Bars / enriched uranium (`"final"`) are loaded with that origin on the
  car (`TrainCar.oreOriginTile`, kept through a Warehouse transfer in `TransferLot`) and pay on arrival at the Mint / Power Plant
  by the **straight-line distance from the ore's origin** (the mine's station), not from where they were loaded. The time factor
  still runs from the loading at the smelter. Bars: $4,200 per 10 t car per 100 km (`SILVER_BARS_BASE_RATE`), enriched
  uranium $6,300, at era-1830 prices (≈ 7× coal per ton and km, paid on the whole mine-to-customer distance).
- **Output**: the mine makes 80 t of ore a month × `longHaulOutputMult(year, chain)` (silver: 1× to 1880, 2× in 1900, 3× from 1930; uranium: 2× in every year, Phase 41 — only the mine's output is lowered, prices and demand are untouched); a 20 t ore
  car makes a 10 t bar car (80 t of ore → 40 t of bars at base).
- **Secure cars**: bars and enriched uranium travel in a bullion van / flask car: $12k (6× a wagon), 10 t, upkeep 12 %/yr of
  price (3× a wagon's). Ore uses ordinary ore hoppers.
- **UI**: the station panel adds one line under the supply chips of a station that supplies the chain's ore or bars: "Pays on
  arrival at the Mint: ~$6,230/t · ~$2.4M/yr at full output" (`chainPayEstimate`: the mine-to-customer distance at today's fare,
  delivery on schedule; for ore, the value of the bars it makes; the yearly figure is the mine's current output, all carried). The buy-train car palette lists a chain's cars only on a map that has the chain.
- Balance: see `tools/bench/longHaul.ts` and PROGRESS (Phase 40) for the return by start decade.

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

- Starting cash: $1,000,000 (Easy $1.5M, Hard $600k) for starts before 1930; × 1.5 for a 1930 start and × 2 for 1950
  (`ERA_START_CASH_MULT`, Phase 41: the first line and its first train cost the same share of the cash as in 1900). The New
  Game screen labels those starts "Expert: few, expensive first lines".
- Loans: take in $100k increments up to a credit limit = the lower of 50% of company net worth and 5× the last twelve
  months' operating profit before interest (lenders lend against cash flow), never below $500k (Phase 30A, §9.5c).
  Interest = base rate 6%/year (Easy 4%, Hard 8%) **plus a leverage premium** (§9.5c), charged monthly on the whole loan
  book. Repay anytime in $100k increments.
- **Phase 39: loans are bonds.** Each loan repays in equal monthly principal over 10 years (120 months); the month's
  instalment comes out of cash. The $500k floor on the credit limit is start-up credit and ends after 24 months; after that
  the limit is `creditMult` × the lower of 50 % of net worth and 5× trailing earnings (zero for a company that earns
  nothing and owns nothing). Interest also carries a cover premium (up to +8 points) when earnings before interest are
  under 3× the base interest. If the limit falls below the debt (earnings fell, a panic) lenders call 25 % of the excess
  each month out of cash.
- No stock market, no shares, no competitors.

### 9.2 Ledger categories (tracked per month and per year)

Revenue: passengers, mail, freight (per cargo type).
Expenses: train maintenance, track maintenance, station maintenance, breakdown repairs, interest,
construction (track, stations, improvements, electrification — capital), rolling stock purchases (capital).

### 9.3 Net worth

`cash − loans + 50% of (track + station + improvement build cost) + locomotive/car value (depreciating
5%/year from purchase price, min 10%)`.

### 9.4 Bankruptcy

If cash < 0 at month end: forced loan (a news item) up to the credit limit. If still < 0 the company is **insolvent**: a
news item and a banner give the months left (Phase 39: grace 4 on Easy, 3 on Normal, 2 on Hard); a month that ends with cash
back at or above zero resets the count; when the grace is spent → "Bankruptcy" game-over dialog (options: load last
autosave, new game). Easy difficulty: no bankruptcy, just can't spend.

**Financial panics (Phase 39).** Historical crashes (1837, 1847*, 1857, 1866*, 1873, 1884, 1893, 1907, 1920, 1929, 1937; * =
GB and central Europe only) each happen, per game, with the difficulty's probability, in a month drawn from the seed
(never in the first 12 months). A panic lasts 12-24 months and cuts demand for every cargo by 20-40 % (easing off over
its last 6 months); the credit limit is multiplied by the difficulty's panic credit factor while it lasts. Depth and length
scale with the difficulty (§9.6). Deterministic per seed: `src/sim/finance/panics.ts` stores nothing.

**Running costs (Phase 39).** Fuel is 60 % of a locomotive's running cost and is paid per tile run, scaled by the
train's weight (engine class plus cars, loaded cars heavier); the rest (servicing, oil, depot) is paid by the year. A train
that stands still burns no fuel; a long line of heavy trains burns a lot.

### 9.5 Era inflation

`eraInflation(year) = 1.0 + (year − 1830) × 0.012` (≈2.4× in 1950) is the general price level for things the railway buys
(locomotives, construction, parts, fuel). Wages, fares and competition have their own curves, see §9.5b.

### 9.5b Economic model v2 (Phase 28A)

Replaces the old "era inflation multiplies everything" balance and the Phase 27 D stopgaps (`earlyUpkeepFactor`,
`earlyFareFactor`, removed). Rule from the player: *it must make sense, based on real things; we cannot just cut
profit in half.* Every cost below comes from one modelled cause, is a small table in `src/data/economy.ts`, and is
shown to the player where it costs money (Finance cost lines with tooltips, train panel, station panel, News).
`eraInflation` stays as the **general price level** (locomotives, rail, parts, coal: 1.0 in 1830, +1.2 %/year).

1. **Fares vs wages.** Fares follow a *real-terms* curve on top of the price level: passengers and mail ×1.9 in
   1830 (rail as a stagecoach-priced novelty), ×1.45 in 1845 (the 1844 Act forced cheap third class), ×1.0 in 1860,
   ×0.78 in 1885, ×0.62 in 1905, ×0.5 from 1965. Freight rates start at ×1.5 (bulk freight beat the wagon and canal),
   ×1.05 in 1875, ×0.8 in 1905, ×0.7 from 1965 (rate competition and regulation). *Wages* (railwaymen, station staff,
   platelayers) grow faster than prices: real wage ×1.5 in 1880, ×2.2 in 1930, ×3.4 in 1980 (`wageIndex`).
   One railwayman costs $350 a year in 1830. **Crews:** footplate crew of 2 on steam (3 on the biggest articulated), 2
   on diesels and early electrics, 1 on electrics from 1960, plus one guard per 4 cars (`trainCrewSize`): a Grasshopper
   with 3 cars has a crew of 2, a 22-car articulated 7. The old per-locomotive `maintenancePerYear` was crew + fuel;
   now 45 % of it is **fuel & servicing** (prices) and the crew is a separate **Crew wages** line. Stations: upkeep
   (prices) + staff (wages), Depot 1 / Station 2 / Terminal 6 staff. Track: 70 % of the per-tile upkeep is gangers'
   wages.
2. **Track wear from use.** Per tile run: `(loco tonnes × axle factor + car tonnes × 0.8) / 100 × (1 + (v/100 km/h)²)`
   (loco 18/45/90 t and axle factor 0.7/1/1.6 for light/medium/heavy; a car weighs 12 t + 18 t when full). Each train
   accumulates wear units; the monthly step charges `units × $1 × (½ wages + ½ prices)` as **Track wear** and books it on the
   train. Plus the fixed upkeep per tile (double track costs 16/10 of single, catenary +5 per tile).
3. **Locomotive complexity.** Parts for a repair = 4 % of the engine's price (so a Mikado costs several times a Norris
   to fix), +100 % at 40 years of age, ×0.75 once the model is more than 10 years past introduction (spares stocked).
   Breakdown chance: a model that arrives *during the game* is one reliability step worse for its first 5 years
   (teething); > 10 years on the market ×0.85; +100 % per 800,000 km run; ×(1 + age/20 years); ×0.5 within 60 days
   of an Engine Shed visit; × difficulty.
4. **Repair logistics.** Call-out = crew of 3 × days away (dispatch, trip out *and back*, fix) × daily wage + vehicle
   running cost for the tiles driven both ways (handcar free; motor trolley $4/tile, service truck $8/tile at 1830
   prices) + parts. The crew leaves from the **nearest Engine Shed** (buildable anywhere, $30k), so sheds near the ends of
   a network shorten the wait — the real cost of a far breakdown is the days the train stands idle.
5. **Taxes.** *Property tax* 0.5 %/year of the book value of track, stations and improvements, from day one.
   *Corporate income tax* on the year's operating profit after interest (losses carried forward), charged at year
   end: 0 before 1910, then 6 % (1910), 12 % (1920), 18 % (1935), 26 % (1945), 32 % (1960). Hard ×1.6 on both taxes and
   a schedule a decade ahead of the calendar (6 % from 1900), Easy ×0.6 and a decade late.
6. **Competition.** Buses and cars take a share of *short* (< 150 km, linearly less towards 150) passenger and mail
   trips: 12 % in 1930, 25 % in 1950, 38 % in 1970, 45 % from 1990. Lorries take short-haul freight: 10 % in 1935,
   25 % in 1955, 40 % from 2000, scaled by cargo (coal/ore 0.25, grain/wood 0.4, steel 0.5, lumber 0.6, goods/food/
   livestock 1.0). Airlines take long passenger trips (> 300 km, full at 800 km): 15 % in 1960, 30 % in 1980. A train with a
   top speed ≥ 200 km/h keeps 70 % of what road and air would take. News announces "Motor buses now compete on short
   routes" (1920), lorries (1930) and airlines (1955). The loss is applied to the fare of each delivery, shown in the
   train panel ("Buses, lorries and airlines take N % of this route's fares").
   **Small towns (Phase 42):** from the 1920s buses and then cars take the *local* trips of small towns (the historical
   cause of branch-line closures). A town's passenger and mail demand falls by `SMALL_TOWN_ROAD_ANCHORS` (0 in 1920,
   40 % in 1930, 60 % in 1950, 70 % from 1970) for towns up to 15,000 people, fading linearly to nothing at 40,000,
   at every trip length (`smallTownRoadLoss`, applied in `cityTravelDemand` / `cityTileSupply`). The station panel
   shows one line, "Road competition: −N % since 1920". Nothing changes before 1920.
7. **Freight rates by value and distance** stay as in §8.1; the freight real-rate curve in (1) is what makes 1830s–40s
   bulk freight pay (it competes with the wagon and canal).

Difficulty (§9.6) is now *tax, interest, build cost and breakdowns*, no longer a revenue multiplier.

### 9.5c Phase 30A: real-world causes for the late game and the first decades (PLAYTEST-2)

Rule unchanged (owner): every balance change comes from one modelled cause, lives in a `src/data/` table, is shown to the
player, and there are no blanket multipliers. The 1900 "good player" reached $208M net worth by 1916 in PLAYTEST-2 (cities
were the only limit and cash piled up unused); the causes below take that late-game surplus away, one real cost at a time,
and the last one keeps the first decades playable. Measured results: docs/PROGRESS.md "Phase 30A".

1. **Waiting people (Phase 35D: no longer give up; see §9.5d-3)** (§6.2, §8.1). Passengers and mail have no storage cap and a Warehouse does nothing for them
   (it stores *freight* only, ×2 cap). A pile nobody has collected from for `graceDays` (passengers 10, mail 15) loses 5 %
   of itself per day (`WAITING_PATIENCE`): the pile settles near `supply ÷ 0.05` and a long gap between trains simply loses
   people. Each station keeps per month and year the units turned away and the fares they would have paid
   (`stationFlow`), shown on the station panel. Frequency (more trains, shorter gaps) is what saves them; a Warehouse is not.
2. **Mail is a contract, not half the income.** Mail supply per head is ×0.213 of the Phase 26A figure
   (`MAIL_VOLUME_FACTOR`), so mail is about 15 % of a city line's revenue (it was 48–58 %); the rate per bag (×1.3
   a passenger) and the Post Office (+50 % supply, +25 % pay) are unchanged.
3. **Land and way-leave.** Every tile of track and every station tile of a station also costs *land*: `LAND_BASE_PER_TILE`
   ($250 at 1830 prices) × the general price level × difficulty (`landMult` Easy 0.7 / Normal 1 / Hard 1.5) × a city
   premium `1 + urban(year) × (density ÷ 300)^1.2`, where density is the population per tile of the built-up area of nearby cities
   (a Gaussian of radius `1.2 + 0.25 √(pop/1000)` tiles). `urban(year)` (`URBAN_LAND_PREMIUM_ANCHORS`: 0.15 in 1830, 0.8 in 1860,
   2.4 in 1900, 3.4 in 1960) is the Victorian city: ground rents in town centres rose far faster than prices, so the first
   railways bought cheap and the great termini of 1900 paid dear; open-country land follows the price level only (farmland did
   not appreciate). A station takes 2 / 6 / 15 tiles (Depot / Station / Terminal), a passing loop 1. Land is a separate "land" line in
   the build preview, is part of `capitalInvested` (and so of net worth at 50 %), and the build pathfinder routes round dear land.
4. **Interest rises with leverage; credit follows earnings.** `rate = base + leveragePremium × l²` with
   `l = debt ÷ (net worth + debt)` (0 to 1; premium Easy 0.08 / Normal 0.12 / Hard 0.20), so a company that has borrowed
   its net worth away pays up to 18 % (Normal) or 28 % (Hard). Credit limit as in §9.1. Hard is harder through the base rate, the
   premium and land, not through lower fares.
5. **Track is a wasting asset.** Of the §9.5b-2 track-wear bill 30 % (`WEAR_ROUTINE_SHARE`) is still paid monthly as routine
   maintenance; the other 70 % is the *renewal* of rail and sleepers, which accumulates as wear on each edge and is paid
   in a lump when the player relays it (the same money, later). An edge
   lasts `RAIL_LIFE_UNITS` wear units by the year it was laid (wrought iron 2,500; Bessemer steel from 1865 10,000; standard steel
   from 1885 20,000; heavy welded rail from 1925 30,000). Above 60 % of its life a **slow order** deepens linearly to ×0.4 speed at
   120 %; `relayTrack` (a command) renews the worn edges for the renewal cost accumulated, the Track-type overlay colours worn
   track and train panels say "Slow order: worn track near X". Light early traffic barely wears; a busy fast line wants relaying
   every ~20 years.
6. **Locomotives wear out.** Prime for 15 years, then running cost +3 %/year of age and a breakdown multiplier rising with the
   square of the age past prime to ×4 at end of life (steam 35, diesel 40, electric 45 years) and +0.6 per year beyond, max ×12.
   A "worn out" news item appears once; `overhaulLocomotive` (30 % of the engine's price, 25 days in an Engine Shed, 60 % of the
   mechanical age taken off; engines of 10+ years) or replacement fixes it.
7. **Single track has capacity, and a way to add it.** A **passing loop** (`buildPassingLoop`, $12k at 1830 prices, a station-like
   section splitter with no staff or catchment, only on plain straight single track) lets opposing trains meet mid-line (§7.5).
   An order option **minimum days between departures** (`TrainOrder.minGapDays`, 0 / ½ / 1 / 2 / 3) spaces trains instead of
   convoys; the train holds its departure with "Holding for departure slot".
8. **Servicing by distance.** Breakdown chance is ×0.5 fresh from an Engine Shed and rises by +1.0 for every interval run since
   (`SERVICE_INTERVAL_KM` steam 8,000 / diesel 30,000 / electric 50,000), capped at ×3.5; any stop at a station with a shed
   services the train (8 hours, only once ≥ 10 % of the interval has run). Sheds along long lines matter.
9. **Goals pay in land grants** (the 1850s–70s land grants, compulsory purchase powers): bronze $100k, silver $300k, gold $1M
   at 1830 prices × the price level of the year, credited against future land bills (`landCredit`), shown on the goal card.
10. **Bridges.** A wooden bridge washed out in a flood leaves a persistent record (`washouts`, drawn as a gap marker); trains
    whose route crossed it report "Line cut at the bridge near X"; `rebuildBridge` rebuilds it in wood, stone or steel (as the
    era allows, with double track and catenary as before).
11. **Induced traffic (first decades).** A new railway created its own traffic: fares a fraction of the stagecoach's and
    journeys several times faster unlocked demand that had never been able to pay to travel (clerks, families, day trippers, the
    first excursion and Sunday trains), so early lines carried a multiple of the traffic forecast for them, converging on the
    long-run rate as the network matured. City **passenger** supply is multiplied by `inducedTrafficFactor(year)`
    (`INDUCED_TRAFFIC_ANCHORS`: ×1.7 from 1830 to 1860, easing to ×1.0 at 1900; mail and freight not). It replaces the early
    revenue that mail (58 % of it) used to give when mail is held to its realistic share. Measured need: with 1.0 the same
    good-player script that grew a 1840 start to $20M by 1870 before Phase 30A stalls at $1.3M (Hard goes bankrupt), 1.7
    restores it (docs/PROGRESS.md). The city panel's passenger figure includes it.

### 9.5d Phase 35: where passengers go (gravity split, reachable destinations, first-leg buckets)

Replaces Phase 34's boarding rule, which generated passengers for every stop of a train's orders and let a train board only
people bound for its own stops: a big town showed "672 waiting" while its trains, set to "Full load", left half empty. The
number on the platform must be a number the trains calling there can take. Rule unchanged: a real mechanism, tables in
`src/data/economy.ts` (`PAIR_DEMAND`, `TRAVEL_RANGE_ANCHORS`), no flat multiplier.

1. **The town total is population x trips per head (Phase 35C).** A town's total travel demand T (people a month who would
   ride a train *somewhere* if every town were on the network) = population x `tripsPerHeadPerMonth(year)`
   (`TRIPS_PER_HEAD_ANCHORS`: 0.0161 a month in 1830-60, 0.0121 by 1900 (Phase 36: x1.3 on 35E to pay for dearer passenger cars; was 0.0124 / 0.0093 in 35E); a 15k town in 1840 has T = 242, about 2.0x the old §6.3
   figure of 118, which was what one line to one typical partner carried). T is the single passenger number everywhere: the
   town panel shows T with a line "Connected: N / month (X %)" (the part trains reach); the station draws its catchment's
   part of T (towns with several stations split it by covered tiles, §8.3) and generates only the reachable part; the
   "Where passengers go" header is that same station figure. T is split over **every town within the era's known-destination
   radius** (`travelRangeTiles(year)`: 60 tiles = 300 km in 1830, 70 in 1870, 90 in 1900, 120 in 1930, 200 in 1960; 5 km a
   tile) by gravity: weight = destination population / max(distance, 15 tiles). Shares sum to 1 over the candidates (plus
   any reachable town beyond the radius) and no destination takes more than `PAIR_DEMAND.maxShare` (50 %) unless it is the
   only candidate. Nearer and bigger takes most, a far small town gets little; a line captures only the shares of the towns
   it reaches, so each further connected town adds its own. There is no flat multiplier: a lone partner with no other town
   in range is the whole of T, a partner among many towns a fraction.
2. **Only reachable destinations wait.** A destination counts only if a chain of trains reaches it: stations are linked by
   consecutive stops of any passenger train's orders (cycle, both directions); any number of changes. A share for an
   unreachable town is not generated at all. Where a town has several reachable stations the nearest by route is used.
   A station no passenger train calls at yet keeps one generic pile (everyone boards any train) so a new station still
   shows what it would draw. `computeStationEconomies` recomputes this with the orders (`setOrders`, `sellTrain`, removing a
   station, and monthly).
3. **First leg only.** Each reachable destination's people are stored by **first leg**: the next station on the shortest
   (crow-flies distance) route to it, ties to the lower station id (`StationCargoPile.bound`, keyed by first-leg station).
   Any train whose orders include that station boards them (`sim/stations/boarding.ts`). They leave the game there, paid for
   that leg only; no transfers are tracked. Through passengers on a train A–B–C stay on as before. A train therefore never
   refuses people the station shows as waiting. **Waiting (Phase 35D, replaces
   the 35C patience rule):** each bucket (a first leg, or the generic pile at a station no passenger train calls at) fills
   linearly at its monthly rate (rate / 30 a day) and holds at most **one month's worth** of that rate (150 a month to
   Venice: at most 150 waiting for Venice; a train taking 80 leaves 70, which refills linearly). Nobody gives up. People
   generated while their bucket is full are **unserved demand** (overflow; hint "Platform full: a month's travellers are
   waiting — run more trains or cars."). When reachability changes and a bucket's rate falls its waiting is clamped to the
   new cap; people of a destination no longer reachable become unassigned (board any train, within the station's one
   month total). Mail follows the same rule (one month of mail per pile). Freight is unchanged (storage caps, decay).
4. **Mail** keeps its model: no destinations, the Phase 26A destination bonus (+10 % per extra stop, max +50 %), and the
   Phase 35D waiting rule above.
5. **"Where passengers go"** (station panel: tap the passenger tile): per month, bars **by first train stop** (each includes
   people travelling further), each row expandable (▸) to final destinations ("Ljubljana 30 · Zagreb 15"), then **Not
   connected**: the top towns of the radius with no train link, largest first ("Padua ~20 · Verona ~12 · 4 more"), then
   the hint "Connect them to win these travellers". Never empty while towns are in the radius.
6. **Fares at the station that loaded them.** Fares are paid on arrival and credited to where the cargo was loaded, so on a
   long line a month can show people sent and no fares yet; the panel says "paid on arrival", not "$0".
7. **Saves.** Phase 34 piles stored by destination are re-bucketed by first leg on load (`rebucketPassengerPiles`).
8. **Result.** Numbers in docs/BALANCE.md ("Pair scaling") and docs/PROGRESS.md "Phase 35".

### 9.6 Difficulty

| | Easy | Normal | Hard |
|---|---|---|---|
| Cash | $1.5M | $1.0M | $0.6M |
| Revenue mult | 1.25 | 1.0 | 1.0 (was 0.8; Hard is now harder through tax, not fares) |
| Build cost mult | 0.8 | 1.0 | 1.2 |
| Breakdowns | ×0.5 | ×1 | ×1.5 |
| Tax schedule (property + income) | ×0.6, a decade late | ×1 | ×1.6, a decade early |
| Interest (base rate) | 4 % | 6 % | 8 % |
| Leverage premium (§9.5c) | 0.08 | 0.12 | 0.20 |
| Land and way-leave price (§9.5c) | ×0.7 | ×1 | ×1.5 |
| Credit (Phase 39) | ×1.5 | ×1 | ×0.6 |
| Insolvency grace before bankruptcy | 4 months (bankruptcy off) | 3 months | 2 months |
| Financial panics (Phase 39, §9.4) | 50 % of them, ×0.6 deep, ×0.7 long, credit ×0.8 | 80 %, ×1, ×1, credit ×0.6 | all, ×1.3 deep, ×1.25 long, credit ×0.3 |

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
- `us-east`: "Connect New York and Chicago by 1860", "Annual revenue $2.5M by 1880", "Chicago reaches Metropolis".
- `gb`: "Connect London–Birmingham–Manchester–Liverpool by 1845", "Deliver 1,000 carloads of coal in a year".
- `central-eu`: "Cross the Alps: connect Munich/Vienna to Milan or Venice/Trieste", "Electrify 120 tiles by 1930".
- `us-west`: "Connect Sacramento to Salt Lake City by 1870", "Net worth $50M by 1920".

Goal types (data-driven): `connect(cityA, cityB, byYear)`, `annualRevenue(amount, byYear)`,
`netWorth(amount, byYear)`, `cityTier(city, tier, byYear)`, `delivered(cargo, amount, withinYear)`,
`electrifiedTiles(n, byYear)`. Random maps: goals generated from the same types.
Goals panel shows progress; reaching gold shows a celebration dialog; game continues.

### 11b. Contracts (Phase 45)

A town or company offers a deal; the game never pays for nothing. Four kinds (`src/data/contracts.ts`):
- **Delivery** - "Vienna needs 300 t steel by Mar 1862": a town that demands a cargo (tier ladder, era-gated) that a
  producer near the network really makes. Counts paid deliveries of that cargo to a station covering the town.
- **Connection** - "Connect Graz by 1863 - it pays 50 % of the track": an unserved town within reach. The town refunds
  half of the cost (construction + land) of every track step you lay inside the corridor between your network and the
  town (distance to the anchor + to the town <= 1.3x their separation + 4 tiles), up to a cap of 1.25x the estimated route
  cost x 0.5, and never more than half of a bill even with two such contracts. It completes when a station covers the
  town and is on the same track network as a station you had at acceptance. The subsidy is paid as you build and kept
  if you fail (the cap bounds it); the refund also reduces the construction cost counted in net worth.
- **Service** - "Carry 2,000 passengers Trieste <-> Venice by <date>": counts paid passenger deliveries that were loaded at a
  station covering one town and unloaded at one covering the other.
- **Rescue** - "The Linz coal mine winds down unless you haul 400 t by <date>": a raw producer that trains carry < 5 % of.
  Success multiplies its output multiplier by 1.2 (within the usual 0.5-3 bounds), failure by 0.8.

**Generation.** Every `OFFER_GAP_MONTHS` (4-8) after the first year and with >= 2 stations, a candidate is drawn from the
current state: places within 1.5x the average line length of a station (never under 28 tiles), real unmet demand,
processed cargo only from a producer with output now. Never impossible: the target is reachable by an A* track path
(else the candidate is dropped), a delivery/rescue quantity is <= 60 % of the source's output over the deadline, and a
service <= 60 % x 50 % of the smaller town's riders; the deadline is 90 days of set-up plus 2.5 round trips, within
6-18 months (delivery), 24-36 (connection), 12 (service), 18 (rescue), x1.25 Easy / x0.85 Hard. At most 3 open offers
(each lapses after 3 months) and 2 accepted. Randomness is a separate seeded stream (`state.contracts.rng`), so contracts
never change a map or an economy.

**Reward** = (0.5 x missing track + 0.3 x rolling stock + 0.3 x operating cost over the period) x (1 + margin 30-60 %) x
difficulty (Easy 1.25, Normal 1, Hard 0.8), capped at 25 % of net worth and dropped under $8k (1830 prices). The freight
revenue of the haul is on top and pays most of the running cost, hence the shares below 1. Failing (deadline or giving up)
costs 10 % of the reward and no new offer for 8 months. Cash rewards and penalties are outside the ledger (like land
grants): they move cash and `contracts.stats` only, and are untaxed.

UI: a news item and tappable toast when an offer arrives; a Contracts button (badge = open offers) opens one line per
contract: Accept / Later on offers, a progress bar, reward and days left on accepted ones, Give up (two taps). Tapping a
line looks at the town or industry. Commands: `acceptContract`, `declineContract`, `abandonContract`.

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
- [Phase 5 review] §7.4 movement scale and §8.1 `expected` transit time revised: trains move speedKmh/30 tiles per in-game day (the original real-speed scale crossed the map in ~1 s); revenue expectations rescaled to match.
- [Phase 7] Cars are still cargo-dedicated at purchase (a Phase 6 simplification carried forward):
  §7.1's shared car types (a Boxcar hauling goods/food/lumber/steel, a Tanker hauling oil/fuel) are
  modeled as separate cargo-specific purchases instead, matching how the Buy Train dialog already
  works. A car is simply full (1 carload = 20 units, SPEC's own abstraction) or empty of its one
  cargo type.
- [Phase 7] §9.2's ledger revenue is tracked as 3 buckets (passengers, mail, freight) rather than
  "(per cargo type)" — the 800×360 finance panel has no room for a 13-row breakdown. All non-
  passenger/mail cargo revenue is summed into `freight`.
- [Phase 7] Station-type loading speed and the "Wait for full load" default timeout aren't specified
  by SPEC's own text (§7.2 says the wait cap is "optional" but not what happens without one); added
  `loadSpeedMult` per station type and `DEFAULT_FULL_LOAD_MAX_WAIT_DAYS = 14` (`src/data/stations.ts`,
  `src/data/trains.ts`) as reasonable, tunable defaults.
- [Phase 7] Station improvements (Engine Shed aside, already in Phase 6) are still inert — Warehouse/
  Cold Storage/Freight Yard/etc. effects and their purchase UI are explicitly Phase 9's job per
  PLAN, so this phase's waiting-cargo decay and loading-speed formulas don't yet special-case them.
- [Phase 7] Net worth's depreciating "rolling stock" value is tracked per train from its own
  `purchasePrice`/`purchaseTick` (SPEC §9.3's 5%/year, min 10%) rather than summing current
  loco+car catalog prices, since a locomotive's price at purchase time already reflects that era's
  inflation and shouldn't silently change if the player is still mid-game when prices rise further.
- [Phase 7.1] Balance retune (review of Phase 7's numbers — a passenger shuttle earned ~8x a coal
  route). Formulas unchanged; tuned `src/data/*` tables only:
  - §8.1 `CARGO.passengers.baseRate`: 3000 → 1400.
  - §8.1 `CARGO.steel.baseRate`: 1800 → 2000; `CARGO.goods.baseRate`: 2600 → 2900 (so a full
    processing chain clears a passenger shuttle's profit per train, per the Phase 7.1 target).
  - §8.2 `INDUSTRIES.ironMine.produces.ironOre`: 50 → 60/month (matches `coalMine`, so a steel
    mill fed by both isn't ore-starved relative to its coal supply).
  - §8.3 city passenger/mail supply: SPEC's literal "pop/250" / "pop/800" divisors are now the
    tunable constants `CITY_PASSENGER_SUPPLY_DIVISOR = 650` / `CITY_MAIL_SUPPLY_DIVISOR = 1400`
    (`src/data/cities.ts`, used by `src/sim/economy/cityStats.ts`), replacing the hardcoded 250/800.
  See PROGRESS.md's Phase 7.1 entry for the measured before/after balance table.
- [Phase 11] §10.1's "all tap targets ≥ 44 CSS px" is met for every primary/frequently-tapped
  control (top bar, panel close, toolbar, segmented pickers, save-slot/hint-card buttons, ...) but
  not for the small wrapped pill chips in dense pickers — cargo car/loco order rule chips
  (`.train-car-add-btn`/`.train-car-chip`, `.train-order-rule-btn`/`.train-order-remove-btn`) and
  the ☰ menu's cargo-heatmap picker (`.menu-cargo-btn`) — where up to 13 chips wrap in a small
  scrollable strip; bumping those to 44px each would either force a lot more scrolling in an
  already-scrollable area or force a redesign of those pickers, out of scope for this phase's pass.
  Noted as a known carry-over rather than silently left inconsistent.
- [Phase 11] `GameState.stationEconomy` (a pure cache recomputed from map/cities/industries/
  stations/industryEconomy — see `src/sim/stations/economy.ts`) isn't persisted in a save; the load
  path recomputes it via `computeStationEconomies` right after deserializing, which is exactly what
  every normal-play code path already does whenever those inputs change, so this doesn't skip a
  save round-trip test.
- [Phase 13] PLAN's Phase 13 checklist suggests caching the new top-down vehicle drawings "per
  type+rotation bucket (e.g. 64 angles)" for performance. Implemented instead as plain vector draws
  every frame (loco/car shapes via `ctx.save/rotate/...` in `src/render/trains.ts`, same approach
  Phase 6 already used) — the Phase 12 stress scenario (60 trains, ~1,500 edges) still measures
  well inside budget without it (unthrottled `avgRenderMs` ≈ 1.3–1.4ms vs the 16ms ceiling, 4×
  throttled ≈ 4.3–4.9ms vs 120ms; see PROGRESS.md's Phase 13 entry for the before/after numbers),
  so the added complexity of a rotation-bucketed sprite cache (building/invalidating offscreen
  canvases per loco/car type × angle bucket) wasn't worth it for a target that's already cleared
  comfortably. Revisit if a future phase's stress scenario grows enough to need the headroom.
- [Play-test] §7.5 signaling rewritten: trains wait only at stations; departure reserves the whole station-to-station path; opposing traffic blocks, same-direction allowed; station slots raised (Depot 2 / Station 3 / Terminal 5) to prevent deadlocks.
- [Phase 18] §5.1 turn rule enforced at build time across existing track (`findSharpSteps`, reason `sharpTurn`): each new edge needs at least one legal (≤45°) partner among the other legs at each end node (existing legs or the same build); station tiles are exempt. Also applies inside a single drag (the old text allowed sharp corners to be built and merely flagged). The build pathfinder now avoids sharp turns and sharp joins when it can. `hasSharpJunction` (render marker) now flags only legs with *no* legal partner, so ordinary turnouts no longer carry the red dot.
- [Phase 18] §7.5: (1) held-block ids are re-derived from each train's route whenever the track changes (they used to go stale when blocks were re-numbered); (2) a `stuck` train keeps retrying its departure instead of waiting for a track edit; (3) a train whose next stop is unreachable reports it once and skips to the next reachable order (it used to park in `noRoute`, holding a platform slot forever); (4) fairness: a train that has waited ≥ 24 h for a single-track block makes newly departing same-way trains yield; (5) a train reversing at a terminal it passes through no longer counts the block it just used as already reserved for the way back. `Train.waitingOn` records what each waiting train waits for (train ids + block/station); a daily self-check clears stale reservations.
- [Phase 18] §6.2 Warehouse is now a transfer hub: cargo unloaded there that nothing demands (and no later stop of that train demands) — or everything, at a stop set to the new "Unload all (transfer)" rule — goes into per-station transfer stock (`GameState.stationTransfer`, capped by the Warehouse storage, no decay) keeping its origin tile and load tick. Other trains load it like waiting cargo (a feeder never reloads its own drop); revenue is paid only on final delivery, from origin→destination distance and total elapsed time. The feeder earns nothing ("Transferred" floating label). A feeder loads cargo whose only outlet is a "transfer" stop at a Warehouse. Save format unchanged (`stationTransfer` optional, absent = empty).
- [Phase 18] §8.2/§4.2 chain-aware industry placement: after normal placement, every processor is guaranteed a fed source of each input group within 25 tiles (`CHAIN_MAX_DISTANCE_TILES`, groups derived from `consumes` + `recipeMode`), and at least one Factory exists. Missing producers are added on suitable terrain 5–22 tiles from the processor; otherwise a generated-map processor is moved to a city where the inputs exist, or dropped. Region maps keep every hand-placed industry (only producers are added; terrain is relaxed if none suitable is near). The pass uses a copy of the RNG stream so city/name generation for a seed is unchanged. The "complete goods chain near a city" playability check is asserted by tests but is not a retry trigger (a retry would replace the cities).
- [Phase 23A] World scale 2×: **1 tile = 5 km** (was 10 km). §4.1 map sizes are now Small 192×128, Medium 256×192, Large 384×256 (city/industry counts per size unchanged, so density per tile ÷ 4); real-world regions are upsampled 2× at load time (JSON files unchanged) with noise-refined coasts and re-traced rivers. §7.4 `KMH_PER_TILE_PER_DAY` = 15 (a 60 km/h train covers 4 tiles/day); §8.1 revenue is "per 20 tiles (100 km)" with `expected = distanceTiles / 4 × urgency + 2` and a 6-tile minimum; §5.3 per-tile track, electrification, water-bridge prices and per-edge maintenance are halved and bridge spans doubled (river bridges stay flat per crossing); §6.2 water-tower range 80, §8.2 chain range 50, §4.2 city spacing 16 / playability pairs 30–60 tiles. Every km-based number is unchanged. Station catchment radii, city footprints, industry footprints, train/car lengths and the 2-tile signal spacing stay in tiles (a station covers less land — intended). Saves from before v4 are refused with "This save uses the old map scale and can't be loaded" (no migration).
- [Phase 24A] §4.2/§8.2 industry spacing: no industry (ports excepted, which may stand on the town's coast) within 5 tiles of a city footprint tile, and every industry has ≥ 3 empty tiles to any other (`INDUSTRY_MIN_CITY_DISTANCE`, `INDUSTRY_MIN_GAP_TILES`). A post-placement pass nudges violators outward (≤ 14 tiles); generated maps drop one that cannot be moved, region maps keep it. Chain additions and monthly-spawned industries obey the same rules. §9.2 the Finance overview leads with "Operating profit / month" (12-month average of revenue − maintenance − repairs − interest) and treats construction and rolling stock as investments. §7 each train keeps revenue/running-cost/repair books (this year, last year, lifetime). §7.5 same-direction following: the "2-tile spacing" is replaced by a smooth speed controller keeping ≥ 1 tile between the follower's nose and the leader's *tail*; all trains now accelerate 15 km/h and brake 30 km/h per tick.
- [Phase 25A] §7.5 junctions/crossings are exclusive (node claims, see the bullet above); the block model alone let two trains from different blocks pass through the same junction node at once. Delivery floating labels: one per cargo type per train arrival (a mixed train unloading 3 grain + 2 mail shows two labels, not five). §10 single-track lines that cross at 90° with no way to turn between them draw as a diamond crossing (one tie plate, rails carried across, frogs and check rails).
- [Phase 27] §5.1 build-time layout rules (`src/sim/track/layout.ts`, reasons `midTileCrossing`, `junctionOnBend`, `tooManyBranches`, `junctionsTooClose`; red preview like the sharp-turn rule): (1) two diagonals of one 2×2 cell may not both exist (an X with no node in the middle) — lines cross only *at a node*, straight over; (2) a junction node (degree ≥ 3, not a station) needs a straight-through pair with at most one branch per side (turnout / diamond / X), or is a symmetric Y fork; (3) two junction nodes on one line are ≥ 2 tiles apart. A *crossing* (two straight pairs at a node, 90° or 45°, single or double) is crossed straight over: trains cannot turn from one line onto the other there (routing) and it is drawn with no connector arcs. A separate clearance rule was dropped: on the 8-direction grid unconnected edges are always ≥ 0.707 tile apart (0.43 between the outer lanes of two double lines), enough for a 0.26-wide vehicle, so only crossing and connected geometry can conflict. Old saves that break a rule load and run unchanged; the map marks each break with a red ring (`findExistingLayoutIssues`).
- [Phase 27] §7.5 interlock works on geometric conflict points (`src/sim/track/conflicts.ts`): a junction node, or a *mid-tile crossing point* (two diagonals of one cell; id `mapSize + cell`). Each has a clearance derived from the angle between its legs and whether they are double track (≈ 0.4–1.4 tiles) that replaces the fixed 0.35 tile: a train claims from `clearance` before the point until its tail is `clearance` past it, and a waiting train stops `clearance` short. Also fixed: (1) `CAR_LENGTH_TILES` 0.3 → 0.481 (its drawn length + coupler gap; the sim's tail used to be ~0.7 tile short of the drawn one); (2) a train remapped after a track change recorded its block entry mid-block, so a follower did not see a leader that entered the block whole; (3) a follower keeps seeing a leader that has turned off at the block's end junction while the leader's tail is still on the line.
- [Phase 27 D] §8/§9 the first decades are playable: track/station/locomotive upkeep is × 0.4 in 1830 easing to 1× by 1850 and passenger/mail fares × 1.8 in 1830 easing to 1× by 1845 (`earlyUpkeepFactor`, `earlyFareFactor`; a longer premium pushed the 1848-calibrated Phase 7.1 passenger acceptance ranges out of bounds); freight unchanged. Phase 28A retunes the early era on top of this. Toasts are laid out over the map area only (never over an open panel or the tool column); a failed name lookup in news/train text reads "a train", "a station", "a nearby town" or "the line", never "?".

- [Phase 28A] §7.5: platforms limit simultaneous **loading**, not entry — the destination-slot departure rule is gone; a train arriving at a full station waits in its yard (FIFO) and a train standing in a station drops the blocks its tail holds; junction claims are released before trains are stepped and go to the longest waiter. Fixes the hold-and-wait deadlock (PLAYTEST-1 Bug 1/2) and the "moving at speed 0" trains (Bug 4: a parked `noRoute` train no longer hops along a dead-end stub beside its station).
- [Phase 28A] §6.2: Engine Sheds can be built at any station ($30k, era-scaled and × the build-cost multiplier); §9.5b/§9.6: Economic model v2 replaces the flat multipliers — fares and freight rates follow real-terms curves, wages outrun prices, crews scale with the train, track wear, engine complexity, repair call-outs by distance, property and income tax, road and air competition. Hard no longer has a revenue penalty (was ×0.8): it is a ×1.6 tax schedule, 8 % interest, ×1.2 build cost, ×1.5 breakdowns. Easy: ×0.6 taxes. The Phase 27 D stopgap helpers were removed.
- [Phase 28A] §11: goal thresholds re-set from the new economy (`tests/sim/referenceOperator.ts`): Annual revenue $2.5M by 1880 (us-east silver, was $5M), Net worth $15M by 1870 (gb gold, was $5M), Net worth $150M by 1930 (central-eu gold, was $30M), Annual revenue $3M by 1900 (us-west gold, was $10M), Electrify 120 tiles (600 km) by 1930 (central-eu silver; "200 tiles" of the old 10 km grid is 400 tiles today). Random-map gold goals: net worth 40× (was 20×) / annual revenue 3× (was 5×) the starting cash.
- [Phase 37] §11: central-eu gold Net worth $150M -> $260M by 1930 and us-west gold Annual revenue $3M -> $4.5M by 1900, because the 35D waiting rule lifted the reference operator ~2x; the gold calibration floor is 0.8 again.
- [Phase 28A] §7.7: the Early Electric is 110 km/h (was 90) with ~30 % lower running cost, and electric engines cause 20 % less rail wear, so electrification pays. Frontier villages (§8.3, Phase 26A) now need trains that actually *stop* at the station (not just orders), and grow in a railway boom (+5 % per four served months) until they are towns.
- [Phase 29 A] §5.1/§7.5 junction connectivity is **explicit** (`src/sim/track/routes.ts`): each node stores the pairs of legs (neighbour tiles) trains may run between; `TrackGraph` holds them (`explicitRoutes`), saves carry them as `nodeRoutes` (no version bump; saves without it derive the routes of every junction from the old geometry rules on load, so behaviour is unchanged). A build adds routes for every new leg (legs within 45° of another leg; if the node becomes a crossing of two straight pairs a new leg only gets its straight route) plus the routes the drag passes through, and never removes one — so a line joining a turnout from the other side gives a diamond with a single slip and the turnout keeps working. Bulldozing an edge drops the routes through it. The pathfinder checks `hasRoute` (stations keep the geometry rule plus reversal); the renderer draws one connector arc per route (a slip is the same arc as a turnout). Interlock/conflict groups are unchanged: a junction node is still one conflict point, which already excludes every pair of crossing routes. `setNodeRoute` (command) adds/removes a route, e.g. a double slip; there is no Track-mode UI for it yet.
- [Phase 29 B] §6.1 a station can be demolished from its Build tab (two-tap, refund as for the Bulldoze tap, `demolishStation`): trains stopping there lose the stop from their orders instead of blocking it, cargo waiting there is lost, a news line reports it, and a train left with fewer than two stops is flagged in the stuck indicator. Only the last Engine Shed is refused. The Bulldoze tap still refuses while trains stop there.
- [Phase 29 C] §7.1/§10 adding stops by tapping the map is on by default in the buy-train route step and in the train panel's Route tab (the button toggles it off); picking stays active after each tap, a tap on the same station twice in a row adds one stop, and a ring pulses on the map and the new row.
- [Phase 29 D] §6.3 demand tiles in a station's Cargo tab show an industry badge (anchor for a Port) when only industries accept the cargo there, and tapping one says who accepts it ("Accepted by: Barbridge Port (export)" / "(city)"); a train queued for a platform says how many trains are ahead of it in the yard.
- [Phase 30A] §9.5c (new): waiting passengers/mail give up instead of hitting a cap and a Warehouse stores freight only; mail supply ×0.213; land and way-leave in every build (city premium follows an urbanisation curve, open country follows prices); leverage-based interest and earnings-based credit; track wear renewal with slow orders and `relayTrack`; locomotive ageing and `overhaulLocomotive`; passing loops and departure spacing; servicing by kilometres; goal land grants; persistent bridge washouts with `rebuildBridge`; induced passenger traffic before 1900. §9.1 credit limit and interest text, §9.6 table rows (leverage premium, land) updated. §11: gb gold goal is $20M by 1870 (was $15M, the induced-traffic economy puts an able player higher); random-map gold goals are net worth 60× (was 40×) and annual revenue 4.5× (was 3×) the starting cash.
- [Phase 30A] Deviation from the PLAN text: PLAN says the order option is "per-train or per-line"; it is per stop (`TrainOrder.minGapDays`), which covers both. PLAN says interest premium "grows with debt ÷ net worth": implemented as debt ÷ (net worth + debt) so it stays in 0–1 when net worth is small or negative.
- [Phase 45] New §11b Contracts. Old saves load with no contracts (the first offer comes after a year of play). Contract money is outside the ledger.
