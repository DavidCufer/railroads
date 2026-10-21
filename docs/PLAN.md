# Railroads — Build Plan

Build the game described in `docs/SPEC.md` in the phases below, **one phase per session**.
Each phase ends with a working, committed game that is better than before.

## How to run a phase (for the implementing model)

1. Read `CLAUDE.md`, `docs/SPEC.md` (at least the sections listed for the phase), this file, and
   `docs/PROGRESS.md`.
2. Implement **only** the current phase. Don't build ahead, except for small stubs a later phase needs.
3. Meet every acceptance criterion. Add the listed tests. Run `npm run check` (typecheck + lint + unit
   tests) and `npm run e2e` before committing.
4. Tick the phase's checkboxes here, and append a short entry to `docs/PROGRESS.md`: what was built, key
   files, known issues, screenshots saved under `docs/screenshots/phase-N-*.png`.
5. If you had to deviate from the SPEC, add a line to the "Deviations" section in SPEC.md.
6. Commit with the message `Phase N: <title>` and push.

Phases are sized for a single Sonnet session each. If a phase is running long, finish a coherent subset,
record what's left in PROGRESS.md under "Carry-over", and stop cleanly (tests green).

---

## Phase 0 — Project scaffold
SPEC: §1

- [x] Vite + TypeScript (strict) project, `index.html` with a full-screen canvas + a `#ui` overlay div.
- [x] Folder layout from SPEC §1 with placeholder `index.ts` files.
- [x] ESLint (typescript-eslint, flat config) + Prettier. Add an ESLint rule (`no-restricted-imports`) so `src/sim/**` can't import from `src/render/**` or `src/ui/**`.
- [x] Vitest configured; one sample test for `sim/rng.ts` (seeded PRNG: same seed → same sequence).
- [x] Playwright configured to use Chromium at `/opt/pw-browsers` (`executablePath` fallback), starting `vite preview`. One smoke test: the page loads, the canvas exists, no console errors, screenshot saved.
- [x] npm scripts: `dev`, `build`, `preview`, `typecheck`, `lint`, `test`, `e2e`, `check` (= typecheck + lint + test).
- [x] Game loop skeleton: `requestAnimationFrame` render loop + fixed-timestep sim accumulator (SPEC §3), drawing a placeholder background and an FPS counter (dev only).
- [x] GitHub Actions workflow `ci.yml`: install, `npm run check`, `npm run build` on push/PR.
- [x] `.gitignore` (node_modules, dist, android build outputs, tools/mapgen/.cache, test-results).

**Accept:** `npm run check`, `npm run build`, `npm run e2e` all pass locally; CI workflow file is valid.

---

## Phase 1 — Map model, random generator, terrain rendering, camera
SPEC: §4.1, §4.2 (terrain, rivers only — no cities/industries yet), §10.3, §10.4

- [x] `GameState` with the map (typed arrays for terrain/elevation/flags), and `rng` state.
- [x] Random map generator: elevation noise, sea level by land fraction, terrain, rivers, lakes. Deterministic by seed.
- [x] Terrain renderer with chunk caching, hillshading, soft terrain blending, rivers, water shimmer (SPEC §10.3 palette).
- [x] Camera: pan (one-finger drag / mouse drag), pinch zoom and wheel zoom around the focal point, clamped to the map; inertia on pan release is nice-to-have.
- [x] Low-zoom overview style (< 0.5×).
- [x] Debug hook: `window.__game` exposes state + helpers when `?debug=1` (used by e2e tests).
- [x] Temporary debug controls (dev only): regenerate with a new seed, map size.

**Tests:** generator determinism (same seed → identical arrays), land fraction within ±5% of target, every river ends in water or a lake, no NaN elevations.
**E2E:** screenshots at zoom 1, 0.5 and 0.25 for seed 12345 → `docs/screenshots/phase-1-*.png`.
**Accept:** 60 fps pan/zoom on a Large map in desktop Chromium (log average frame time in the e2e test and assert < 16 ms).

---

## Phase 1.1 — Fix rivers and terrain visuals (review findings on Phase 1)
SPEC: §4.2 step 3, §10.3

Review of the Phase 1 screenshots found that rivers render as triangles, "Y" shapes, short zig-zag stubs, and
isolated 1-tile lakes, and that terrain reads as hard pixel squares with barely any hillshading.

Root causes:
- `src/sim/map/rivers.ts` traces steepest descent on the **quantized 0–9** elevation. That produces big
  flat plateaus, so rivers hit "no strictly lower neighbor" almost immediately, random-walk (`escapeOptions`),
  and `makeLakeAt` drops single-tile lakes.
- `drawRivers` in `src/render/terrain.ts` draws a segment from each river tile to *every* neighbor that is
  river/water, so adjacent river tiles form triangles and an X/Y mesh instead of one polyline.

Fixes:
- [x] Keep the continuous (float) elevation field from generation (a `Float32Array`, not persisted to saves
      later; it's fine to keep on `GameMap` for now) and do river routing on it. Use **priority-flood depression
      filling** (e.g. Barnes et al. 2014 "Priority-Flood + ε") on the float field so every land tile has a
      downhill path to water. Then each river follows the filled field's steepest-descent (D8) neighbor.
      There are no random walks. Lakes form only where the fill raised a depression by more than a threshold, and
      each lake must be at least 4 tiles (flood the depression area below the spill level); never 1-tile lakes.
- [x] Store the river as an explicit **downstream pointer** per river tile (`riverNext: Int32Array`, −1 = none). Record
      flow accumulation, and merge tributaries into the existing river (stop tracing when you join one, and add flow downstream).
- [x] Choose sources so rivers are meaningful: start in hills/mountains, require a minimum path length of 12 tiles to
      reach water (skip sources that are too short), and keep sources ≥ 10 tiles apart. Target 4–12 rivers per map as before.
- [x] Renderer: draw each river as **one smoothed polyline** following `riverNext` (tile center → tile center, with
      quadratic-curve smoothing through midpoints). Width scales with flow (e.g. 2 px at the source up to 6 px at zoom 1). It ends
      *into* the water tile's edge. Don't draw river tiles as blue squares; the tile keeps its land color underneath.
- [x] Terrain look (SPEC §10.3 "soft transitions, not hard squares"):
  - Hillshading must be clearly visible: compute it from the **float** elevation (per-pixel or per-quarter-tile bilinear
    interpolation inside the cached chunk), light from NW, strength noticeably stronger than now.
  - Blend terrain borders: for each tile edge/corner shared with a different terrain, feather the neighbor color across
    ~30% of the tile with a noise-jittered edge, so forests, hills and deserts get organic outlines, not stair-steps.
  - Forest: draw small tree clusters (2–4 dark-green circles with a darker shadow offset) instead of a flat dark tile.
  - Hills: soft darker/lighter bumps; mountains: small peak triangles with a light NW face and a dark SE face, snow caps only on
    elevation 9 (and not as white squares).
  - Coastline: smooth the land/water edge (marching-squares style or per-corner rounding) with a lighter shallow band.
- [x] Performance must stay within the Phase 1 budget (the e2e render-time assertion still passes).

**Tests (replace the weak river test):**
- [x] Every river is a single downstream chain: following `riverNext` from any river tile reaches a water tile within
  width+height steps, with no cycles.
- [x] Each river tile has at most 1 downstream and the elevation along a river (filled field) is non-increasing.
- [x] There are no water bodies smaller than 4 tiles, other than the sea.
- [x] Across 15 seeds: ≥ 4 rivers per Medium map, each with a length of ≥ 12 tiles.

**Screenshots:** regenerate `docs/screenshots/phase-1-*.png` (same seed 12345) plus a `phase-1.1-closeup-zoom2.png`
centered on a river mouth. Look at them yourself before committing and describe what you see in PROGRESS.md.

**Accept:** rivers read as continuous blue curves from the hills to the sea/lakes; no triangles or stubs; terrain looks
blended and shaded rather than like a pixel grid.

---

## Phase 2 — Android shell & APK pipeline (early, so it can be tested on a phone)
SPEC: §1, §10 (safe areas, landscape)

- [x] Add Capacitor (`@capacitor/core`, `@capacitor/android`, `@capacitor/app`), `capacitor.config.ts` (appId `com.railroads.game`, appName "Railroads"), generate `android/`.
- [x] Lock orientation to landscape, fullscreen/immersive, keep screen on while playing (optional plugin, or skip if it adds complexity), handle safe-area insets in CSS.
- [x] Android back button: closes the top panel/dialog; if none, asks "Exit game?".
- [x] Simple generated app icon (draw a locomotive silhouette with a script → PNGs at required densities), and a splash color.
- [x] GitHub Actions workflow `android.yml`: on push to any branch and manual dispatch, set up JDK 17 + Android SDK, `npm ci && npm run build && npx cap sync android && cd android && ./gradlew assembleDebug`, upload `app-debug.apk` as an artifact.
- [x] README section: "Install on your phone" (download the artifact from Actions, enable unknown sources, install).

**Accept:** the workflow is syntactically valid and (after push) produces an APK artifact; the web build still passes all checks. Note in PROGRESS.md whether the Actions run succeeded; if it can't be verified from the session, say so explicitly.

---

## Phase 3 — Cities and industries on the map
SPEC: §4.2 steps 4–6, §8.2, §8.3 (placement, rendering, info only — no economy yet)

- [x] Data tables in `src/data/`: cargo types (§8.1), industries (§8.2), city tiers (§8.3).
- [x] Generator places cities (names from a syllable generator) and industries with the terrain affinities; playability check.
- [x] Render cities (roof clusters by tier, labels scaled by tier and zoom) and industry icons.
- [x] Info mode: tap a city/industry → right-side panel with basic info (name, tier/pop, produces/accepts).
- [x] UI framework basics: the `h()` helper, panel container with slide-in/out, close button, toasts, `strings.ts`.
- [x] Top bar with the date (static for now), a cash placeholder, and speed buttons wired to the sim loop (the calendar advances).

**Tests:** city spacing rule, industries placed only on allowed terrain, deterministic placement.
**E2E:** tap a city → panel shows its name; screenshot.

---

## Phase 4 — Track building
SPEC: §5 (all), §9.1 (starting cash), §9.5, §12 (commands)

- [x] Track graph data structure (nodes = tiles, edges with double/electrified/bridge), with efficient add/remove and adjacency queries.
- [x] Cost calculator (terrain multipliers, diagonal, grade, bridges by era, inflation, difficulty).
- [x] `commands.ts` with `buildTrack`, `bulldoze` (with validation + reasons).
- [x] Build toolbar; Track mode with drag → A* ghost path, green/red coloring, 45° turn markers, cost label, confirm bar (and the Quick build setting).
- [x] Bridge auto-selection and tap-to-cycle bridge type in the confirm bar; bridge rendering by type.
- [x] Double mode (upgrade), Bulldoze mode (25% refund).
- [x] Two-finger pan while in build modes.
- [x] Track rendering cached per chunk (ties at zoom ≥ 1, lines at low zoom, double = parallel).
- [x] Cash shown and deducted; can't build when unaffordable (red + reason toast).

**Tests:** cost calculations (table-driven, incl. bridges, grades, diagonals), build/bulldoze round-trip, the turn-rule traversal function, can't build on water without a bridge, water bridge length limits.
**E2E:** simulate a drag between two tiles in `?debug=1` mode, confirm, and assert the edges exist and cash decreased by the previewed cost.

---

## Phase 5 — Stations
SPEC: §6.1, §6.3 (supply/acceptance calculation; no cargo flow yet)

- [x] `buildStation`, `upgradeStation` commands; placement on track tiles; default naming.
- [x] Station mode with a catchment preview overlay and a supplies/accepts preview panel before confirming.
- [x] Acceptance-point calculation and supply-source calculation per station (cached; invalidated when stations/cities/industries change).
- [x] Station rendering by type (platform + building, bigger for terminals); station labels.
- [x] Station panel (name + rename, type, upgrade, supplies/accepts, placeholder for waiting cargo).
- [x] The first station built gets a free Engine Shed (flag only for now).

**Tests:** catchment radius per type, acceptance threshold (≥ 8 points), overlapping supply split, naming rules.

---

## Phase 6 — Trains: buying, orders, movement, blocks
SPEC: §7.1–7.5, §7.7 (roster data; availability by year)

- [x] Locomotive roster data table; available-by-year filter.
- [x] `buyTrain` (must be at a station with an Engine Shed), car selection, orders editor (tap stations on the map), per-stop loading rules (store them; loading comes in Phase 7).
- [x] A* routing over the track graph with the turn rule, wooden-bridge weight limit and electrification constraints; path cache and invalidation on track change.
- [x] Movement with the speed model (grade, curves, acceleration), reversing at stations.
- [x] Block partitioning; single/double-track reservation rules; station capacity; waiting at boundaries; deadlock timeout rerouting; ⚠ for no-route/jams.
- [x] Train rendering: loco by type (steam smoke puffs, diesel hood, electric pantograph) + cars colored by cargo, rotated along the track, smooth interpolation between ticks.
- [x] Train panel (status, orders, consist), Train list, tap a train to select. Camera follow is a one-shot jump-to-train from the list, not a continuous locked-on toggle — see PROGRESS.md deviations.

**Tests:** pathfinding respects the 45° rule and constraints; two trains on a single-track line between two stations never occupy the same block; the same on double track allows opposing movement; a deadlock scenario triggers a reroute or warning within the timeouts; the speed model on a grade.
**E2E (debug hooks):** build a small line, buy a train, run 30 in-game days at 8×, assert the train visited both stations; screenshot.

---

## Phase 7 — Cargo flow and economy
SPEC: §6.3, §7.2 (loading rules), §8.1 (revenue), §8.2 (processing), §8.3 (city supply), §9 (finance)

- [x] Daily production accrual to stations, storage caps, waiting-cargo decay.
- [x] Loading/unloading with time cost (station type, train length), Auto / Full load / Unload only / Pass through rules.
- [x] Revenue formula with the time factor; floating `+$` labels; per-train revenue stats.
- [x] Processing chains (steel, lumber, food, goods, fuel) with a monthly processing step.
- [x] Finance: monthly maintenance (trains, track, stations), loans (borrow/repay, credit limit, interest), ledger by category, net worth, bankruptcy rules by difficulty.
- [x] Finance panel with the ledger table and a cash/net-worth line chart; yearly report dialog.
- [x] Station panel shows waiting cargo bars; train panel shows the current load.

**Tests:** the revenue formula (table-driven), processing (steel needs both inputs), a loan/interest schedule, bankruptcy sequence, a deterministic 1-year simulation snapshot test (same seed + command log → same cash).
**Accept:** a hand-built coal mine → steel mill route plus a two-city passenger route are profitable within 2 in-game years at Normal difficulty (checked in a test). Tune the numbers in the data tables if not, and note the changes as Deviations.

**Done.** See PROGRESS.md for the balance table, screenshots, and deviations (car-type-per-cargo
simplification, single freight ledger bucket, a couple of undocumented default constants).

---

## Phase 7.1 — Balance and UI fixes (review findings on Phase 7)
SPEC: §8.1, §8.2, §9, §10.2

Review of the Phase 7 balance table: one 12-tile passenger shuttle earns ~$519k/yr on $74k of capital (half the
starting cash every year from one train), while a coal route earns ~$62k/yr. Passengers are ~8× more lucrative than
freight, so freight is pointless and the early game has no challenge.

Targets at Normal difficulty in 1830–1850 (encode as tests in `balance.test.ts`, replacing the loose upper bound):
- [x] A good early passenger route between two towns/cities (12–20 tiles) earns **$80k–$200k profit/yr** per train.
- [x] A good freight route (coal mine → steel mill, 12–20 tiles, full loads) earns **$40k–$120k profit/yr** per train;
      a complete chain (coal+ore → steel → factory → goods to a city) should be *more* profitable per train than a
      passenger shuttle, rewarding building networks.
- [x] Passenger/freight profit per train ratio for comparable routes should be within **1×–2.5×**.
- [x] With ~5 trains on well-chosen routes, cash should roughly double in 3–5 years, not every year.

How: tune data tables only (e.g. passengers base rate ↓, raw industry production ↑ so freight trains fill up, city
passenger supply per population ↓ or capped per station, freight base rates ↑). Keep the formulas. Record each
changed number as a SPEC Deviation and put a new balance table in PROGRESS.md.

UI fixes:
- [x] Finance panel: scrolled body content draws over the panel header ("Credit limit" overlaps the "Finance"
      title; Borrow button half-hidden — see docs/screenshots/phase-7-finance-panel.png). Give every panel a fixed
      header, a scrolling body (`overflow:auto`, `min-height:0` in the flex column), and a pinned footer; check
      *every* panel (station, train, buy train, city, industry, finance, yearly report) at 800×360.
- [x] The floating "+$2k" delivery label is dark text on green and barely readable (phase-7-delivery-label.png). Use
      bold white or cargo-colored text with a dark outline/halo, slightly larger, rising and fading.

**Accept:** balance tests green with the targets above; screenshots of every panel at 800×360 with no overlap.

---

## Phase 8 — Eras and technology
SPEC: §3, §5.3 (era-gated bridges, electrification), §7.6, §7.7, §9.5

- [x] Year-gated availability everywhere (locos, bridges, electrification, cargo types like oil/fuel, improvements).
- [x] Electrify mode + electric-loco route constraints + catenary rendering.
- [x] Breakdowns, aging, obsolescence, steam phase-out rules; Replace Loco with trade-in.
- [x] Water tower rule for steam.
- [x] News system: messages (new tech, breakdowns, washouts, jams, city growth) → toasts + a News panel with history and an unread badge. (City growth messages are Phase 9's job — no growth model exists yet.)
- [x] Wooden bridge washout events.
- [x] "New!" badges in the buy dialog; a technology section in the yearly report.

**Tests:** availability by year, breakdown probability formula, trade-in value, steam can't be bought after 1960, electric locos refuse non-electrified routes.

---

## Phase 9 — Upgrades and growth
SPEC: §6.2, §8.2 (industry dynamics), §8.3 (growth, civic investment)

- [x] All station improvements with their effects wired into the economy and train logic.
- [x] City growth model, footprint expansion (new tiles re-rendered), tier changes with news.
- [x] Civic Investment command + button in the City panel.
- [x] Industry growth/shrink/new-industry spawning.
- [x] Overlays: all catchments, cargo supply heatmap, track type colors, train profit colors.
- [x] Mini-map.

**Tests:** each improvement's effect (table-driven), city growth threshold crossing, civic investment cooldown, industry dynamics bounds (0.5×–3×).

---

## Phase 10 — Real-world maps and the new game screen
SPEC: §4.3, §4.4, §11

- [x] `tools/mapgen` pipeline (Node script, `npm run mapgen -- <regionId>`), with a Natural Earth download + cache; hand-authored fallback polygons if the network is blocked (record which was used in PROGRESS.md).
- [x] Region definitions for `us-east`, `gb`, `central-eu`, `us-west` (cities with real coordinates and start tiers, mountain features, resource zones, founding years for cities founded after the start year).
- [x] Generated JSON committed under `src/data/regions/`; the loader turns it into `GameState`.
- [x] Cities with a founding year appear when that year arrives.
- [x] New game screen: Real World tab (cards with thumbnails) + Random tab (all options) + difficulty.
- [x] Goals system (data-driven goal types), per-region goal sets, generated goals for random maps, Goals panel, celebration dialog.
- [x] Title/main menu screen: New Game, Continue, Settings. **Deviation**: no separate "Load" entry —
      there's no save system yet (Phase 11), so Continue is a single disabled placeholder rather than
      a real Continue/Load split; Phase 11 adds both once saves exist.

**Tests:** each region loads; city positions are within ±1 tile of their projected lat/lon; key cities are on land; the goal evaluators.
**E2E:** screenshot of each region at overview zoom → `docs/screenshots/phase-10-<region>.png`. Eyeball these for recognizability and note any issues.

---

## Phase 10.1 — Real-world terrain breadth (review findings on Phase 10)
SPEC: §4.3

Review of docs/screenshots/phase-10-*-full.png: maps are recognizable (coasts, lakes, cities, Great Basin desert), but
mountain ranges are drawn as 1–3-tile stripes, so they don't read as ranges and barely matter for gameplay (grades,
costs). Rivers aren't visible at overview zoom.

- [x] Mountain features become broad bands with a core + falloff: core width (mountain) and a wider hills margin,
      with noise-jittered edges and elevation peaking along the ridge line. Targets (in tiles, roughly real-world
      widths at each region's scale): Appalachians ~10–16 wide (Blue Ridge/Allegheny ridges as mountain cores, the rest
      hills), Rockies ~20–40 wide covering most of Colorado/Wyoming/Idaho/W Montana with multiple parallel ranges,
      Sierra Nevada ~6–10, Cascades ~6–8, Wasatch ~4–6, Alps ~15–25 (Switzerland/Tyrol/Carinthia mostly mountains,
      snow on the highest core), Carpathians/Bohemian Forest/Black Forest as hills bands, Pennines/Scottish
      Highlands/Welsh mountains as hills with mountain cores.
- [x] Add a few missing lakes: Lake Geneva, Lake Constance, Lake Balaton, Lake Champlain, Lake Tahoe (if not already
      from Natural Earth).
- [x] Draw major rivers at overview zoom (< 0.5×) as thin blue lines (Mississippi, Ohio, Hudson, Potomac, Columbia,
      Colorado, Rhine, Danube, Elbe, Po, Thames, Severn...), since those guide where players build.
- [x] Regenerate the region JSON (keep it deterministic and < 300 KB each), regenerate the four full-region
      thumbnails and the New Game card thumbnails, look at them, and describe honestly in PROGRESS.md.
- [x] Keep every existing test green (region load, city-on-land, goals).

**Accept:** in each full-region thumbnail, the named ranges are visibly broad bands and major rivers are visible.

---

## Phase 11 — Save/load, settings, polish
SPEC: §13, §10 (remaining UI), §3

- [x] Save serialization with versioning + a migration scaffold; IndexedDB storage; 3 rotating autosaves + 5 manual slots; autosave on app pause.
- [x] Load screen with slot details; Continue = latest save.
- [x] Settings screen (units, quick build, sound, grid, UI scale).
- [x] First-game hints: a lightweight, dismissible tip sequence (build track → station → train → earn), not a blocking tutorial.
- [x] Optional WebAudio sounds (whistle, chug, cash ding), off by default if they're annoying.
- [x] Visual polish from reviews: station improvement icons are tiny at zoom 2 (make each improvement a clearly visible small building/sign next to the station); cities still look like grids of rectangles — add varied roof shapes/sizes, slight rotation jitter, and green gaps/trees between blocks.
- [x] Smooth coastlines/lake shores (true marching-squares contour instead of per-tile steps; carry-over from the Phase 2 review).
- [x] UI pass on a phone-sized viewport (800×360): no overlapping panels, 44 px targets, readable text.

**Tests:** a save → load round-trip produces deep-equal state, and continuing the simulation afterwards gives identical results to never saving; migration from a fake v0 fixture.

---

## Phase 12 — Performance and release hardening
SPEC: §10.4

- [x] Stress scenario (Large map, 60 trains, 1,500 track edges) in debug mode; measure sim tick and frame time in e2e; optimize until the targets are met (path caching, block lookup, chunk caching, avoid per-frame allocations).
- [x] Memory check: no unbounded growth over 20 in-game years at 8× (news history capped, charts downsampled).
- [x] Error boundary: an uncaught exception shows a "Something went wrong — Save & Reload" dialog and writes an emergency save.
- [x] Release build config: minified, source maps off in the APK, versionCode/versionName from package.json; an optional signed-release workflow using repository secrets (document the setup; don't commit keys).
- [x] Final README: features, how to play, how to build, how to install.

**Accept:** targets met in desktop Chromium with 4× CPU throttling (Playwright CDP) as a proxy for a mid-range phone; APK artifact builds in CI.

---

## After v1 (ideas, not scheduled)
Tunnels; more regions (Japan, Scandinavia, the Iberian peninsula, India); a scenario editor; transfers
between trains; seasonal effects; achievements.

---

## Phase 13 — Map visuals: top-down trains and curved track
STYLE: docs/STYLE.md §7

- [x] Shared render-side path geometry module (e.g. `src/render/trackPath.ts`): straight segments + circular fillet
      arcs at 45° direction changes (radius ≈ 1.2 tiles, clamped), with `pointAt(distance)` / tangent sampling.
- [x] Track renderer draws rails and ties along this geometry (single, double, bridges, electrified catenary poles
      follow curves); junction through-routes stay straight.
- [x] Train renderer places every vehicle (loco, tender, cars) on the same curved path at its own offset behind the
      head, rotated to the local tangent — no more pivoting at tile centers.
- [x] New top-down vehicle drawings per STYLE §7 (steam/diesel/electric locos, tender, each car type, loaded vs
      empty). Drawn as vector shapes every frame rather than cached per type+rotation bucket — see Deviations.
- [x] A* track preview: penalize consecutive 45° turns (zig-zags).
- [x] Performance stays within the Phase 12 stress-test budget.
**Screenshots (look at them):** each loco type + a mixed freight consist on a straight and on a curve at zoom 2;
an S-curve; a junction; double-track curve; a bridge on a curve.

## Phase 14 — UI restyle, welcome screen, cargo icons
STYLE: docs/STYLE.md §1–6

- [x] `src/ui/theme.css` with the tokens; migrate all existing inline/ad-hoc styles to tokens; remove emoji from UI.
- [x] `src/ui/icons.ts`: tool icons + 13 cargo pictograms (STYLE §5); use them in toolbar, floating buttons, panels,
      and station supply bubbles on the map where applicable.
- [x] Restyle every panel/component per STYLE §3 (panel header, buttons, 2-column action grids, chips, segmented
      controls, top bar, toolbar, floating buttons, toasts).
- [x] City / Station / Industry panels per STYLE §6: supplies/demands as pictogram chips at the top; actions last,
      in 2-column grids.
- [x] Welcome screen and New Game screen per STYLE §4 (live panning map background with a moving train).
- [x] Everything fits 800×360; 44px targets; existing e2e selectors updated rather than tests deleted.
**Screenshots (look at them):** welcome, new game (both tabs), city panel, station panel, industry panel, finance,
train panel, buy-train dialog, top bar + toolbar in-game — all at 800×360.

---

## Phase 15 — Play-test fixes: signaling, consist editing, train drawing
SPEC: §7.5 (rewritten), §7.1–7.2; STYLE: §7

Player report: a train got stuck ⚠ at "Pittsburgh Coal Mine" (a Depot on a single-track line shared with a second
train). Cause: Depot capacity 1 + trains allowed to wait *in the block before a full station*, so the train in the
station can't leave (its exit block is occupied by the waiting train) → deadlock.

- [x] Implement SPEC §7.5 as rewritten: waiting only at stations; atomic station-to-station path reservation with
      direction; same-direction following with spacing/braking; station slots Depot 2 / Station 3 / Terminal 5;
      through-station passing; releases on tail exit; longer safety-net timeouts. Keep the sim deterministic.
- [x] Tests (must include): the exact reported scenario (two trains sharing a single-track line between two
      depots, opposite directions, 2 years at 8×: never stuck, both keep earning); 3 trains same direction on one
      single-track section follow each other without stopping; opposing trains on a line with a middle station
      pass there; a train never stops outside a station except behind a same-direction leader or breakdown;
      save/load mid-reservation is deterministic; the old deadlock regression tests still pass.
- [x] Train panel shows what a waiting train waits for ("Waiting for line clear to X", "Waiting for platform at X").
- [x] **Edit consist on an existing train**: in the Train panel, an "Edit cars" action (2-column grid style) opens
      the car picker with the current consist. Add/remove/reorder cars up to the loco's max. If the train is at a
      station the change applies immediately; otherwise it's queued and applied at the next station stop (panel
      shows "Changes apply at next station"). New cars are charged at car price; removed cars refund 50%. Cargo
      in removed cars is dropped at the station (counts as unloaded without payment unless accepted there). Goes
      through commands.ts with validation + tests.
- [x] Train drawing fixes (STYLE §7): the steam chimney is drawn sticking out sideways — draw it as a dark circle
      on the boiler's centerline near the front (with a tiny lighter rim), smoke rising from there; same for the
      dome. Reduce gaps: tender tight behind the cab, ~1px coupler gap between all vehicles at zoom 1 (scale
      with zoom), no big space between loco and first car. Make vehicles ~20% larger so they read at zoom 1.
- [x] Station supply bubbles above stations render as plain colored circles without their pictograms (see
      player screenshot) — draw the cargo pictogram inside, or remove the bubbles if they add nothing.
- [x] Bottom-right: a round floating button overlaps the "Quick build" toggle — fix the layout at 800×360 and at
      a real phone ratio (e.g. 2400×1080 CSS scaled, ~890×400).
**Screenshots (look at them):** two trains passing at a middle station; a waiting train with its reason in the
panel; the consist editor; steam/diesel/electric trains at zoom 1 and 2 (straight + curve); bottom-right buttons.

---

## Phase 16 — Play-test 2: double track, understandable cargo units, partial loads
SPEC: §5.1, §6.3, §7.1–7.2, §8.1; STYLE §7

Player report (screenshots of Trieste/Ljubljana, 1840):
1. Double track is drawn huge and ugly (two full-size tracks far apart); single↔double transitions splay
   awkwardly; **trains run on the centerline between the two tracks and pass *through* each other**.
2. "I don't understand the passenger numbers: the city shows an absolute number, the station a per-month number.
   How many passengers does a car take? Why do cars always say empty?"
   Root cause (reviewer): cars only load when a full carload (`CARLOAD_UNITS` = 20 abstract units) is waiting,
   while a town station supplies ~5.7 units/month and waiting passengers decay after 10 days → the pile never
   reaches 20 → passenger cars always leave empty.

### A. Double track rendering + lanes
- [x] Draw double track as two normal-gauge tracks with realistic spacing: rail gauge and tie length the same as
      single track, track centers ≈ 0.28 tile apart (so the pair is only slightly wider than one track), shared
      ballast bed. Curves: two concentric arcs.
- [x] Single↔double transitions: draw a proper turnout — one track continues straight on the centerline side, the
      second track diverges with a gentle S-curve over ~1 tile. No splayed/crossing ties.
- [x] Trains on double track run in their **own lane**: offset from the centerline by half the track spacing,
      right-hand running per direction of travel (consistent for the whole network); lane offset eases in/out over
      the turnout. Opposing trains on double track visibly pass side by side, never overlap.
- [x] Trains on single track stay on the centerline. Stations: trains stop on their lane.

### B. Real, understandable cargo units + partial loading
- [x] Every cargo gets a real unit and per-car capacity in `src/data/cargo.ts`: passengers (people, 40/car),
      mail (bags, 30/car), coal/ore/grain/wood (tons, 20/car), livestock (head, 15/car), oil/fuel (barrels,
      100/car), steel/lumber/food/goods (tons or crates, 20/car). Convert supply/production rates so that
      *carloads per month stay the same as now* (balance tests must stay green without retuning); convert
      revenue to per-unit (base per carload ÷ capacity).
- [x] **Partial loading**: under the Auto rule a car loads whatever is waiting (up to capacity) instead of only
      full carloads; revenue is paid per unit delivered. "Wait for full load" still waits until full (or max wait).
      Passenger/mail decay stays but trains now pick up what's there.
- [x] Re-run the balance tests; if partial loading shifts profits outside the Phase 7.1 targets, tune data
      tables and record deviations.
- [x] UI wording (strings.ts), consistent everywhere:
      - City panel: "Population 18,400" and under Supplies "Passengers 42 / month", "Mail 13 bags / month".
      - Station panel: Supplies as "per month" + a **Waiting** line per cargo ("12 passengers waiting").
      - Train panel: each car shows cargo + fill, e.g. "Passengers 28 / 40", "Coal 20 / 20 t", "Empty" only when
        truly empty; a small fill bar per car.
      - Buy train / edit consist: show capacity per car type ("Passenger car · 40 seats").
      - Delivery label: "+$1.2k · 28 passengers".
- [x] Save migration for the new unit fields; determinism tests stay green.

**Tests:** a small town (≈5 passengers/month) served by a train every ~10 days produces non-empty passenger
loads and revenue; partial loads pay proportionally; full-load rule still waits; double-track lane offset puts
two opposing trains' vehicles ≥ 0.2 tile apart when passing (render-geometry unit test); balance tests green.
**Screenshots (look at them):** double track straight + curve + turnout with two trains passing at zoom 2;
single↔double transition; city / station / train panels showing the new units.

---

## Phase 16.1 — Double track at stations and turnouts (play-test 3)
STYLE §7

Player screenshots (Ljubljana, Trieste, 1840): where double track meets a station, the two tracks pinch together
in a sharp kink right at the station tile, ties cross over each other in a messy fan, and on curves near stations
the rails overlap. It "looks weird".

- [x] **Stations on double track are passing loops**: if any double-track edge touches a station tile, draw the
      station with **two parallel platform tracks** straight through the station tile (lane spacing as elsewhere),
      the platform/building beside them (never under the rails). Trains stop on their own lane's platform.
- [x] **Double → single transitions happen outside the station**: when a station has double track on one side and
      single on the other, draw the turnout on the *single* side, starting at the station edge and completing over
      ≥ 1.5 tiles with a smooth S-curve (no kink). Same for single↔double transitions mid-line.
- [x] **Ties drawn once**: in turnouts and where the two tracks converge, draw one shared set of ties spanning both
      rails (lengthening gradually), never two sets crossing each other.
- [x] **Curves adjacent to stations**: if a fillet arc would overlap the station tile, start the arc after the
      station edge (the station tile is always straight).
- [x] Trains follow the drawn geometry exactly (lane offsets ease through the turnout; no vehicle drawn off the rails).
**Screenshots (look at them critically and compare with the player's complaint):** a double-track line entering a
station straight, on a curve, a station with double on one side and single on the other, a mid-line
single↔double transition, and two trains stopped side by side at a double-track station — zoom 1.5 and 2.

---

## Phase 17 — Play-test 4: consist gaps, robust double-track geometry, tap targeting
STYLE §7

Player report (Trieste, 1840):
1. "There is still a gap between the train and the first car" — visible on the diagonal approach to Trieste (the
   loco+tender, then ~one car length of empty track, then the cars). On straight horizontal track the coupling is
   tight, so the consist spacing is probably computed in tile units without the diagonal/arc length (√2) or with a
   different path than the drawn one.
2. "Double tracks are still problematic at times" — a single↔double transition that lands on a curve next to the
   station produces crossing tie fans / an X-shaped mess. Previous fixes were special-cased; replace them with one
   general model.
3. "When adding a train I tap the town instead of the station and the whole menu changes. When clicking for info I
   hit the town instead of the station. A lot of clicking around to find the station."

### A. Consist spacing
- [x] One source of truth: every vehicle is placed by arc length along the *same* rendered lane path the rails are
      drawn from (straight segments √2-correct on diagonals, arcs by radius×angle). Coupler gap constant in screen
      px at a given zoom, identical on straight, diagonal and curved track.
- [x] Unit test: for a consist on a horizontal, a diagonal, and a 45° curve, the distance between consecutive vehicle
      ends is within ±0.5 px of the configured coupler gap at zoom 1 and 2.

### B. General track geometry model (render-side)
- [x] Build per-edge-chain **centerline paths** (straights + fillet arcs, as now). For each point along a chain define
      `laneOffset(s)` = 0 for single track, ±spacing/2 for double, and eased with a smoothstep over a ≥1.5-tile
      transition wherever single↔double changes. Transitions must not start on an arc: if one would, shift it onto
      the nearest straight part (or extend it across the arc with the offset easing continuously — pick whichever
      looks clean and document it).
- [x] Rails = offset curves of each lane centerline (±gauge/2). **Ties = one set per chain**, sampled at fixed arc
      spacing along the centerline, perpendicular to the local tangent, with length = span of all present lanes +
      overhang (so double track has long shared ties and turnouts have ties that lengthen smoothly). Never draw two
      overlapping tie sets.
- [x] Stations (passing loops), junctions and bridges use the same model. Trains use the same lane paths.
- [x] Remove the previous special-case turnout/station code paths once the new model covers them.
- [x] Screenshots to judge (zoom 1.5 and 2): the exact player situation (double track curving into a station whose
      other side is single), a double-track S-curve, a mid-line transition on a curve, a junction off double track,
      a double-track bridge. Compare against the player's screenshots in the description above; there must be no tie
      crossings anywhere.

### C. Tap targeting
- [x] Hit-test priority: trains > stations > industries > cities. Stations get a generous touch radius (≥ 28 CSS px
      around the station building/platform, or the whole station tile, whichever is larger) that wins over the city
      footprint.
- [x] Context-aware picking: while adding stops to a train's orders (buy-train or edit-orders mode), only stations
      are pickable; tapping a city selects the station serving it (if exactly one) or shows a small chooser if
      several; if none, a toast "No station in Trieste yet".
- [x] If two different kinds of objects are within the touch radius and neither clearly wins (e.g. a station and an
      industry), show a small chooser popup listing them (icon + name) instead of guessing.
- [x] City panel: "Served by" station names are tappable and open the station panel.
- [x] e2e tests for: tap on a station inside a city opens the station; in order-edit mode a tap on the city adds its
      station; the chooser appears for overlapping objects.

## Phase 18 — Play-test 5: sharp turns, phantom jams, warehouse hubs, industry chains
SPEC §4 (track), §5 (industries/cargo), §6 (stations), §7.5 (signaling)

Player report (Trieste–Ljubljana):
1. "I managed to do sharp turns by building rails in 3 parts. This should not be possible." Building one long drag
   rejects >45° turns, but a new segment that *joins existing track* at a node is not checked against the edges
   already there. `hasSharpJunction` (src/sim/track/turn.ts) is only a render marker.
2. "Trains ran OK for a while, then a phantom traffic jam near Trieste. The train Trieste→Ljubljana stopped moving."
   No visible blocker. Probably a leaked or stale reservation/slot (§7.5), or a train that can only reach its
   target through a sharp junction (1) and waits forever.
3. "Warehouse could be used so one train stores goods there that the city doesn't demand, so another train can pick
   them up." Today a Warehouse only doubles storage and stops decay.
4. "It is hard to produce goods: the factory needs steel, the steel mill needs coal, and there is none nearby."
   Generation places processors near cities without regard to where their inputs are.

### A. Sharp turns across existing track
- [x] `buildTrack` (commands.ts) validates every new edge against the **existing** edges at both of its end nodes:
      if the angle between the new edge and any existing edge that a train could traverse through that node is sharper
      than allowed (same rule as within one drag: >45° deflection), reject with `reason: "sharpTurn"`. Exception:
      station tiles (trains reverse there) keep the current behaviour. A junction where the new edge meets an existing
      edge at a sharp angle but forms a legal turn with *another* existing edge at the node is allowed (that is a
      normal turnout); only reject when the new edge would connect to nothing legally, or document the exact rule you pick.
- [x] Build preview shows the offending segment red with a short tooltip/toast (`strings.ts`).
- [x] Existing saves with sharp junctions still load; pathfinding already refuses sharp traversal, so routes that
      relied on them must be reported (see B), not silently stall.
- [x] Unit tests: three-part build that produced the player's hairpin is rejected; a normal Y-junction and a
      turnout off double track still build; a station tile still allows reversal.

### B. Phantom jams: diagnose, prevent, explain
- [x] Reproduce first. Write a randomized stress test (seeded, headless): several maps/seeds, 6–12 trains on mixed
      single/double track with shared stations, run ≥ 2 game years, assert invariants every day:
      (a) every reservation belongs to an existing train that is still going to use it; (b) station slot counts equal
      trains inside + trains reserved inbound; (c) no train waits > 10 days unless it is in a genuine wait-for cycle
      or its route is impossible. Keep the test under ~20 s; bigger variant behind an env flag.
- [x] Wait-for graph: every waiting train records *what* blocks it (train id + block/station). A jam is reported
      only when there is a real cycle. A wait with no live blocker is a bug: log it in debug, clear the stale
      reservation/slot, and let the train re-plan. Fix the root cause(s) the stress test finds; don't rely on the
      auto-clear alone.
- [x] Unreachable next stop (e.g. only via a sharp junction, track removed): train status "No route to X" instead of
      waiting silently; news message once.
- [x] Train panel status line says why it waits: "Waiting for Train 3 (single track to Ljubljana)",
      "Waiting for platform at Trieste", "No route to Ljubljana".
- [x] Debug helper: `?debug=1` → `__game.exportSave()` downloads the save JSON so the player can attach it to a report.

### C. Warehouse as a transfer hub
- [x] A station with a Warehouse accepts **any** cargo as a transfer drop, even if nothing there demands it. Unloaded
      transfer cargo stays in the station's stock keeping its **origin station and load day**.
- [x] Revenue is paid only at final delivery to a station that demands it, computed from origin → final destination
      distance and total elapsed time (SPEC revenue formula). Train that dropped it gets no income (show "Transferred"
      in the income popup); optionally credit a small share to the feeder train's stats only (no money). _(Optional part skipped.)_
- [x] Other trains load it like normal waiting cargo (partial loading rules apply). Order option per stop:
      normal / "unload all (transfer)" so a feeder can dump cargo the hub also demands.
- [x] Warehouse capacity limit applies; overflow is refused at unload (cargo stays on the train).
- [x] Station panel shows transfer stock separately ("Waiting for transfer: 40 t coal from Idrija").
- [x] Unit tests: coal A→Hub(warehouse)→B pays once at B with A→B distance; no pay at hub; decay rules; capacity.
      e2e: set up a two-train relay and verify income after delivery.

### D. Chain-aware industry placement and explanation
- [x] Map generation (random maps and region maps): for each processor, ensure at least one source of **each
      required input group** within a reasonable distance (data table in `src/data/`, e.g. 25 tiles): steel mill →
      coal mine AND iron mine; factory → steel mill OR sawmill (and that sawmill's forest); refinery → oil well, etc.
      Place missing producers on suitable terrain if possible; otherwise move the processor. Deterministic with the
      map seed. Region maps keep their hand-placed industries but get missing inputs added nearby.
- [x] Playability check (`economy/playability.ts`) includes: at least one complete chain to goods within reach of a
      starting city. _(Guaranteed by the chain pass and asserted in tests; deliberately not a city-retry trigger — see SPEC Deviations.)_
- [x] Industry panel: "Makes Goods from Steel **or** Lumber", "Needs Coal **and** Iron ore", with the nearest
      source of each input (name + distance, tappable to centre the map on it). Pictograms per STYLE.
- [x] Unit tests on several seeds: every processor has its inputs within range.

### E. Wrap-up
- [x] SPEC deviations recorded (sharp-turn rule, transfer revenue, chain placement distance).
- [x] Screenshots: rejected sharp join (red preview), train panel "Waiting for …", warehouse station panel with
      transfer stock, industry panel with inputs. Look at them.

## Phases 19–22 — "Engine shed" visual & UX update
STYLE Part 2 (§8–§11) is the design; builders apply it. Phases 19 and 20 run **in parallel** (different files);
21 and 22 run in parallel after both land. Parallel-session rules: before every push `git fetch origin main &&
git rebase origin/main`, re-run `npm run check` (and e2e before the final push), then `git push origin HEAD:main`.
Never force-push main. If e2e markup assertions must change, keep each test's intent (don't drop checks).
Commit only your own phase's screenshots.

## Phase 19 — Rolling-stock art (side views, liveries, smoke)
STYLE §9 · files: `src/render/art/**` (new), `src/render/trains.ts`, a small debug gallery page
- [x] `src/render/art/livery.ts`: per-model/era colour sets (STYLE §9.3); used by side views and map sprites.
- [x] Whyte parser + `wheelArrangementGlyph()` (inline SVG string).
- [x] Steam side views, parametric (§9.2): wheels/spokes/counterweights, rods, cylinders, boiler with era sizing,
      smokebox, chimney types, domes, bell/headlamp/pilot for American types, cab, tender variants; articulated.
- [x] Diesel and electric side views (§9.3), each roster model visibly distinct.
- [x] Car side views for every car type × era bucket, load heap by fill (§9.4).
- [x] `locoSideCanvas`, `carSideCanvas`, `consistSideCanvas` with caching (key incl. devicePixelRatio).
- [x] Map sprites refined with the shared liveries + zoom-dependent detail (§9.5); smoke/steam particle system
      (renderer-owned, pooled, capped, skipped when zoomed out). No fps regression on the stress e2e.
- [x] Debug gallery: `?debug=1&gallery=1` renders every locomotive (all 24) and every car type (3 eras, empty and
      full) on a light and a dark background, labelled — used for screenshots and review.
- [x] Unit tests (§9.1) + e2e screenshots: `phase-19-gallery-steam.png`, `phase-19-gallery-modern.png`,
      `phase-19-gallery-cars.png`, `phase-19-map-steam-smoke-zoom2.png`, `phase-19-map-diesel-zoom2.png`.
      **Open every screenshot** and fix anything that looks wrong (proportions, wheels floating, overlaps) before
      committing. A train enthusiast should recognise a 4-4-0 American, a 4-6-2 Pacific and a road switcher.

## Phase 20 — UI system v2 (chrome and non-train panels)
STYLE §8 · files: `src/ui/**` except the train/buy panels' inner content, `theme.css`, `strings.ts`
- [x] Tokens (§8.1) and components under `src/ui/components/` (§8.2): PanelHeader v2, Tabs, StatTile, Meter, Pips,
      CardRow, ToggleRow, Sparkline/StackedBar helpers, Footer v2, EmptyState. Unit tests for pure helpers.
- [x] `panel.ts` uses PanelHeader v2 (thumb slot, compact close) and Footer v2 for **all** panels; panel width token.
- [x] Chrome (§8.3): cash chip with change flash, era badge (Roster link can be a stub that Phase 22 wires),
      left rail spacing/grouping, right floating pill, menu as grouped card lists with toggle rows.
- [x] City, Station (tabs Cargo/Trains/Build; train rows get a thumb slot — use a plain loco-type icon for now,
      Phase 22 swaps in side views), Industry, Finance (tabs, sparkline, stacked bars, credit meter), News,
      Goals, Settings, Save/Load panels restyled to v2.
- [x] Fix the broken glyph after the city population in the city subtitle.
- [x] Per-panel acceptance (§8.4) at 800×360: screenshots `phase-20-city.png`, `phase-20-station-cargo.png`,
      `phase-20-station-trains.png`, `phase-20-station-build.png`, `phase-20-industry.png`,
      `phase-20-finance-overview.png`, `phase-20-finance-year.png`, `phase-20-menu.png`, `phase-20-topbar.png`, plus
      the city panel at 1280×720. Open and check each one.

## Phase 21 — Map polish
STYLE §10 · files: `src/render/{stations,cities,industries,labels,terrain}.ts` (+ particles from Phase 19)
- [x] Station buildings by type (depot / station with canopies / terminal train shed) and visible improvements.
- [x] Station enamel name plaques; city labels in display serif with halo.
- [x] Cities: top-lit roofs, shadows, street lines, landmark from Town tier.
- [x] Trees two-tone + shadow; farm fields.
- [x] Industries distinct at zoom 1; chimney smoke on active processors via the shared particle system.
- [x] Review carry-overs from 19/20: (a) toasts overlap the top bar (phase-20-topbar.png: breakdown toast drawn over
      the era badge/date) — place toasts below the top bar, never over it; (b) smoke puffs are too big and too long a
      trail (phase-19-map-steam-smoke-zoom2.png: ~7 tiles of big grey discs on the track) — smaller puffs, shorter
      life (~0.8 s), rise/drift sideways slightly, lighter alpha; (c) station supply chips show fractions ("17.2") —
      round to whole units; (d) city subtitle trend glyph after population ("36k ━") reads as a broken character —
      use the proper trend icon (▲/▼ arrow icon, or nothing when flat).
- [x] Perf: stress map fps not worse than before (compare `getAvgFrameMs` before/after in the e2e log).
- [x] Screenshots: `phase-21-station-depot/station/terminal-zoom2.png`, `phase-21-city-zoom1.5.png`,
      `phase-21-industries-zoom1.png`, `phase-21-overview-zoom0.5.png`. Open and check.

## Phase 22 — Train screens (buy wizard, train panel, roster, new-engine card)
STYLE §11 · needs Phases 19 + 20 · files: `src/ui/trainPanels.ts` (split it), new `src/ui/roster.ts`, etc.
- [x] Buy-train wizard (§11.1): full-screen sheet, stepper, engine list with side-view thumbs, filters, hero with
      stat bars, consist builder with the side-view strip and suggestions, route step using the existing map-pick
      mode. Keep `?debug=1` hooks and existing e2e intents working.
- [x] Train panel v2 (§11.2): side-view hero with fill meters, status line with icon, Route timeline tab, Stats tab,
      action-bar footer; Edit cars reuses the consist builder.
- [x] Station "Trains" tab rows and news items use loco side-view thumbs.
- [x] Roster screen (§11.3) + short original notes per locomotive in strings.ts; era badge opens it.
- [x] New-engine announcement card (§11.4).
- [x] Screenshots: `phase-22-buy-engine.png`, `phase-22-buy-cars.png`, `phase-22-buy-route.png`,
      `phase-22-train-panel.png`, `phase-22-train-route.png`, `phase-22-roster.png`, `phase-22-roster-detail.png`,
      `phase-22-new-engine.png`. Open and check each at 800×360.

## Phase 21.1 — Map polish, second pass (review of Phase 21)
Phase 22's train screens look great; the map now lags behind them. Review of the Phase 21 screenshots:
- **Stations are too small and too alike.** At zoom 2 the whole station is a ~60×25 px grey box with two short
  platform strips; Depot and Station read almost the same. Make the footprint read as a railway station:
  platforms along the track with length by type (Depot ≈ 2 tiles, Station ≈ 3, Terminal ≈ 4, centred on the
  station tile, clipped to the track's direction), platform edges (light line) and paving; the building ≈ 1.5
  tiles long beside the platform with a pitched roof (two top-lit halves, ridge line, chimney), a canopy over the
  platform (Station), a big arched train shed over all tracks with ribs and a glazed centre strip + head building
  (Terminal). Soft shadows to the lower right like the rest of the map.
- **Improvements** are scattered small boxes below the station; lay them out tidily behind the building along the
  track direction: water tower = round tank on legs with shadow next to the track; engine shed = long shed with
  smoke vents; warehouse = large goods shed; post office, hotel, etc. = small buildings with distinct roofs.
- The dark round blob above the station in the screenshots — find out what it is (supply bubble with no icon?)
  and fix or remove it.
- **Industries look like UI icons on a paved tile.** Draw them as small building clusters filling ~2×2 tiles with
  readable silhouettes and cast shadows: coal mine (headframe A-frame with wheel, black spoil heap, rail spur
  stub), iron mine (headframe + rust-red heap), forest/lumber camp (cleared patch with stacked logs), sawmill (long
  shed, log piles, sawdust), steel mill (tall blast furnace, 3 chimneys, warm glow, slag), farm (farmhouse + red
  barn + silo, keep the good striped fields), oil well (pumpjack(s) on a dirt pad), refinery (round tanks + tower),
  factory (saw-tooth roofs + tall chimney), plus any others. Must be distinct at zoom 1 without labels.
- **Cities**: roofs still read as a rigid grid of flat rectangles. Vary building sizes/orientations per block,
  pitched-roof shading on every roof (not flat), visible street grid in a light warm grey, a few trees/gardens in
  blocks, and a landmark (church with spire / town hall with clock tower) that stands out.
- **Performance**: city screenshot shows render ≈ 23 ms at zoom 1.5. Make sure all static map art is cached in
  chunk canvases (only trains, smoke and floating labels per frame). Report before/after frame times.
- Screenshots to judge (open every one, before/after side by side in PROGRESS): each station type at zoom 2 with
  a train at the platform, a station with all improvements, each industry at zoom 1 and 2, a Town and a City at
  zoom 1.5, overview at zoom 0.5.
- [x] Stations & platforms   - [x] Improvements layout   - [x] Blob fix   - [x] Industries   - [x] Cities
- [x] Perf / caching          - [x] Screenshots reviewed

## Phase 23 — Play-test 6: world scale, placement collisions, status bar
Player report (Trieste–Ljubljana, 1840, on the phone):
1. "The scale seems off. Cities, farms and objects are too close. There is not enough space, the lines seem short.
   Long trains span a fair portion of the track." Today 1 tile = 10 km (KMH_PER_TILE_PER_DAY = 30, revenue "per 10
   tiles (100 km)"), but a town is drawn ~5 tiles wide (≈ 50 km) and industries are now ~2×2 tile clusters, so art
   and distances disagree. Ljubljana–Trieste is only ~12 tiles.
2. "When creating a station in the city it is crowded over the existing buildings; a depot was created over the
   tracks." Station buildings/improvements are drawn on top of houses and across track; on diagonal track the
   station platforms are drawn axis-aligned (Trieste Food Plant station).
3. "The Grasshopper 0-4-0 is missing a front wheel." A 0-4-0 correctly shows two wheels per side, but the drivers
   sit far back, leaving a long unsupported front overhang, so it reads as a missing wheel.
4. (Seen in the screenshots) the Android status bar (clock, signal, battery) draws over the top bar; coastlines are
   blocky staircases at zoom.

Runs as two parallel sessions: **23A** (scale, sim + generation) and **23B** (placement, art, Android shell).
Same parallel rules as Phases 19–22.

### 23A — World scale 2× (1 tile = 5 km)
- [x] All distance-based constants in `src/data/` converted so the *km-based* game stays the same: speeds (tiles/day
      doubles: KMH_PER_TILE_PER_DAY 30 → 15), revenue "per 20 tiles (100 km)", track/bridge/tunnel/electrification
      cost per tile halved, water-tower range 40 → 80, chain-input range 25 → 50, CITY_MIN_SPACING ×2, any goal or
      news thresholds in tiles, AI-free sanity checks (playability) in tiles. Station catchment radii stay in tiles
      (a station covers less land — intended). Grep for every tile-distance constant; list each conversion in
      PROGRESS.
- [x] Map sizes ×2 per side (small 192×128, medium 256×192, large 384×256); city and industry *counts* per map stay
      the same as today for the same size name (density per tile ÷ 4), so things are further apart.
- [x] Region maps: upsample terrain 2× at load time with a smooth, deterministic edge refinement (noise-perturbed
      boundaries for coast/lake/forest/hills — not blocky 2×2 blocks); rivers re-traced at the new resolution; city
      and resource-zone coordinates ×2. Region JSON files stay as they are.
- [x] Coastline rendering: no staircase — smooth coast/lake edges (e.g. marching-squares contour with slight
      rounding, cached per chunk). Also applies to random maps.
- [x] Cities keep today's size in tiles (they become relatively smaller); industries keep their ~2×2 footprint.
- [x] Performance with 4× tiles: generation time, chunk cache memory, minimap, stress e2e frame times — report
      before/after; optimise if anything regresses noticeably (e.g. lazy chunk baking, cap cache size).
- [x] Balance tests still pass *without* loosening them (they should, since km-based economics are unchanged); add a
      test that the same km route earns the same revenue before/after the conversion.
- [x] Saves: bump the save version; an old-scale save shows a clear message ("This save uses the old map scale and
      can't be loaded") instead of breaking. (Or migrate by ×2 coordinates if simple — your call, document it.)
- [x] Screenshots: `phase-23-central-eu-overview.png` (zoom 0.5, Trieste–Ljubljana area), same at zoom 1 with a line
      and a train, a random medium map overview, a coastline close-up at zoom 2.

### 23B — Placement collisions, 0-4-0 art, Android shell
- [x] Station footprint owns its tiles: city houses on the station's footprint tiles (platforms + building) are not
      drawn (render-side; the city keeps its population), so a station in a city carves a clean site.
- [x] Station building, platforms and every improvement never overlap: track (other than the station's own track),
      other stations, industries. Pick the side of the track with more free space for the building; lay improvements
      out on free tiles nearby (both sides allowed), compact fallback if space is tight. Unit-test the layout function
      (no overlaps with track/industry tiles for straight, diagonal, curved and junction cases).
- [x] On diagonal track, platforms, canopy, shed and building follow the track direction (rotated 45°), as on
      straight track.
- [x] Steam side views: no long unsupported overhangs. Front driver (or leading truck) sits under the smokebox /
      cylinders; for 0-4-0 and 2-2-0 space the drivers so the front one is under the cylinder block. Check all 12
      steam engines in the gallery.
- [x] Android: run the game full-screen (hide status and navigation bars, immersive sticky) via the Android theme /
      MainActivity — no new plugin dependency. Web/PWA fallback: `viewport-fit=cover` + `env(safe-area-inset-*)`
      padding on the top bar and side rails so nothing is ever under a notch or status bar.
- [x] Screenshots: station inside a dense city (before/after), station with all improvements next to a junction,
      station on diagonal track, gallery steam page, top bar with simulated safe-area insets.

## Phase 24 — Play-test 7: spacing, profitability, smooth following, render polish
Player report (Central Europe, 1840–1844): "Perfect, really good." Remaining:
1. Some industries are too close to cities (Ljubljana Farm, Trieste port/factory touch the town) — no room for a
   station and track, it makes no sense to connect them.
2. Double track is good, but a branch leaving diagonal double track still looks strange (odd tie fan / crossing
   where the single-track branch leaves).
3. Finance: "I want the current average of income and expenses. Net profit includes investments (construction,
   trains) that happen often, so I don't know if I'm currently profitable."
4. Floating "+$662 · 17 mail bags" delivery labels overlap when several trains unload at one station — unreadable.
5. "I would like to know for each train if it is profitable."
6. A faster train following a slower one moves jerkily (stop-go); trains following on single track also end up
   visually touching.
Seen in the screenshots: thin straight seams across the map at chunk borders (vertical/horizontal hairlines);
grass↔hills/forest terrain borders are still blocky staircases (coast is smooth now).

Two parallel sessions: **24A** (sim, generation, finance/train UI) and **24B** (render polish).

### 24A — Spacing, profitability, following
- [x] Generation: industries keep a clear gap from city footprints (e.g. ≥ 5 tiles from any city tile, data table
      in `src/data/`), and from each other (≥ 3 tiles between footprints), except ports, which may sit on the town's
      coast but not on its buildings. Region-map fixed industries that violate it are nudged outward. Tests on
      seeds + all regions.
- [x] Finance "Overview": **Operating** view — trailing 12-month (and last-30-days) average per month of operating
      income vs operating costs (maintenance, running costs, interest), clearly separated from **investments**
      (track, stations, trains, improvements). A single headline "Operating profit: +$12k / month" (green/red) with a
      small bar pair income vs costs. Yearly tab keeps the full breakdown but labels investment lines as such.
- [x] Per-train profit: track per train revenue and running cost (+ breakdown repairs) this year, last year and
      lifetime (sim, deterministic, saved). Train panel Stats: headline "Profit this year" (green/red), last year,
      lifetime, and "Paid back" progress vs purchase price. Train list: profit/yr column with a coloured dot and
      sort by profit; unprofitable trains marked. Optional overlay already exists ("Train profit colors") — make it
      use the same numbers.
- [x] Undeliverable cargo: if a car carries cargo that no stop in its orders accepts any more (demand changed,
      orders edited), the train panel shows a warning chip ("2 cars of coal can't be delivered on this route") and a
      news item once; such cargo is dropped at the next warehouse hub if any (existing rule).
- [x] Smooth following (sim): a train closing on a same-direction train ahead matches its speed smoothly (target
      speed from the gap, limited acceleration/braking, no oscillation) and keeps a visible minimum gap of ≥ 1 tile
      (or the current spacing rule if larger). Unit test: speed trace of a fast train behind a slow one has no
      sign-flip oscillation in acceleration after settling and never closes below the gap.
- [x] Screenshots: finance overview with operating profit, train stats with profit, train list sorted by profit,
      Central Europe around Ljubljana/Trieste showing the new industry spacing.

### 24B — Render polish
- [x] Double-track branch geometry (single branch done; a *double* branch keeps the Phase 17 double-double fork, see
      PROGRESS): a single (or double) branch leaving diagonal/straight double track diverges
      from the *outer* lane with a proper turnout (ties lengthen smoothly, no crossing tie fans, no rail crossing the
      other lane unless it is a real crossover). Screenshots at zoom 1.5/2 for branch off diagonal double track (the
      player's case), off straight double, and both-sided branches.
- [x] Delivery labels: never overlap. Per station, labels queue and stack upward (newest at the bottom, older ones
      pushed up and faded), or merge deliveries within ~1 s into one label ("+$1.9k · 3 deliveries"); world-anchored,
      readable at every zoom; collision with the station's supply bubbles avoided.
- [x] Chunk seams: find and remove the hairline seams between cached terrain/track chunks (pixel alignment,
      rounding at fractional zoom, bleed/overlap of 1px, or imageSmoothing on edges). e2e screenshot at zoom 1, 1.37,
      2 across a chunk border shows no line (pixel-check the border column against its neighbours).
- [x] Terrain borders: grass↔hills, grass↔forest, hills↔mountains get the same smooth, noise-perturbed contour
      treatment as the coast (no staircases), cached per chunk.
- [x] Screenshots before/after for each item; open and check them.

## Phase 25 — Play-test 8: crossings, delivery labels, zoomed-out map, minimap
Player report (Ljubljana, 1840–1842):
1. Delivery money over a station is shown per car ("+$1k · 20 tons of grain" twice for one train). Show **one label
   per cargo type per train arrival** (sum money and units), e.g. "+$2k · 40 t grain".
2. "When tracks cross, trains go through one another. We need them to wait." Screenshot: a branch crosses a diagonal
   main line at a node; a freight train and a passenger train occupy the crossing at the same time.
3. "When we zoom out, mines, farms… are not seen anymore. They should be seen as little dots."
4. "On the minimap show mountains and forests as different colours."
Seen in the screenshots: at low zoom the hills/mountain borders are still blocky staircases (the Phase 24B smooth
borders only apply at close zoom); deep water still shows square depth patches.

Two parallel sessions: **25A** (sim: crossings + label aggregation) and **25B** (render: zoomed-out map, minimap,
borders, water).

### 25A — Crossing interlock and per-cargo labels
- [x] Crossings and junction nodes are mutually exclusive: a node where two routes cross or merge (diamond crossing,
      junction) can be occupied by one train at a time. Keep the §7.5 model (full path reserved at departure), and
      add a **dynamic node claim**: a moving train claims the crossing/junction node when its head is within braking
      distance and releases it when its tail clears; a train whose next node is claimed by another train brakes and
      waits just before it (shown as "Waiting at crossing for Train N"). Argue in PROGRESS why this can't deadlock
      (the holder already owns its whole path to the next station, so it never stops on the crossing) and prove it
      with the phantom-jam stress test extended with crossing layouts (X crossing, junction off single, junction off
      double) — no two trains ever overlap a crossing node, no wait > the stress threshold.
- [x] Two trains whose reserved paths cross at a node where they would meet head-on on the *same* block still follow
      the existing opposing-traffic rules (no regression).
- [x] Render: a proper diamond crossing where two lines cross without a junction (rails cross with check-rail
      detail, ties continuous under both).
- [x] Delivery labels: aggregate per train arrival per cargo type (money + units), still stacked/merged per station
      as in 24B. Unit test the aggregation; e2e screenshot of a mixed train (3 grain + 2 mail) unloading → exactly two
      labels.
- [x] Screenshots: two trains at an X crossing (one waiting), junction off double track with two trains, labels.

### 25B — Zoomed-out map and minimap
- [x] Below the zoom where industry art is drawn, draw each industry as a small **dot marker** (≈ 8–10 CSS px, cargo
      colour of its main product, dark outline), and stations as small white-bordered dots in the station colour;
      cities keep their label. Fade between marker and art around the threshold (no pop). Tappable as before.
- [x] Minimap: terrain colours by type — water (blue, deeper darker), grass/plains (green), forest (dark green),
      hills (olive/ochre), mountains (grey-brown, peaks lighter), desert/other if present; cities as small red
      squares, industries as tiny dots in cargo colour (optional toggle if too noisy), track in dark lines, viewport
      rect. Cached; re-rendered only when track/terrain changes.
- [x] Low-zoom terrain: the smooth noise-perturbed borders from 24B must also apply at every zoom (the overview
      rendering path) — no staircases at zoom 0.25–1.
- [x] Water depth: remove the square depth patches (smooth depth gradient from distance-to-shore, cached).
- [x] Screenshots: overview at zoom 0.35 and 0.6 with markers, minimap close-up, mountain border at zoom 0.5,
      open sea at zoom 1. Open and check each.

## Phase 26 — Play-test 9: economy depth, repair crews, empty land, junction art, news
Player report (random map, 1832–1835):
1. "Clear all news" button. (Screenshot: the news list is full of repeated "Traffic jam near Highford…" items.)
2. Complicated junctions built from double track don't look right (overlapping curves, junction dots, tie fans).
3. "There are some pretty empty corners of the map. What can be done so they're not useless?"
4. "Passengers and mail don't earn much money. What is their benefit? City growth? What is the benefit of city
   growth apart from more passengers? Do longer lines bring more money?" (Finance: passengers $3k, mail $3k,
   freight $14k in a year.)
5. "Station upgrades — what are they for? I don't understand them yet."
6. "Train repair is really quick. A repair train should be dispatched and travel to the broken-down train. We could
   buy a repair station at any station so the repair train has a shorter route."
Seen in the screenshots: the camera can pan past the map edge (a big black area).

Two parallel sessions: **26A** (sim/economy: 3, 4, 6) and **26B** (UI/render: 1, 2, 5, camera edge).

### 26A — Economy depth, repair crews, living empty land
- [x] **Balance report first** (`docs/BALANCE.md`, generated by a headless script/test): annual profit of a typical
      train per cargo type on 50 / 100 / 200 km routes with the era's common locos (1830, 1860, 1900, 1950), including
      how much supply a Village/Town/City really produces. Include the current numbers in PROGRESS.
- [x] **Passengers & mail matter** (like RRT, where they carried the early game): target a full passenger train on a
      100 km Town↔Town route earning 0.8–1.2× a full coal train on a 100 km mine→mill route, mail per car ≈ 1.3× a
      passenger car. Levers (data tables only): city passenger/mail supply (it's currently tiny: ~1.4 cars/month for
      an 18k town), a **destination bonus** — supply grows with how many distinct served destinations the station's
      trains reach (up to +50%), and rates. Keep freight chains valuable. Update balance tests to the new targets.
- [x] **Why grow cities** (sim + UI text): bigger tiers demand more cargo types (food, goods, fuel… check what exists
      and make the tier ladder explicit in data), produce more passengers/mail, raise station acceptance, and count
      toward goals. Growth feedback in the city panel: "Next tier: City at 25,000 — unlocks demand for Goods".
- [x] **Longer lines**: keep revenue ∝ distance with the transit-time bonus; verify in the balance report that per
      train-year a 200 km line beats a 50 km line for the same cargo (less loading overhead) as long as the loco is
      fast enough — document the rule of thumb for the player (hint text in the train buy/route step, e.g. "Longer
      routes pay more per trip; slow engines lose the speed bonus on long routes").
- [x] **Empty land becomes useful** (pick 2–3, deterministic from the seed):
      (a) **Resource discoveries**: every few years a new mine/oil field/forest appears in an unserved area (news:
      "Coal discovered near Highford"), preferring empty regions far from existing industries;
      (b) **Scenic destinations**: generation places a few resorts / spas / mountain lodges in remote scenic spots
      (lakeside, mountains, coast) — small places that generate and accept *tourist* passengers at a premium rate
      and grow when served;
      (c) **Frontier towns**: a new village is founded next to a player station that has no city in its catchment
      after it has been served for a while, and grows with service.
      Document which you chose and why.
- [x] **Repair crews**: a breakdown stops the train where it is; a repair crew is dispatched from the nearest
      station with an **Engine Shed** (existing improvement, rename/describe it as "Engine Shed & repair crew") or,
      if none, a slow crew from the company's first depot/any station ("from far away" penalty). The crew is a small
      rail vehicle (draisine/handcar in steam era, service truck later) drawn moving along the track to the train
      (render-only mover that follows the track path; it doesn't reserve blocks, so it can't deadlock). Repair time =
      crew travel time + fix time; cost scales with distance. Train panel status: "Broken down — repair crew from
      Highford arriving in 2 days". Unit tests: time depends on nearest shed distance; no shed → much longer.
- [x] Screenshots: finance of the same save before/after rebalance, city panel with next-tier info, a discovered
      resource / resort on the map, a repair crew on its way + train panel status.

### 26B — News, junction art, station upgrade explanations, map edge
- [x] News panel: **Clear all** button (with the same two-tap confirm style as Sell); repeated news of the same kind
      and place within 60 days collapse into one item with a count ("Traffic jam near Highford ×3"); traffic-jam news
      at most once per 30 days per place.
- [x] Complex double-track junctions: when several junctions/turnouts are close together (a double-track wye,
      crossovers, a branch whose branch is a double line), the lane geometry must still be clean: no overlapping tie
      fans, no stray junction dots on top of rails (draw the node marker only in debug or remove it), turnouts meet
      the correct lanes, curves don't overlap each other. Reproduce the player's layout (double main with a double
      wye and a crossing) in e2e, screenshot at zoom 1.5/2 before/after, iterate until it looks like a real layout.
- [x] Station **Build** tab explains upgrades visually: each improvement tile shows icon, name, cost, a one-line
      benefit ("Mail +50% here", "Breakdowns −50% for trains serviced here; repair crews start here"), and a small
      "Why?" hint when relevant (e.g. Livestock Pens greyed with "A livestock farm is in range" when useful). Station
      type upgrade (Depot → Station → Terminal) shows what it adds (catchment 3×3 → 5×5 → 7×7, platforms 2/3/5,
      faster loading). A tiny **Help** entry in the menu with a one-screen "Station upgrades" and "How money works"
      explainer (icons + short lines, strings.ts).
- [x] Camera: can't pan beyond the map (clamp so at most ~1/4 screen of margin shows), and whatever margin shows is
      drawn as deep sea/"map edge" styling, not black.
- [x] Screenshots: news with Clear all + collapsed item, the player's junction before/after, station Build tab, Help
      screen, map edge. Open and check each.

## Phase 27 — Junction rules: every layout the player can build must render and interlock correctly
Player report (Ljubljana Food Plant, 1843): a single-track branch and a crossing line meet a diagonal double-track
main in one spot. Result: "strange junction, weird shapes, and trains pass through each other" (third screenshot:
two trains overlapping where a diagonal line crosses the double track next to the branch). "Can this be solved in
general, or do we need predefined junctions?"

Reviewer's diagnosis: the free-form tile graph allows layouts whose *geometry* is not representable by our
turnout/crossing model, and conflicts the sim can't see:
- two diagonal edges can cross in the middle of a tile (A→B and C→D form an X) with **no shared node**, so neither
  the 25A node claim nor block reservations know they conflict;
- a single track can run through the lane clearance of a double track, or join it at a node where the main line
  itself bends, or several turnouts/crossings can share one node or neighbouring nodes — too close for any clean
  turnout geometry.
Decision: solve it **in general with build-time rules + geometric conflict groups** (no predefined pieces needed;
templates can come later as a convenience):

### A. Build-time layout rules (commands.ts, with reasons and red preview like sharp turns)
- [x] No mid-tile crossings: a new diagonal edge may not cross an existing diagonal edge between nodes. Crossings are
      only allowed **at a node**, straight-over (diamond: the two lines pass through the node without connecting).
- [x] Clearance: no edge may pass within the lane clearance of another track except where it connects to it (a new
      single line next to a double line must keep ≥ 1 tile, or join it properly).
      *(Dropped as a separate rule: on the 8-direction grid unconnected edges are always ≥ 0.707 tile apart, enough for the
      0.26-wide vehicles; only crossings and connected geometry can conflict — see PROGRESS Phase 27.)*
- [x] Junction geometry: a junction node needs its through line straight across the node (no junction on a bend of
      the main line); at most one diverging leg per side per node; consecutive junction/crossing nodes on the same
      line at least 2 tiles apart (room for the turnout curve). Double-track mains: a branch joins through the outer
      lane's turnout (already rendered since 24B).
- [x] Rules apply to every building path (drag, quick build, upgrade to double, bulldoze-and-rebuild); existing saves
      with violating layouts still load (flag them on the map with a warning marker; trains still interlock via B).
- [x] Unit tests for each rule with the player's layout reproduced: it is refused with a clear reason, and the
      nearest legal alternative (join 2 tiles further along, cross at a node) builds.

### B. Geometric conflict groups (sim)
- [x] Precompute from the track graph + lane geometry which edges/nodes physically overlap (shared node, crossing
      segments, overlapping clearance incl. double-track lane offsets, turnout fans). Each overlap set is a conflict
      group; the 25A dynamic claim works on conflict groups instead of single nodes, so *any* physical overlap is
      exclusive. Recomputed when track changes; saved state unaffected.
- [x] Extend the phantom-jam stress test with random legal layouts that include crossings, wyes and branches off
      double track, plus a render-geometry check: at every tick, no two trains' vehicle rectangles overlap anywhere
      on the map (not just on nodes). This check must fail on today's main for the player's layout.

### C. Render
- [x] With A in place, the turnout/crossing renderer only has to handle legal shapes: diamond crossings (90° and 45°),
      turnouts off straight/diagonal single and double, wyes, crossovers between the two lanes of a double track.
      Screenshot each at zoom 1.5/2 and open them; no overlapping tie fans, no rails drawn through the other lane.

### D. Carry-overs
- [x] 1830s passenger trains lose money (BALANCE.md: Grasshopper on Town↔Town −6k/yr). Make the first decade playable
      (e.g. slightly cheaper early running costs, better early loco capacity, or era-scaled rates) — rerun the report.
- [x] News text never shows "?" — fall back to "the line"/station name when a place lookup fails.
- [x] Toasts never cover an open panel's header (place them over the map area only).

## Phase 28 — Play-test 1 fixes (docs/PLAYTEST-1.md)
Source: the agent play-test (3 games, ~70 game years). Read the report first; bug numbers below refer to it.
Two sessions after Phase 27 lands: **28A** (sim/economy) and **28B** (UX).

### 28A — Deadlock-free stations, engine sheds, era balance
**Done (2026-09-30)** — see docs/PROGRESS.md "Phase 28A" for the design, parameters, before/after balance tables and deviations.
- [x] **Bug 1/2 platform deadlock — design decision:** platforms limit *simultaneous loading*, not physical entry.
      A train may always enter its destination station; if all platforms are busy it waits in the station's yard
      (holding tracks, unlimited, drawn as trains standing on sidings/approach beside the platforms) and loads in
      FIFO order. Departure only needs the line path (§7.5), never a destination platform. So a train never holds a
      platform while waiting to leave, and no platform cycle can form. Update SPEC §7.5. Regression test from the
      report: seed 11, 18-tile line, N = 1…12 Atlantics alternating A→B/B→A on single and double track — throughput
      must be non-decreasing up to the line's capacity and never drop to 0; ≥ 90 % of N−1 throughput at N = 2 ×
      platforms. Extend the phantom-jam stress test with over-subscribed stations.
- [x] `noRoute` trains leave their platform (go to the yard) immediately and, after 30 days, are flagged in the stuck
      indicator (28B); never block others.
- [x] **Bug 4**: a train must never be `moving` at speed 0 for > 5 days — find the cause (suspected one-tile stub next
      to a station) and fix; add an invariant to the stress test.
- [x] **Bug 6 Engine Sheds**: buildable at any station ($30k era-scaled per SPEC §6.2); trains can be bought at any
      station with a shed; repair crews dispatch from the nearest shed. Repair cost follows mechanism 3–4 below;
      breakdown −50 % applies to trains serviced at *any* shed.
- [x] **Economic model v2 — mechanisms, not multipliers** (player's rule: "it must make sense, based on real
      things; don't just cut profit in half"). Every balance change must come from one of these modelled causes, each
      a small data table in `src/data/economy.ts`, shown to the player where it costs money (Finance breakdown lines,
      train/station panels), and documented in SPEC §9 "Economic model v2". No flat global revenue cuts.
      1. **Historical fares vs wages.** Keep era inflation, but split it: *fares* follow a real-terms curve that is
         high when rail is a novelty (1830s rail travel was premium-priced vs stagecoach) and declines as rail
         becomes mass transit; *wages* (crew, station staff, track gangs) rise faster than general prices over the
         era. Early small trains need a small crew (cheap); big late trains need larger crews.
      2. **Track wear from use.** Track upkeep = small fixed cost per tile + wear ∝ gross tonnage hauled × speed factor
         × axle load (loco weight class, loaded cars). Light 1830s trains barely wear track; long heavy fast trains
         cost real upkeep. Double track = two tracks to maintain; electrified adds catenary upkeep per tile.
      3. **Locomotive complexity.** Price, running cost and *repair cost per breakdown* scale with the engine's
         power/complexity (a Grasshopper is cheap to fix; a Mikado or big diesel is not). Old proven models (> 10 years
         after introduction) are more reliable and their parts cheaper; brand-new models have a teething period
         (lower reliability for their first ~5 years on the market). Loco wear rises with age and km run.
      4. **Repair logistics.** Call-out cost = crew travel distance from the nearest Engine Shed × wage + parts
         (by loco complexity). More sheds → cheaper, faster repairs (Bug 6).
      5. **Taxes and regulation (history-based).** Property tax on track and stations (per tile/station, small, from
         the start); corporate income tax on *operating profit* introduced in a later era (e.g. 1910s) and rising in
         steps; Hard = heavier tax schedule and higher interest, not lower revenue. Shown as its own Finance line.
      6. **Competition from other transport.** From the 1920s roads (buses, trucks) and later airlines take share:
         short-distance passengers and short-haul freight (< ~150 km) lose demand and fares; long-distance, fast and
         bulk traffic keeps it. High-speed trains win passengers back. Announced in news ("Motor buses now compete on
         short routes"). This makes late-game network design matter instead of just printing money.
      7. **Freight rates by value and distance**: keep, but make pre-1850 freight competitive with canal/wagon
         transport (bulk freight paid well where no canal existed).
      Tuning: choose each mechanism's parameters from rough historical plausibility first, then check the outcomes in
      BALANCE.md against targets: a Norris on a 10-tile Town↔Town line returns ≥ 25 %/yr of its price; a Grasshopper on
      a short line at least breaks even; repair spend ≤ 10 % of revenue in every era with sensible shed placement;
      1900+ good routes earn ≤ ~3× the train's price per year after tax and wear; Hard is clearly harder. If a target
      misses, adjust the *mechanism* (and explain why in PROGRESS), never a blanket multiplier. Retune goal
      thresholds from the new numbers.
- [x] Frontier villages grow to ≥ 3,000 within 10 years while served; stop founding next to unused stations.
- [x] Update BALANCE.md with before/after and write the targets into balance tests.

### 28B — UX from the play-test
- [x] **Stuck indicator**: top-bar ⚠ chip with a count of trains waiting > 10 days / noRoute / broken; tap cycles the
      camera through them and opens the train panel. Traffic-jam news one per station pair.
- [x] **Modals never block**: Year-in-Review becomes a badge on the Finance button + a toast on Jan 1 (open from
      Finance); new-locomotive cards collapse into one card listing all new engines; no modal may swallow a map drag.
      Year-in-Review "Net profit" shows operating profit and investments separately; fix colour clash (Mail vs
      Expenses) and sign formatting.
- [x] **Buy-train route step as a bottom sheet** (map stays visible above, ~40 % height), compact order list, plus
      "Add stop" from a searchable station list as well as by tapping the map.
- [x] **Bulldoze**: highlight exactly the edges/objects that will be removed during the drag, with refund; explain
      "$0" ("drag along a whole track piece"); allow removing a station (with confirm). Fix Bug 5 over-removal.
- [x] **Bug 3**: extending a line through a station at > 45° is refused (or shows a red "trains can't pass" marker).
- [x] **Station tool** defaults to Station, remembers the last type; type cards show platforms; hint "Terminal
      recommended" when many trains use a station.
- [x] Discovery / founding news tappable → camera focuses the place. Bug 9: "Passengers + mail" suggestion fills all
      car slots. Bug 10: regenerate closes panels. `user-select: none` on the HUD.
- [x] Screenshots of each change at 800×360; open and check them.

## Phase 29 — Play-test 10: node routes (turnouts that survive crossings), delete station, faster order entry
Player report (Trieste Food Plant, 1840–1843):
1. A branch left the diagonal main line to the right (a turnout). When the player later connected a line from the
   other side into the same node, the node became a diamond crossing (Phase 27 C: "crossings are diamonds, no
   turning") and **trains could no longer turn onto the branch**. The player worked around it with a strange
   double junction (third screenshot).
2. "I need the possibility to delete a station."
3. "Trieste station accepts all cargo. Is this because of the port?" (Yes: the Port industry accepts all bulk
   freight for export. Keep the rule; make it understandable.)
4. "When adding stations to a train I don't want to tap 'Tap on map' first; it should be enabled by default so I can
   tap all the stations one after another."

### A. Explicit routes through nodes (general model, replaces geometry-inferred connectivity)
- [x] Each node stores its **routes**: the set of (legA, legB) pairs trains may traverse. A drag creates the routes it
      actually passes through; connecting into an existing node **adds** routes and never removes existing ones.
      Result: a node can be a plain turnout, a diamond, a diamond with one or both slips (single/double slip), a Y,
      etc. Every route must satisfy the ≤45° rule; station tiles keep reversing.
- [x] Pathfinding, reservations, conflict groups (Phase 27 B) and the build-preview all use routes. Two routes through
      a node that cross each other form a conflict group (already exclusive).
- [x] Old saves: derive routes from the current geometry rules on load (identical behaviour to today), then keep them
      explicit.
- [x] The player's case as a test: main diagonal + branch to the right; then a line from the left joins the same node.
      Expected: the left→right straight route and the diagonal through route exist (diamond), **and** the existing
      diagonal→right turnout route still exists (single slip); trains take the turnout.
- [x] Render routes: each route drawn as its own curve through the node (straights, turnout curves, slip curves) using
      the lane model; screenshots of turnout, diamond, single slip, double slip at zoom 1.5/2 — open and check.
- [ ] Optional nicety (command `setNodeRoute` + `__game.setNodeRoute` exist and are tested through the slip screenshots; the Track-mode tap UI is not built): tapping a node in Track mode shows its routes and lets the player remove one (e.g. make a
      crossing without a slip).
### B. Delete station
- [x] Station panel → Build tab: "Demolish station" (danger, two-tap confirm) with refund per the bulldoze rule; the
      Bulldoze tool tap-to-remove (Phase 28B) stays. Trains with this stop get it removed from their orders (a train
      left with < 2 stops is flagged in the stuck indicator); cargo waiting there is lost; news line.
### C. Order entry
- [x] In the route step and in Edit orders, map-tap mode is **on by default**: every tap on a station (or its city)
      appends a stop immediately, with a short confirmation pulse on the map and the list; "From list" stays as the
      secondary option. Tapping the same station twice in a row does not add a duplicate stop.
### D. Clarity
- [x] Station Cargo tab: demands that exist only because of an industry in the catchment (e.g. the Port's export
      demand) get a tiny badge with that industry's icon; tapping a demand shows "Accepted by: Trieste Port (export)"
      or "Accepted by: Trieste (city)". Help gets one line on ports.
- [x] Train status "Waiting (station)" → specific text ("Waiting in the yard for a platform at Trieste (2 ahead)").

## Phase 30 — Play-test 2 fixes (docs/PLAYTEST-2.md): real-world causes for the late game, visibility, single track
Source: docs/PLAYTEST-2.md (bug and exploit numbers refer to it). Owner's rule still applies: every balance change
comes from a modelled real-world cause, shown to the player and documented in SPEC §9; no blanket multipliers.
Two parallel sessions: **30A** (sim/economy) and **30B** (UI/visibility + smaller fixes).

### 30A — Sim & economy
- [x] **Bug 1 (HIGH)**: "Wait for full load" unloads cargo at the station it was loaded at. Never unload a car whose
      `loadedTile` is this station (and only unload on the first pass of a stop). Regression test: pax stop with
      fullLoad keeps its load; revenue on the PLAYTEST-2 setup matches Auto within 10 %.
- [x] **Waiting passengers & mail behave like people** (replaces the hard waiting-pile cap for pax/mail): waiting
      passengers give up over time (go by road / stay home) with a per-cargo patience; the station tracks
      **turned-away units and lost revenue per month**. Warehouses store **freight only** (no effect on pax/mail);
      the Warehouse exploit (+100 %) must disappear — test it. Freight keeps a storage cap (Warehouse ×2).
- [x] **Mail as a contract-scale traffic**: lower mail supply per head to a realistic share (mail ≈ 10–20 % of a
      city line's revenue, not 50 %), keep its high rate per bag; Post Office stays useful but not the best ROI.
- [x] **Land & way-leave cost**: track/station building cost includes land price per tile that rises with nearby
      population density and with the year (land inside/near big cities is expensive; open country cheap). Shown in
      the build preview as a separate "land" line.
- [x] **Interest rises with leverage**: loan interest = base rate + premium that grows with debt ÷ net worth; credit
      limit from earnings, not only net worth. Hard: higher base rate and premium (not lower revenue).
- [x] **Track condition (wasting asset)**: each edge accumulates wear from tonnage × speed (reuse the 28A wear
      model); when condition drops below thresholds the line gets **slow orders** (speed limit) until the player
      **relays** it (a command + cost per tile, era-scaled), shown as track colour in the Track type overlay and a
      warning in train panels ("Slow order: worn track near X"). Light early traffic barely wears; heavy fast
      late traffic needs relaying every couple of decades.
- [x] **Locomotives wear out**: reliability drops and running cost rises with age; after ~30–40 years a loco must be
      retired or overhauled (overhaul = cost, resets some age). News + train panel hint.
- [x] **Single track capacity**: buildable **passing loop** (a short double section/siding, cheap) that the
      reservation system uses for meets; per-train or per-line **minimum days between departures** order option to
      space trains; departures prefer to space trains instead of convoys. Test: 4 trains on single track with a loop
      earn more than 2 trains (today they earn less).
- [x] **Engine Shed servicing by distance**: breakdown chance grows with km since last service; any stop at a station
      with a shed services the train (short delay). Sheds along long lines matter again.
- [x] **Goals reward = land grants** (historical): reaching a goal grants a credit/discount on future land & track
      costs (or a one-off grant), shown on the goal card.
- [x] **Bridges**: a washed-out bridge leaves a persistent marker; rebuild offers wood/stone/steel; trains reroute or
      show "Line cut at bridge near X".
- [x] Rerun BALANCE.md and the PLAYTEST-2 benchmarks: 1900 good-player Normal net worth by 1916 should be roughly an
      order of magnitude below $208M; Hard clearly harder (target ≥ 40 % lower NW than Normal by year 15); 1840/1830
      starts must not get worse than PLAYTEST-2. Document the mechanism behind each change.
- [x] (added) **Early-era balance**: with mail cut to its realistic share and land added, the 1840 starts stalled (bot: bankrupt) —
      fixed by an urbanisation curve for city land, open-country land = price level, and *induced passenger traffic* ×1.7
      before 1860 easing to ×1 by 1900 (SPEC §9.5c-11); goal thresholds re-set (gb gold $20M; random gold 60× / 4.5×).
- [x] (added) Goal cards show the land-grant reward (`phase-30a-goal-reward.png`).

### 30B — Visibility & UX
- [x] **Per-line and per-station P&L**: "Lines" view (a line = set of trains sharing the same stop set) with revenue,
      costs, profit/yr, trains; station panel shows revenue generated at this station and turned-away pax/mail.
- [x] **Upgrade estimate**: each improvement/upgrade card shows "≈ +$X/yr at current traffic" (computed from the
      station's actual flows; marked as estimate).
- [x] **Income tax accrued monthly** as its own line (provisional tax), no year-end surprise.
- [x] **Help**: add pages/lines on waiting passengers & frequency, single track vs double vs passing loops, Water
      Tower range rule, track wear & relaying, loco ageing, land costs, loans & interest, bridges.
- [x] **Buy wizard affordability**: show cash vs price from step 1; unaffordable engines marked; "Borrow $X" shortcut
      inline. Route list distances in km. Loading-rule chip opens a small picker (no tap-to-cycle).
- [x] New-engine card shows each engine's year; toasts never cover panel headers/tabs (Bug 4); diagnosis text instead
      of "Traffic jam": "3 trains share a single line — add a passing loop or double track".
- [x] Hints: first-hour hints mention loans and keeping money for the locomotive on Hard; 1830 start shows "early
      engines are weak — the Norris arrives 1838".
- [x] Screenshots of each, open and check.

## Phase 31 — Play-test 11: passengers not unloading at a middle stop, accidental stop adding, junction waits
Player report (Trieste – Venice – Ljubljana Crossing line, 1843):
1. **Passengers are not unloaded at Venice.** The train arrives at Venice almost full, nobody gets off and almost
   nobody gets on. Venice's station panel: Revenue $0 last month, 546 turned away, $18k lost fares, 508 waiting.
   Passengers in this game have no individual destinations (any stop that accepts them takes them), so Auto must
   unload them at Venice. This is a bug, probably from the Phase 30A unloading changes (the "first pass / not at the
   origin" rule, `headwayHold`, the new give-up waiting model, or acceptance at a middle stop) — find the root cause.
   Reproduce with the player's setup: 3-stop loop (Trieste → Venice → Ljubljana Crossing), Norris with 3 passenger
   + 2 mail cars, all Auto, Central Europe 1840; assert passengers and mail unload and reload at *every* stop that
   accepts them. Add a property test over random 2–4 stop routes: a full car never passes a stop that accepts its
   cargo without unloading (unless the rule is passThrough/transfer).
2. **Viewing a train must not edit it.** Phase 29 C made map-tap add stops by default in Edit orders as well; tapping
   a station while just looking at a bought train's Route tab adds it. Map-tap add mode is on by default **only** in
   the Buy-train route step; in an existing train's panel it needs an explicit "Edit stops"/"Add stop" toggle (with a
   Done button).
3. **Junction waits too broad**: a train waited at a junction although it only needed to turn left, because another
   train was using the nearby crossing. Make conflict groups route-precise: two routes conflict only if their actual
   swept paths (with lane offsets and train width) intersect or share a track segment; a turnout route that diverges
   before the crossing must not be blocked by a train using the crossing. Test with the player's layout (diagonal
   main + crossing + left branch).
4. Carry-over: an upgrade card says "No town or city in range" while estimating "+$9k/yr" — make the range check and
   the estimate use the same catchment data and never contradict.

**Phase 31 status**
- [x] 1. Middle-stop unloading: root cause found and fixed (trains now call at ordered stations their route runs through); `tests/sim/trains/middleStop.test.ts` (player's 3-stop loop + property test over random 2–4 stop routes).
- [x] 2. Train panel is view-only; "Add stop … Done" toggle (`e2e/phase31.spec.ts`).
- [~] 3. Route-precise junction waits: not reproduced as a sim defect — see PROGRESS (tests added, no sim change).
- [x] 4. Upgrade card hint and estimate share `cityInCatchment` (`tests/ui/upgradeHint.test.ts`).

## Phase 32 — Play-test 12: revert calling points; train spawning with cargo
Player report (Trieste, 1840): a freight train with orders Ljubljana Iron Mine → Ljubljana Coal Mine → Trieste Steel
Mill → Trieste.
1. **Revert Phase 31's "calling points"** (stopping at every ordered station the route passes through). Because the
   train passes Trieste on its way to the mines, it now stops there and unloads the iron ore and coal (Trieste's port
   accepts them) instead of taking them to the steel mill — the player's chain is broken. Owner decision: a train
   stops only at its current target (as before Phase 31). Remove `callingIndex`/`activeOrderIndex` behaviour and the
   SPEC §7.2 "calling points" addition; keep the property test but assert the old rule; keep the Venice repro as a
   documentation test of the expected (old) behaviour.
   Instead, make the Venice case understandable: when a train's path runs through one of its own ordered stations
   without stopping there, the Route tab shows a small note on that stop ("Passed without stopping on the way from
   Ljubljana — add it again after Ljubljana to stop both ways") with a one-tap "Add stop here" action.
2. **Train spawned with full iron-ore cars** at Trieste (where it was bought, at the Engine Shed) before it had ever
   visited the iron mine (second screenshot, Dec 3 1840: two ore cars full). Find out where the ore came from (loading
   at the purchase station? transfer/port pile? a calling point at Trieste because Trieste is order 4?) and fix: a new
   train starts empty and loads only at an order stop it actually serves under its rules. Regression test with the
   player's orders.

Status: **done** — [x] item 2 (root cause + regression test), [x] item 1 (revert, Route-tab note + "Add stop here", tests, SPEC §7.2).

## Phase 33 — Play-test 13: steel chain not producing/loading; easier connecting curves
Player report (Trieste, 1841): Train 3 orders Ljubljana Iron Mine → Ljubljana Coal Mine → Trieste Steel Mill →
Trieste (Auto everywhere), cars 2× iron ore, 2× coal, 1× steel.
1. **Steel never loads.** Trieste Steel Mill station: Supplies steel "0 per month", "2–6 waiting"; the train's steel car
   always empty; the player saw a message like "no train stops here that accepts steel" although Trieste is the
   next stop. Investigate with this exact setup (Central Europe 1840): (a) does the mill actually receive the ore and
   coal (recipe "all": needs both) and how much steel does a delivery of 40 t + 40 t make — is production too small
   or delayed, or is the monthly supply figure wrong; (b) does Trieste's station accept steel (Port acceptance 8 points
   vs threshold — is it partially in the catchment?), and if not, the UI must say so clearly *before* the player builds
   the route ("Trieste doesn't accept steel — nearest stations that do: …"); (c) why the steel car doesn't load. Fix
   real bugs; make the processing chain visible: station/industry panel shows "Received last month: 40 t coal, 40 t
   iron ore → made 40 t steel" and "Missing: iron ore" when one input is absent. Regression test with the player's
   chain: steel is produced and carried to a stop that accepts it.
2. **Connecting curves**: the player built a crossing with a turnout on one side, but to turn the other way had to
   build a separate track "far away". Explain/assist: a 90° change of direction needs two 45° bends with junction
   spacing between them. When the player drags a connection that would be illegal (too sharp), the build preview
   should automatically propose the **smallest legal connection** (shortest path of ≤45° bends respecting the junction
   rules) drawn in green, which one tap builds — instead of only a red refusal. Also allow the drag to end on an
   existing track tile and let the pathfinder pick the legal join point nearby.

Status: **done** — [x] item 1 (reproduction test, processor books, no-acceptor warning), [x] item 2 (smallest legal connection).

## Phase 34 — Play-test 14: live panels, quieter warnings, decluttering, train spacing, rich passenger pairs
Player report (Central Europe, 1840s), with phone screenshots:
1. **"No fares from this station yet" is wrong.** Trieste Steel Mill and Ljubljana Iron Mine stations show it in
   "Results here" although trains load there every trip and deliver elsewhere. Find out what the results block counts
   (probably revenue credited to the *unloading* station, or passengers only) and fix it: a station's results must
   show cargo loaded here and the income it earned on delivery ("Sent from here: 120 t iron ore → $4.2k"), plus
   what was delivered here. Freight-only stations must never say "fares". Unit test with a mine → mill route.
2. **Live refresh.** Open panels show stale numbers: the Buy button in the new-train sheet stayed disabled after cash
   rose above the price; waiting cargo counts on the station panel don't change. Every open panel/sheet re-renders
   its dynamic parts (cash-dependent buttons, waiting cargo, train load/status, processor books, line figures) at
   least once per game day — **without** losing scroll position, focus, open dropdowns or text being typed
   (patch values in place, or re-render only when the rendered data changed). E2E: open buy sheet with too little
   cash, add cash via debug, button enables without reopening.
3. **Warnings only at confirm.** While building a route, cargo-gap warnings ("No stop on this route accepts …")
   are not shown inline per stop. Show them once, in a compact confirm step when the player taps Buy / Save route
   ("Steel has nowhere to go on this route — Buy anyway / Back"). Already-bought trains: one small collapsed line
   in the train panel ("1 warning ▸"), not big red boxes.
4. **Declutter panels**, especially the processor block ("Waiting to be processed"). Target: one heading line and
   at most ~3 short lines: "Food plant · makes food from grain or livestock", "Last month: 40 t grain → 40 t food",
   "Waiting: 12 t grain". Detail goes behind a "▸ details" toggle. Fix the wording slip: it says "made into goods"
   for every processor — use the actual product (steel, food, …). Review station, train and line panels for
   similar redundancy (repeated headings, zero rows, explanatory paragraphs that could be a one-line hint) and
   trim. Look at every screenshot on a 800×360 viewport.
5. **"Missing" only when truly missing.** For recipe "any" (food: grain *or* livestock) never list all inputs as
   missing — say "Needs grain or livestock" only when no input arrived and none is on the way. For any recipe, an
   input that a train ordered to unload here is carrying (or is scheduled to fetch) counts as *on the way*: show
   nothing, or a neutral "grain on the way". The red "Missing" is only for inputs no train brings.
6. **Turned away is passengers/mail only.** Freight-only stations (or the freight rows) never show "nobody turned
   away"/lost fares lines. While here: relabel "turned away / lost fares" as neutral **"Unserved demand"** with
   a one-line hint ("more cars or trains would carry them").
7. **Save-name input styling.** The text input in the save dialog uses browser defaults; style it like the rest of
   the game (theme colours, font, border, radius, padding, focus ring) — add a shared `.input` style in theme.css.
8. **Lines view figures are inconsistent.** "Venice – Milan Crossing · 8 trains · Revenue $8k · Costs $0" next to
   "+$446k/yr". Revenue/Costs and the per-year profit must use the same period and be labelled
   ("This year: revenue $X, costs $Y" and "Rate: +$Z/yr" from a rolling 12 months, or similar). New trains must not
   produce absurd extrapolations; costs must include the trains' running/upkeep costs. Unit test.
9. **Even spacing of trains on a line.** Several trains on the same route bunch up and the last one gets almost
   nothing. `TrainOrder.minGapDays` (Phase 30A) exists in the sim but has no UI. Expose it: in the train's route
   tab per stop a "Min. days between departures" stepper (Off/1/2/3/5/7…), and on the Lines view a one-tap
   **"Space trains evenly"** action that sets each stop's gap to (round-trip time ÷ number of trains on the
   line) for all trains of the line, through a command. Explain in a one-line hint. Note: "wait for full load"
   also spreads trains, but a train that waits for full at a busy stop blocks a platform — both options stay.
10. **Rich passenger pairs (balance, real mechanism only).** Venice–Milan in 1847: 4 trains ≈ $183k/yr, 8 trains ×
   5 passenger cars ≈ $446k/yr. Each added train keeps earning about the same, because every train loads from one
   generic waiting pool (~587/month at Venice) whatever its destination. Investigate with a bench script: revenue per
   train and ROI vs. `docs/BALANCE.md` targets, as trains are added to one pair. If the marginal train stays highly
   profitable well beyond what two 1840s cities of this size could fill, model the real limit: **trip demand
   between a pair of towns is finite**: a gravity-style generation (population of both ends, distance, era) gives
   a monthly number of trips *to each destination*. A train only boards passengers bound for stops on its route.
   Adding trains beyond that demand gives emptier trains. This must not wreck small early lines: check
   `npm run bench` / goodPlayer and the Hard vs Normal gap, update BALANCE.md, and record the SPEC change
   (§9.5b). No flat multipliers.

Status: [x] 1 [x] 2 [x] 3 [x] 4 [x] 5 [x] 6 [x] 7 [x] 8 [x] 9 [x] 10

## Phase 35 — Play-test 15: passenger destinations the player can see (replaces Phase 34 item 10's boarding rule)
Player report: after Phase 34, Venice always shows hundreds waiting (e.g. "672 waiting") but trains on "Full load"
leave half empty, because waiting passengers are bound for places no train from here serves. Not transparent.
Agreed design with the player (SPEC §9.5d to be rewritten accordingly):
1. **Town total is the cap.** Each town/station generates its monthly passenger total as before (population-based;
   this is the hard cap). That total is **split over destinations** by a gravity share: weight = destination size ×
   distance decay (closer and bigger takes most; a tiny town across the map gets ~1). Normalise over the towns within
   an era travel range (grows with year, data table in `src/data/economy.ts`), not the whole map, so a single first
   line still captures a fair share. Tune with the bench: the 1840 Normal goodPlayer start must not lose more than
   ~20 % vs. pre-Phase-34 at 1856, and the Venice–Milan pair scaling (Phase 34 bench `pairScaling.ts`) must still
   show diminishing returns for extra trains.
2. **Only reachable destinations wait.** A destination's share appears on the platform only if it is **reachable**
   from this station through the player's train network: a graph search over stations linked by any train's orders
   (consecutive stops in either direction of a train's cycle), any number of changes. Unreachable shares are not
   generated at all (they never appear as "waiting"). Cache reachability; recompute when orders/trains change.
3. **First leg only.** A passenger is stored by **first leg** = the next station on the shortest (distance) route to
   their final destination; ties broken deterministically. Any train whose orders include that first-leg station
   (as a later stop) boards them. They leave the game at that station (paid for that leg only) — no transfers are
   tracked. Through passengers on a direct A–B–C train stay on as now. Consequence: the waiting number always equals
   what the trains calling here can take; a train never refuses people that are shown as waiting.
4. **Mail** keeps its current model (no destinations) unless trivially consistent; document what you chose.
5. **Station panel** stays as today (one waiting number). Tapping the passenger supply/waiting tile opens a small
   "Where passengers go" detail sheet (per month): a list of bars **by first train stop** (each bar includes people
   travelling further), each row expandable (▸, closed by default) to final destinations ("Ljubljana 30 · Zagreb 15 ·
   Belgrade 5"), then one line **Not connected**: "Padua ~20 · Verona ~12 · 4 more" (top shares of unreachable
   towns, a hint for expansion). Must be readable at 800×360 with 10+ destinations. Strings in strings.ts.
6. **"$0 fares earned" at Venice** (Mar 1842, 4 passenger trains running, panel says "Last month … $0 fares
   earned", "320 unserved demand"): check whether it is only because trains were new that month or a crediting bug;
   fix if a bug. Also check the "Unserved demand" figure is consistent with the new model (only reachable demand
   that could not board).
7. Migration: old saves with Phase 34 `bound` piles convert cleanly (re-split or drop to first-leg buckets).
8. Tests: unit — gravity split sums to the town total; unreachable destinations generate nothing; reachability with
   2 changes (Venice→Ljubljana→Zagreb→Belgrade) puts Belgrade-bound people in the Ljubljana bucket; a train boards
   everyone waiting for its stops; determinism. E2E — detail sheet opens, expands a row, screenshot
   `phase-35-destinations.png`. Bench numbers before/after in PROGRESS and BALANCE.md; Hard vs Normal gap reported
   (target ≥ 40 % lower on Hard; note if not met and why).

Status: [x] 1 [x] 2 [x] 3 [x] 4 [x] 5 [x] 6 [x] 7 [x] 8

## Phase 35B — Fix: the first connection captures the whole town total; "Not connected" is empty
Player report: Ljubljana–Trieste line: "About 118 people a month", all to Trieste. After adding a Trieste–Venice line
it is still 118, now split "Venice 78 · Trieste 40". The "Not connected" hint shows nothing.
Root cause (passengerFlows.ts): the candidate towns are only those within `travelRangeTiles` (≈ 22 tiles = 110 km in
1840) plus reachable ones, and the denominator is max(Σ candidate weights, own-size floor). In 1840 almost no town is
in range, so the candidate set is just the reachable towns and the first nearby connection already gets share ≈ 1:
the whole base supply. Every later connection only re-splits the same 118. Same reason the unconnected list is empty.
Fix (keep the agreed design: town total is the cap, gravity split, only reachable shares appear):
1. **Candidate set = all towns within a wider "known destinations" radius** (data table, e.g. 1840 ≈ 60 tiles /
   300 km, growing with the era) — not only reachable ones. Shares are normalised over that whole set, so one
   connection captures only its gravity share (a typical first line ≈ 30–50 %), and each new connected town adds its
   own share. Towns beyond the radius but reachable still count (added to the set). Drop or rework the own-size floor
   so it cannot make a single line take ~100 %.
2. **Recalibrate the town total** (the cap) so a typical first line carries about what it carries today: the base
   passenger generation rises by the inverse of the typical first-line share, defined in `src/data/` and justified
   (it is the town's total travel demand, of which a line serves a share). Verify with the bench: 1840 Normal net
   worth 1856 back within ~10–15 % of pre-Phase-34 ($3.9M); 1900 Normal 1916 should recover substantially from
   $4.0M (report it); Hard ≥ 40 % below Normal; Venice–Milan pair scaling keeps diminishing returns (marginal ROI of
   extra trains on one pair stays low). A connected network must clearly earn more passengers per station than an
   isolated pair.
3. **Not connected** lists the top towns of that radius with their monthly numbers (up to 3 + "N more"), largest
   first; never empty when towns exist in the radius. Add a short hint line: "Connect them to win these travellers".
4. Tests: Ljubljana-like fixture — connecting a second destination **increases** the station's total; a single
   connection takes < 100 % when other towns are in the radius; unconnected list non-empty; sum of reachable +
   unconnected = total. Update the e2e screenshot `phase-35-destinations.png` and SPEC §9.5d.

Status: [x] 1 [x] 2 [x] 3 [x] 4

## Phase 35C — Fix: passenger numbers far too high after 35B (town panel 118/month, station 830/month)
Player report (1840–41, central-eu): Ljubljana (town, 15k) town panel "Supplies 118/month" but Ljubljana Crossing
station "830/month, 742 waiting"; Trieste (25k) town panel 196/month, station 900/month of which "Venice 792". Too
many people waiting, and the two panels disagree.
Root cause: Phase 35B's `PAIR_DEMAND.totalDemandMult = 10` makes a town's total 10× the §6.3 supply, and with size-only
weights inside 300 km a small town linked to a big city sends (city size ÷ own size) × its old supply — a line to a
city 4× bigger carries 4× what any line carried before. Distance has no effect inside 300 km, contrary to the agreed
design ("closest large town takes most").
Fix — make the total a real, explainable number and keep everything consistent:
1. **Town travel demand from population**: T = population × trips per person per month (data table by era, short
   comment on the historical basis — e.g. railway journeys per head per year rising from ~1 in the 1840s). Remove
   `totalDemandMult` and the own-size floor. Calibrate the table so a 15k town in 1840 has a total of roughly 2–3×
   today's §6.3 town supply (≈ 250–350/month), not 10×.
2. **Gravity with real distance decay**: weight = destination population ÷ max(distance, ~15 tiles)^e (e ≈ 1), over all
   towns in the known-destination radius (keep 35B's radius table). Shares sum to 1 over the candidates; the station
   generates T × Σ reachable shares. Nearer and bigger takes most; a far small town gets little. Make the share of
   any single destination ≤ ~50 % of T unless it is the only town in the radius.
3. **One number everywhere**: the town panel's passenger figure = the town's total travel demand T, with a line
   "connected: N/month (X %)"; the station supply = the reachable part for that station; the destinations sheet
   header = the same station figure. Mail unchanged.
4. **Waiting is realistic**: people do not wait a month on a platform. Passengers' patience (`WAITING_PATIENCE`)
   → grace ~3 days, then giving up ~15 %/day, so the waiting pile stays around a week of supply. Document it.
5. **Bench / balance** (report before → after, don't over-tune): 1840 Normal 1856 and 1870, 1900 Normal 1916, Hard gaps,
   Venice–Milan pair scaling, and the Trieste–Venice case from the report (station supply should be a few hundred a
   month, not ~800). If early Normal drops a lot (> 25 % vs pre-34 $3.9M at 1856), say so and suggest which real
   lever (trips per head table) would restore it — do not reintroduce a flat multiplier.
6. Tests: town total = population × rate; panels agree; single-destination share cap; nearer town of equal size takes
   more; waiting pile bounded by ~patience × daily supply; adding a connection increases the station total.
   Regenerate `phase-35-destinations.png` (+ a town panel screenshot `phase-35c-town.png`), SPEC §9.5d updated.
7. **Addendum (player report, Apr 1843)**: Venice station "901/month, **2784 waiting**" (3× a month's supply, so the
   first-leg buckets apparently don't give up like the generic pile), and Venice–Milan with 13 trains at
   "Rate +$737k/yr" in 1843. Verify give-up applies to every `bound` bucket (and migrated piles), bound the pile
   with a test, and re-check the 13-train Venice–Milan rate after items 1–4. It must show clear diminishing returns
   (report revenue for 1/4/8/13 trains).

Status: [x] 1 [x] 2 [x] 3 [x] 4 [x] 5 [x] 6

## Phase 35D — Simple waiting rule for passengers and mail
Player decision (replaces the Phase 35C patience rule for passengers and mail; freight unchanged):
1. **Linear fill, one-month cap, no attrition.** For each passenger bucket (first leg, or the generic pile at a
   station no passenger train calls at), waiting grows linearly at its monthly rate (rate/30 per day) and stops at
   **one month's worth** of that bucket (e.g. 150/month to Venice → at most 150 waiting for Venice). A train taking
   80 drops it to 70 and it refills linearly. Nobody gives up. Mail: same rule (one month of mail per bucket/pile).
   Remove `WAITING_PATIENCE` for passengers and mail (keep the mechanism for any freight that uses it, if any).
2. **Unserved demand** = people (mail) generated while their bucket was already full (overflow), shown as today
   for passengers and mail only. Hint text: "Platform full: a month's travellers are waiting — run more trains or
   cars." Update strings.
3. **Freight unchanged** (storage caps, warehouses, etc. as now).
4. When reachability changes and a bucket's monthly rate falls, clamp its waiting to the new cap; people of a
   destination that is no longer reachable go to the generic/other bucket logic as in Phase 35 migration (no loss
   of determinism). Old saves load cleanly.
5. Tests: linear accrual (half a month → half the cap), cap holds, train boarding then refill, overflow counted as
   unserved, mail same, freight unaffected; update tests that depended on patience. Bench: report 1840 Normal 1856 /
   1870, 1840 Hard 1870, 1900 Normal/Hard 1916 and Venice–Milan pair scaling (1/4/8/13 trains), before → after. No
   other balance changes in this phase. SPEC §9.5d updated.

Status: [x] 1 [x] 2 [x] 3 [x] 4 [x] 5

## Phase 35E — Retune trips per head after the Phase 35D waiting rule; restore loosened balance bounds
Player decision: keep the 35D waiting rule; lower the passenger rate (`TRIPS_PER_HEAD_ANCHORS`) by roughly 35–40 %
so the economy returns to the pre-Phase-34 curve. Only this table changes (plus tests/docs).
1. Tune the table (same shape, one factor, or adjust a single anchor if clearly needed) so that, on central-eu
   goodPlayer: 1840 Normal 1856 ≈ $3.9M (±15 %) and 1870 ≈ $17.8M (±20 %); 1900 Normal 1916 in $20–34M; Hard ≥ 40 %
   below Normal in both eras. Update the doc comment's numbers (the basis text stays a real per-head rate).
2. **Restore the balance bounds that 35D loosened** to their pre-35D values where they now pass:
   `balance.test.ts`, `balancePassengers.test.ts` (pax/coal 100 km ratio back to 0.8–1.2×; mail/pax floor 0.1),
   `singleTrack.test.ts` (spacing > 10 %), `goalCalibration.test.ts` floor back to 0.8 (remove the TODO). If a bound
   still fails after tuning, do NOT loosen it: report the measured value and which way the table would have to move,
   and pick the table value that satisfies the most bounds; if goals fall under the floor, propose new goal amounts
   in PROGRESS (do not change goals without the owner).
3. Report: before → after bench (1840 N/H, 1900 N/H), Venice–Milan pair scaling 1/4/8/13 trains, Venice station
   supply on the player's map in 1843 (target roughly 850–900/month, was 1407), and the pax vs coal ratio. SPEC §9.5d
   and BALANCE.md updated.

Status: [x] 1 [x] 2 (no bound can be restored: see PROGRESS 35E) [x] 3

## Phase 36 — Visible industry growth; carriages cost more than wagons
Owner: keep panels short (one line, no paragraphs). No hidden or random balance mechanisms.
1. **Steady, visible industry growth** replaces the hidden random roll in `industryDynamics.ts` (3 %/month chance of
   +20 %, shrink when unserved). Raw producers (mines, farms, forests, wells…) change output smoothly each month
   based on **how much of their output trains carried** in the last months (share carried): well served → grows
   (e.g. up to ~+8 %/yr), poorly served/unserved → slowly declines toward a floor; cap stays 3× base (data table
   in `src/data/industries.ts`, values chosen so a well-served mine roughly doubles in ~10 years). Deterministic.
   UI: ONE line on the industry/station supply row, e.g. "60 t/mo ↑ 6 %/yr" (↓ when declining, nothing when flat)
   plus a tooltip-free short hint only in the existing details toggle ("Grows when trains carry most of its output").
   Migrate saves (keep current `growthMult`).
2. **Passenger carriages cost more than freight wagons** (historically several times a wagon): passenger car
   price ~3× a basic freight wagon and higher per-car running/maintenance (data in `src/data/cargo.ts` /
   trains data, with a one-line comment on the basis). Mail car similar to passenger. Check current per-car upkeep
   exists; if not, add a per-car yearly maintenance by car type to the train maintenance cost.
3. Bench & bounds: report central-eu goodPlayer (1840 N/H 1856/1870, 1900 N/H 1916), Venice–Milan 1/4/8/13, and
   pax/coal ratio before → after. Retune ONLY `TRIPS_PER_HEAD_ANCHORS` if the 1840 Normal bench leaves $3.9M ±20 %.
   Then try to restore the balance bounds 35D loosened (pax/coal 0.8–1.2×, etc.); restore those that now pass,
   report measured values for the rest (never loosen). Update SPEC/BALANCE.
4. Tests: growth is deterministic, grows with high share carried, declines when unserved, capped; carriage prices.
   Screenshot `phase-36-industry-growth.png` (look at it: one line, no clutter).

Status: [x] 1 [x] 2 [x] 3 (two bounds restored, the rest measured: see PROGRESS 36) [x] 4

## Phase 37 — Era-based balance checks; harder top goals
Owner decision: passengers may out-earn freight early (historically true in the 1840s); freight must catch up through
the Phase 36 industry growth. Replace the loosened Phase 35D/36 bounds with **era-based** checks — no balance numbers
change in this phase except goal amounts.
1. Balance checks by era (tests/sim/balance*.test.ts): 1840s Town↔Town pax vs coal at 100 km 1.5–2.5×; by ~1880 a
   well-served coal line (mine grown by served share over the decades, the Phase 36 mechanism, simulated) earns
   ≥ 0.9× a comparable passenger line. Measure honestly; if freight does NOT catch up by 1880, do not tune — report it
   in PROGRESS with the measured ratios by decade (1840/1860/1880/1900) as a finding for the owner.
   Remove the "temporarily loosened" comments; each bound has a one-line rationale.
2. Goals: raise central-eu gold (netWorth $150M by 1930) and us-west gold (annualRevenue $3M by 1900) so the
   reference operator ratio is back ≥ 0.8 (builder estimate ~$190–250M; ~1.5× for us-west); restore the
   `goalCalibration` floor 0.8 and remove its TODO. Check the other goals still pass.
3. Update BALANCE.md (regenerate), SPEC deviations, PROGRESS.

Status: [x] 1 [x] 2 [x] 3

## Phase 38 — Play-test 3 fixes: bugs, chains that pay, small clarity items
Source: docs/PLAYTEST-3.md. Keep panels short (owner hates clutter).
1. **B1 freeze-on-bulldoze**: bulldozing track a train occupies or is about to enter (its current route ahead) is
   refused with a clear reason ("Train 3 is using this track"); if a route becomes impossible any other way, the
   train goes `noRoute` and the existing Stuck indicator + news fire. Test.
2. **B2 processor input cap**: enforce `INDUSTRY_INPUT_STORAGE_CAP` (now unused). When a processor's input stock is
   full, that cargo is **not accepted** there (it stays on the train / not unloaded, like an unaccepted cargo) and
   is not paid. Panel line becomes "Stock: 240 t grain (full)" instead of "Waiting: 2098 t". Migrate saves (clamp).
3. **BAL1 chains that pay**: processors scale output with input: output per month = inputs received (by recipe;
   "all" = min of inputs, "any" = sum) converted 1:1 (or the recipe ratio), up to a cap that is **3× the base
   output** (same as raw producers' growth cap), so a growing farm lifts the whole chain. Data in
   `src/data/industries.ts`. Measure the farm → Food Plant → town chain before/after (both legs' revenue).
4. **B3 demolished station**: trains whose orders lose a stop drop it (already) — if fewer than 2 stops remain, the
   train is stopped at its position with status "No route" and a one-tap "Edit route" in the news item; no running
   cost while stopped with no orders? (keep running cost; just make it visible). Test.
5. **UX small items**: (a) station subtitle uses the same town as the name (pick the name's rule); (b) a station
   without an Engine Shed shows a disabled "Buy Train" with the one-line reason "Needs an Engine Shed"; (c) after
   loading a save, centre the camera on the player's network (largest station cluster) and suppress stale toasts;
   (d) forced loans post a news item "Borrowed $X to stay solvent"; (e) "Full load" at a passenger stop shows a
   one-line warning ("Passenger trains earn less waiting for full") — no extra panels.
6. Bench (1840 N, 1900 N/H) before/after; e2e screenshots `phase-38-*.png` for 2, 5b; look at them.

Status: [x] 1 [x] 2 [x] 3 [x] 4 [x] 5 [x] 6

## Phase 39 — Difficulty that bites: bad choices bleed, real debt, bankruptcy, panics
Owner: on Normal, bad choices must be able to bankrupt you (not just stall); on Hard, bankruptcy is common unless
play is very good. Real mechanisms only; clear warnings; short UI. Do this AFTER Phase 38 is on main.
1. **Bad-player bench bots** (tools/bench): keep `goodPlayer`; add `overbuilder` (long lines to small towns),
   `trainSpammer` (too many trains on one pair), `leveraged` (borrows to the limit early). Run each over 3 seeds,
   Normal and Hard, 1840 and 1900. Report a survival table BEFORE changing anything.
2. **Bad assets bleed monthly**: running cost per train-km (crew wages, fuel/coal, wear) scaled by locomotive and
   consist, so an empty/half-empty train on a weak route loses money every month; per-km track upkeep already
   exists — check it is felt on long lines to small towns. Keep the competent bench on its curve (retune only via
   real cost tables; no flat multipliers).
3. **Real debt**: loans as bonds with interest and **repayment** (e.g. 10-year term, yearly principal), credit limit
   = f(trailing 12-month operating profit and assets), interest rising with leverage (exists — verify). Forced
   borrowing posts a news item. **Bankruptcy**: if cash < 0 and no credit left at a month end → warning
   ("Insolvent: 3 months to recover"), after 3 consecutive months → bankrupt, game over screen with a summary.
4. **Financial panics** (historical: 1857, 1873, 1893, 1907, 1929…; regions may differ): news item, demand for
   passengers and freight −20…−40 % for 12–24 months, credit tightens. Deterministic per seed. Harsher on Hard.
5. **Difficulty table** in `src/data/`: Hard = lower credit limit, higher base rate, shorter grace (2 months),
   harsher panics, land ×1.5 (exists). Easy = forgiving.
6. **Targets (become tests)**: Normal — goodPlayer survives all seeds; each bad bot bankrupt in ≥ ~50 % of runs.
   Hard — goodPlayer survives with a thin margin (min cash shown); bad bots bankrupt in ≥ ~80 %. Easy — bad bots
   mostly survive. Report the table after; SPEC/BALANCE updated.
7. UI: insolvency banner (one line + days left), game-over screen; e2e screenshot `phase-39-*.png`.

Status: [x] 1 [x] 2 [x] 3 [x] 4 [x] 5 [x] 6 (leveraged on Hard 4/6 = 67 %, target 80 %: see PROGRESS) [x] 7

## Phase 40 — A valuable long-haul chain (silver before ~1940, uranium after)
Owner idea: present from the start, far apart, not worth it early (long track, slow trains, costly cars), the big
late-game prize. Do this AFTER Phase 39.
0. First, a quick check left from Phase 39: in the survival-after table the rows "trainSpammer 1900 hard" and
   "leveraged 1900 hard" are identical to the cent (1.02 / 1.37 / 1.38) — verify the two bots really differ
   (copy/paste or bot-selection bug in `survival.ts`?) and fix/re-run those rows if so.
1. Chain by era: **silver ore → smelter → mint** (start year < 1940); **uranium ore → enrichment plant → nuclear
   power plant** (≥ 1940; if the game runs past 1940 with silver already placed, keep silver). One chain per map,
   sites placed far apart (each leg ≥ ~1/3 of the map), deterministic per seed.
2. **Paid only on final delivery** (bars at the mint / enriched uranium at the power plant): high value per ton,
   with a long-distance bonus measured from the ore's origin. Intermediate legs pay nothing (cargo carries its
   origin tile). Station panel: one line "Pays on arrival at <Mint>: ~$X/t".
3. **Special secure cars**: several × a wagon price, small capacity, higher upkeep (data tables).
4. Balance check with the bench: connecting the chain in the first ~15 years should be a poor investment; by
   mid/late game a strong one. Report ROI by start decade. Tests; screenshot `phase-40-*.png`; SPEC updated.

Status: [x] 0 [x] 1 [x] 2 [x] 3 [x] 4

## Phase 41 — Play-test 4 fixes: visible causes, era start, chain bottlenecks, uranium output
Source: docs/PLAYTEST-4.md (top 5). Short UI only. Owner: keep uranium; if it earns too much, **the mines produce
less** (no price cut, no demand cap).
1. **Heavy engine vs wooden bridge (B1)**: `noRoute` caused by a bridge weight limit says so on the train panel and
   in the news ("Hudson is too heavy for the wooden bridge near X"), with a one-tap "Rebuild in stone ($X)"
   (command; uses existing bridge types/costs). The buy wizard warns when an order leg crosses a wooden bridge the
   chosen engine can't use, and pre-selects the best *usable* engine (also fixes the electric-locked default, UX6).
2. **Warnings you can see (B2, UX3, UX4)**: toasts stack below the status banner (never cover it); banner and toast
   use the same wording ("1 month to recover"). News + banner 3 months before start-up credit ends ("Start-up
   credit ends in 3 months: limit will be ~$X"), and when debt exceeds the limit before the first call ("Debt $Y over
   limit $X: lenders call 25 %/month"). Insolvent news suggests "sell trains or raise cash". Borrow shows one line:
   rate, 10-year term, monthly repayment. Dedupe identical toasts within a few seconds (UX2/UX8).
3. **Era start (BAL1)**: starting cash scales with the era's price level (data table; 1840 unchanged), and New Game
   labels late starts ("Expert: few, expensive first lines") if they stay harder. Add 1930 and 1950 rows to
   `tools/bench/survival.ts`; goodPlayer must not go bankrupt there (fix its opener if it is the bench's fault).
4. **Chain bottlenecks visible (BAL3, BAL4)**: station supply row shows "Pile full: N t lost last month" when
   production overflowed the station's pile (+ "Terminal holds 150 t" if upgradable). The single-track jam toast
   shows the passing-loop price and taps into the loop tool at that place; posted once.
5. **Honest chain pay (UX1) + uranium output**: "Pays on arrival" line adds the yearly figure at the mine's current
   output ("~$X/t · ~$Y/yr at full output"). Measure uranium on the real map (playtest's central-eu seed 1, 1950)
   and the bench; if it exceeds ~2× the 1930 silver return, lower `LONG_HAUL_OUTPUT_ANCHORS` for uranium (mine
   produces less) until it does not. Report before/after.
6. Tests for each; screenshots `phase-41-*.png` (look at them); survival + goodPlayer numbers before/after.

Status: [x] 1 [x] 2 [x] 3 [x] 4 [x] 5 [x] 6

## Phase 42 — Late eras as unforgiving as 1840/1900
Owner: 1930/1950 starts must punish bad choices like 1840/1900 (Phase 39 targets). Real mechanisms only.
1. **Later crises** in `src/data/panics.ts` (historical, deterministic per seed as today): e.g. 1937–38 recession,
   1948–49, 1953–54, 1957–58, 1973–75 oil crisis, 1979–82; regions may differ. The **oil crises also raise fuel
   prices** for diesel/steam (data table by year; electric unaffected) — a real cost shock, shown in the panic
   banner/news ("Oil crisis: fuel +60 %").
2. **Late-era competition and costs, if needed to reach the targets** (measure first): road competition (trucks/cars)
   that grows after ~1920 already exists? — verify it bites in 1930–1980 for short hauls; wages rising faster than
   fares after 1945 (data tables). Keep the good bot's late-era curve within ~±20 %.
3. **Targets** (extend `survival.ts ASSERT`): 1930 and 1950, Normal: goodPlayer survives all seeds; each bad bot
   bankrupt ≥ ~50 %. Hard: goodPlayer survives (thin margin), bad bots ≥ ~80 %. Easy: no bankruptcy. Report the
   full table (1840/1900/1930/1950) before/after; 1840/1900 must not get easier or break.
4. Tests for the new data (crisis years, fuel shock), SPEC/BALANCE updated; one-line UI only.

Status: [x] 1 [x] 2 [~] 3 (Normal met; Hard 67 % for trainSpammer/leveraged, see PROGRESS) [x] 4

## Phase 43 — Realistic break-even: crowded lines have losing trains; transparency
Owner report (1845–46, Venice–Milan, 18 Norris trains × 5 cars + 1 Venice–Trieste train): every train earns
($4k–$20k/yr even when nearly empty); Venice shows 907 waiting (mostly Trieste-bound, invisible). Owner: on a crowded
route some trains should lose money. Real mechanisms only.
1. **Break-even load factor ~40–50 %**: raise per-train running costs to realistic levels — crew paid per hour of
   service (including waiting at stations/signals), fuel/water and wear per km run regardless of load — so a train
   ~45 % full breaks even and a ~20 % full train loses money. Then retune ONLY `TRIPS_PER_HEAD_ANCHORS` so a
   well-loaded train earns about what it does now. Data tables with a one-line historical basis.
2. **Owner's scenario as a fixed test/bench** (`tools/bench/` + vitest where fast enough): central-eu, 1842 start,
   Venice–Milan 18 Norris × 5 pax cars + Venice–Trieste 1 train; after 2 years: the first ~5–6 trains profitable,
   the marginal trains ≤ 0, line total profit below the 6-train optimum. Also the pairScaling table before/after.
3. **Transparency (short UI)**: train list shows load % per train ("load 23 %"); station waiting shows the split
   by destination (one short line: "Milan 40 · Trieste 540"); destinations sheet rows show "N/mo · M waiting";
   Lines view one hint per line when over-served: "~6 trains would carry this demand".
4. **Re-check difficulty**: goodPlayer bench (1840/1900/1930/1950) within ±20 % of now; survival targets incl. the
   Hard misses (trainSpammer/leveraged 67 %) — report whether higher running costs close them. Never loosen bounds.
5. Tests, SPEC/BALANCE, screenshots `phase-43-*.png` (look at them).
6. **Suspected bug (orchestrator)**: owner's Lines view showed Venice–Milan "Rate +$539k/yr" while "This year: revenue $8k" after 9 days (≈$320k/yr revenue) and the owner bench gives line revenue $143k/yr, profit $52k/yr. A profit rate above revenue is impossible: check `ratePerYear` in `lineSummaries` (trains bought mid-window, owned-time scaling, accrued costs) and fix; test with trains bought at different times.

Status: [~] 1 (45 % break-even NOT reached; 1840s at realism 0.2, see PROGRESS Phase 43 follow-up) [x] 2 [x] 3 [~] 4 (1840 table done, 1900/1930/1950 bad bots not re-run) [x] 5 [ ] 6

## Phase 43B — Follow-up: Lines "Rate" bug; late-era survival re-check
1. **Lines "Rate" bug** (Phase 43 item 6, not done): owner's Lines view showed Venice–Milan "Rate +$539k/yr" while the
   line's revenue was ~$300k/yr. Find why `ratePerYear` in `lineSummaries` can exceed revenue (trains bought within the
   rolling window, owned-time scaling, accrued costs, lifetime vs window books) and fix it; unit tests with trains bought
   at different times and a mid-year load (the rate must never exceed revenue, and must match profit/time owned).
2. **Survival re-check on the final Phase 43 anchors**: run `ASSERT=1 npx tsx tools/bench/survival.ts 3` for 1900, 1930,
   1950 (all bots, all difficulties) to completion; report the full table. If a target fails, report it; do not tune
   or loosen anything in this phase (owner decides next).
Status: [x] 1 [x] 2

## Phase 44 — Hard lenders vs risky leverage; the 1950 Normal good-bot bankruptcy
Source: Phase 43B survival table. Real mechanisms only; never loosen a bound; short UI.
1. **Hard: lenders punish risky leverage** — on Hard only, when debt exceeds ~50 % of net worth, lenders shorten the
   bond term / raise the monthly call (e.g. call fraction rises with the debt-to-net-worth ratio) and charge a risk
   premium. One-line warning in Finance/banner ("Lenders nervous: debt is 70 % of net worth"). Data in the difficulty
   table. Target: trainSpammer and leveraged on Hard 1930–1950 ≥ 80 % bankrupt (were 3/6); goodPlayer on Hard must
   still survive every seed in every era (check its debt ratio stays below the threshold; if the good bot itself
   is risky, report it rather than weaken the rule).
2. **1950 Normal seed 3 good-bot bankruptcy**: trace the run (cash, loans, panics, fuel shocks, revenue by year) and
   report the cause in PROGRESS. Fix only if it is a bug or a bench-bot flaw; if it is a real-but-rare outcome (e.g.
   a crisis right after the first big build), say so and leave it.
3. Full survival table 1840/1900/1930/1950 after (ASSERT=1); overbuilder Normal 1900 miss is accepted by the owner
   (stalls rather than bankrupts) — note it, don't tune for it. Tests, SPEC/BALANCE, PROGRESS.
Status: [x] 1 (mechanism in; Hard target not met, see PROGRESS) [x] 2 (traced, left) [x] 3 (partial: full table timed out)

## Phase 45 — Contracts: short, semi-random, balanced goals
Owner: contracts are a great idea; they must be **balanced** and **semi-random**. Short UI, no clutter. Deterministic
(seeded RNG in state), real mechanisms (a town or company offering a deal), never a free-money exploit.
1. **Contract types** (data table in `src/data/contracts.ts`):
   - **Delivery**: "Vienna needs 300 t of steel by Mar 1862" — only deliveries made *after* accepting count.
   - **Connection**: "Connect Graz to your network within 3 years — Graz pays 50 % of the track" (subsidy paid as a
     refund of the qualifying track cost, capped).
   - **Service**: "Carry 2,000 passengers Trieste ↔ Venice in the next 12 months."
   - **Rescue**: "The Linz coal mine closes unless served within 18 months" (success: mine keeps/grows; reward cash).
2. **Semi-random but sensible generation**: offers are drawn from the *current* game state — towns/industries near
   the player's network (within ~1.5× the player's average line length), real unmet demand (unserved cargo, cities
   demanding goods, unconnected nearby towns), era-appropriate cargo. Never impossible: the target is reachable by
   track, the quantity ≤ ~60 % of what the source can produce in the time, deadline from distance ÷ era train speed
   × a slack factor. Weighted random choice among candidates; 1 new offer every ~4–8 months; at most 3 open offers,
   at most 2 accepted at once; offers expire after ~3 months.
3. **Balance formula** (documented, data-driven): reward ≈ the estimated *extra* cost/effort to fulfil it (track km ×
   era track price for missing links, trains/cars needed, operating cost over the period) × a margin of 30–60 %, plus
   difficulty scaling (Easy more, Hard less), capped relative to company size (e.g. ≤ 25 % of net worth) so late-game
   contracts don't print money and early ones are worth doing. A connection subsidy is a share of actual qualifying
   track cost, never cash for nothing. Failing an accepted contract: a small penalty (e.g. 10 % of the reward) and
   fewer offers for a while ("the town is wary"). Bench: a tools/bench script that plays goodPlayer with a simple
   "accept if feasible" contract policy and reports contract income as a share of total income (target ~5–15 %,
   never > 25 %) and success rate; survival targets must not get easier for bad bots.
4. **UI (short)**: a news item when an offer appears ("Contract: Vienna needs 300 t steel by 1862 — $250k") with
   Accept / Later; a small "Contracts" button (badge with count) opening a list: one line per contract with a
   progress bar and days left; tap a row to highlight the town/industry on the map. Accept/decline via commands.
   Completion/failure as news. Strings in strings.ts. Screenshots `phase-45-*.png` (look at them).
5. Save/load (old saves get no contracts until the next offer), tests (generation feasibility, reward formula, only
   post-acceptance progress counts, caps, expiry, failure), SPEC section, PROGRESS with bench numbers.
Status: [x] 1 [x] 2 [x] 3 [x] 4 [x] 5 (bench share below target, see PROGRESS)

## Phase 46 — Scenarios, achievements, company history
Owner request. Short UI, procedural graphics only, strings in strings.ts, deterministic sim.
1. **Scenarios** (data in `src/data/scenarios.ts`, menu entry on the title screen "Scenarios"): 5–6 hand-made
   challenges on existing regions with a fixed start (year, cash, sometimes pre-built track/towns), a goal and a
   deadline, and a 1–3 star rating by how well/fast. Examples: "The Semmering line: connect Vienna to Trieste over
   the Alps by 1857"; "Panic of 1873: survive to 1878 with debt below $2M" (start 1871 with a leveraged company);
   "Coal for Vienna: deliver 20,000 t of coal by 1865"; "Transcontinental (us-west): connect east and west coast
   towns by 1869"; "Silver rush: deliver 500 t of silver bars to the Mint by 1890". Each must be beatable (verify with
   a scripted run in a test or bench) and fail-able. Win/lose screen reuses the game-over card style. Best stars
   saved locally (localStorage, outside the game save).
2. **Achievements** (data table, ~20–25): milestones like "First train", "100 km of track", "1,000 km", "Survived a
   panic", "Out of debt", "First contract", "5 contracts", "Silver delivered", "Uranium delivered", "Bridge builder"
   (10 bridges), "Electrified", "Metropolis served", "$1M / $10M / $100M net worth", "Hard-mode survivor 20 years".
   Unlock toast (one line) + an Achievements list (title screen and in-game menu) with locked/unlocked and date.
   Stored per profile in localStorage (cross-game) and also recorded in the save's history.
3. **Company history screen** (in-game menu + shown on game over / scenario end): a timeline of key events (first
   line, records, panics survived, contracts, achievements, bankruptcies avoided) and small procedural charts of net
   worth, revenue and track length by year (canvas, cached). Requires recording a yearly snapshot in the save
   (`state.history`), migration for old saves (history starts at load).
4. Tests (scenario goal evaluation, achievement triggers, history snapshots), e2e + screenshots `phase-46-*.png`
   (look at them), SPEC section, PROGRESS.
Status: [x] 1 [x] 2 [x] 3 [x] 4

## Phase 47 — Play-test 5 fixes (owner approved items 1–4 and 7 of `docs/playtests/PT5-SUMMARY.md`)
Short UI (one-liners), strings in strings.ts, numbers in src/data, deterministic sim, no flat balance multipliers.
1. **Contract money in the books.** Delivery/service/rescue rewards are paid straight into `state.cash`
   (`src/sim/contracts/progress.ts`) and appear nowhere. Book them through the ledger as a "Contracts" income line,
   and failure penalties as a "Contract penalty" expense line. Show both in Finance (year and history), Year in
   Review, and the History "Revenue by year" chart (contracts count as revenue there). Connection subsidies stay as
   negative construction (they refund track); note that in SPEC. Old saves: no migration needed beyond defaulting
   the new ledger keys to 0. Tests: a completed contract adds exactly its reward to this year's Contracts line; a
   failure books the penalty; cash change equals the ledger change.
2. **Toast cap.** At most 3 toasts visible at once. When a 4th arrives, the oldest goes (everything that matters is
   also in News). Keep the existing dedupe. The insolvency banner must stay visible (existing Phase 41 test).
   e2e: fire 10 toasts quickly, assert ≤ 3 on screen; screenshot `phase-47-toasts.png`.
3. **Difficulty one-liners** on the New Game screen under the Easy/Normal/Hard selector: one short line for the
   selected difficulty, built from the real difficulty data (grace months, start-up credit, lender rules, price
   level) — not hand-written numbers. E.g. "Hard: 2 months to fix negative cash; lenders charge more when debt
   exceeds half your net worth." Screenshot `phase-47-difficulty.png`.
4. **"Add a train" hint** from a real signal: when a line's trains run nearly full (average load ≥ 80 % on departure
   over the last month) and passengers or cargo waiting for that line exceed one train's capacity, show a one-line
   hint in that line's row ("Full trains, 240 waiting — add a train") and, the first time in a game, a hint card via
   the existing hints system. No new numbers scattered in logic: thresholds in src/data. Must not trigger on an
   under-served route where trains run empty. Unit test both cases; screenshot `phase-47-add-train.png`.
5. **Game-over card duration:** under one year show months ("8 months of railroading"); 1 year exactly singular.
6. Tests, `npm run check` + `npm run e2e`, look at screenshots, SPEC notes, PROGRESS entry.
Status: [x] 1 [x] 2 [x] 3 [x] 4 [x] 5 [x] 6

## Phase 48 — Through journeys: fewer, longer trains; multi-stop lines worth running
Owner feedback (2026-10-15): "Venice<->Trieste can have 10 passenger trains… it never pays to have trains going
multiple stops, always just one city to the other. Less trains, make it worth it that trains have multiple stops,
specially passenger trains." Real mechanisms only (owner rule): no flat multipliers. Numbers in src/data with a
one-line historical justification. Deterministic sim.

**Root cause (Opus, from the code):** passengers are bucketed by their *first leg* (`passengerFlows.ts`,
`boarding.ts`) and paid on unloading by the distance from where they boarded (`loading.ts` `settleUnload`). A
Venice→Milan passenger on a Trieste–Venice–Milan through train therefore gets off at the next stop and pays one hop
only. A through train earns exactly what shuttles earn, and shuttles turn round faster, so shuttles always win.
Early `maxCars` (3–6) also keeps trains short, so demand is met by adding *trains* instead of *cars*.

1. **Passengers ride to their destination.**
   - Waiting passengers are bound for their destination station, not their first leg. A train boards people whose
     destination is a later stop on its orders, or whose next change station is (shortest route, as now).
   - People who must change alight at the interchange. They join that station's waiting pile, still bound for
     their destination, and keep their origin tile and the tick they started.
   - The fare is paid once, on final arrival, for the whole origin→destination distance. The existing time decay
     uses the whole journey time, including time spent waiting to change; reuse the Phase 40 origin-carrying
     pattern (`oreOriginTile`).
   - Interchange passengers count in the station's waiting display.
   - Keep the waiting cap rules (one month's demand per bucket, overflow = unserved). Transferring people do not
     create new demand.
   - Old saves: existing first-leg piles stay as they are and are paid as now, and new demand uses the new rule
     (keep it simple).
2. **Changing trains deters travel** (real: railways ran through carriages because every change lost custom).
   - The gravity weight uses an effective distance = route distance + `CHANGE_PENALTY_TILES` × changes.
     `CHANGE_PENALTY_TILES` lives in src/data and is documented as the time lost changing.
   - So a destination reached directly attracts more people than the same town reached with changes.
   - Also show changes in the station's destinations view (the first-leg pie stays).
3. **Fewer, longer trains** (real: 1840s passenger trains ran 6–12 carriages; companies lengthened trains before
   adding paths, because each train needs its own crew and path).
   - Raise the early locomotives' `maxCars` toward historical figures. Make extra cars cost speed by a real
     mechanism: tractive effort / train weight, on grades especially. Use the existing locomotive data; add power
     or weight if missing.
   - Check that crew wages and train upkeep are charged per train, and car upkeep per car, so a longer train beats
     another train on cost.
   - The buy wizard and the consist editor must allow the new lengths.
4. **Bench and targets** (tools/bench, extend `owner.ts` or add `through.ts`). Report the numbers in PROGRESS.
   - (a) Owner scenario Venice–Milan 1842: the most profitable fleet should be ~3–5 longer trains, not 10+ short
     ones. Report profit per train at 2/4/6/10/18 trains.
   - (b) Trieste–Venice–Milan: one through line with N trains must earn more than two shuttles (Trieste–Venice +
     Venice–Milan) with the same N trains and cars. Report both.
   - (c) The good-player bench and survival tables must stay within the Phase 42–44 bounds. Never loosen a bound;
     if one fails, find the mechanism and report it.
   - Unit tests:
     - a through passenger is paid once for the whole distance;
     - a changing passenger waits at the interchange and is paid on arrival;
     - direct demand is greater than demand that needs a change;
     - a longer train is slower on a grade.
5. Minimal UI changes only where the data shape changes: the waiting split and the destinations view. Phase 49 owns
   the visual makeover; keep strings short. SPEC §9.5d update, PROGRESS entry with bench tables.
Status: [x] 1 [x] 2 [x] 3 [x] 4 [x] 5 (survival table partial, see PROGRESS)

## Phase 49 — Look & feel makeover: era theme, less clutter, realistic engines, zoom flicker
Owner feedback (2026-10-15): "menus are way too cluttered, too much text… trains too cartoony in the buy menu…
the start menu needs a makeover. The minimalist dark theme is good but not thematic, not in tune with the spirit
of the times. Zooming in and out the screen sometimes flickers." Keep it intuitive. Procedural graphics only, no
image files. Bundled fonts are allowed if needed, ≤ 2 families, OFL-licensed, with the licence in the repo.
Do NOT change sim code (Phase 48 runs in parallel). Strings stay in strings.ts.

1. **Style guide first** (`docs/STYLE.md`, short): a 19th-century railway look that stays dark and readable.
   - Palette: deep green / oxblood / ink background, brass and cream accents, a muted red for warnings.
   - Type: a serif display face for titles and numbers (timetable / engraved feel), a clean sans for small UI text.
   - Ornaments: thin double rules, corner flourishes drawn in CSS or canvas, ticket-stub style buttons.
   - Icons: line-art style.
   - Define CSS tokens in `theme.css`. Apply them everywhere (no stray hard-coded colours).
2. **Title screen makeover.**
   - A procedural engraved-style scene: a steam locomotive in side view under a period title cartouche, with a
     subtle animated smoke trail.
   - Menu entries as ticket/plaque buttons: New Game, Continue/Load, Scenarios, Achievements, Settings.
   - Restyle the New Game, Scenarios and Achievements screens to match.
3. **Declutter every panel and sheet**:
   - station, train, lines, finance, buy wizard, consist editor, contracts, news, goals, history and game-over
     cards, hint cards.
   - Rules:
     - numbers and icons before words;
     - at most one short line of explanation per section;
     - long explanations move behind a small (i) that opens a one-paragraph tip;
     - remove repeated or derivable figures.
   - Target: at least 40 % fewer visible words per panel. Count them before and after for the 6 busiest panels and
     list the counts in PROGRESS.
   - Keep everything reachable: no feature may become hidden without an entry point.
4. **Realistic locomotives and cars in the buy wizard and train panel.**
   - Redraw the side-view previews with correct proportions per type: wheel arrangement from the model id
     (0-4-0, 4-4-0, 2-8-0, …), boiler, dome, stack, cab, tender; diesel and electric bodies by era.
   - Muted period liveries, fine line detail, no thick cartoon outlines or toy colours.
   - Cache them to offscreen canvases.
   - Passenger cars and freight wagons match the same style.
   - Screenshot a sheet of all models (`phase-49-engines.png`).
5. **Zoom flicker.**
   - Reproduce it: rapid pinch/zoom in and out, in steps, at several speeds.
   - Find the cause; likely chunk-cache rebuilds showing blank or old frames, or a canvas resize clearing the
     backing store.
   - Fix it so every frame draws a complete map: keep the previous cache until the new one is ready, or draw
     scaled old chunks.
   - Add an e2e that zooms repeatedly and asserts no frame is blank or half-drawn, by sampling pixels.
6. Screenshots `phase-49-*.png`: title, new game, a station panel, a train panel, the buy wizard, finance, and
   before/after of two panels. LOOK at them. Update e2e selectors without weakening assertions. Record SPEC
   deviations and a PROGRESS entry with the word counts.
Status: [x] 1 [x] 2 [x] 3 [x] 4 [x] 5 [x] 6 (see PROGRESS for what was and was not done in 3, 4 and 6)

## Phase 49B — Finish the makeover: redraw the engines, trim the remaining cards
Opus review of Phase 49: the title screen and panels are good. But item 4 was not done. The engine art was not
redrawn, only given a paper backing. The early steam engines still look like toys: big red wheels, a green boiler
with brass bands, a cab as tall as the boiler, and Grasshopper/Planet/Norris/American drawn almost alike.
1. **Redraw every locomotive as a believable side elevation.** Use proportions from real engines: boiler length
   and diameter, driver size against the boiler, cab height, stack shape by era (balloon/diamond stack early,
   straight later), domes, smokebox, running board, valve gear, tender proportions.
   - Each early model must have its own silhouette:
     - Grasshopper: vertical boiler, walking beams, no cab.
     - Planet: short horizontal boiler, single large driving axle, no cab or a bare footplate.
     - Norris: 4-2-0 with a bar frame and a bogie.
     - American: 4-4-0 with a balloon stack and wooden cab.
   - Colours: muted period liveries (deep green, maroon, black, Russia-iron blue-grey), with brass only as small
     accents. Wheels dark with thin light rims, not bright red discs.
   - Outlines: thin line-work and fine hatch shading in the engraved style of the title screen, not thick
     cartoon outlines.
   - Diesels and electrics: check proportions against real types (F-unit, road switcher, box-cab electric). Fix
     the duplicate "Flatcar" names in the sheet.
   - The same art is used everywhere: buy wizard, train panel, title scene, on the map if shared. Keep it cached.
   - Screenshot `phase-49b-engines.png` and the title. LOOK at them next to a photo-like mental reference; if an
     engine reads as a toy, iterate.
2. **Trim the cards left out in Phase 49:** contracts list and offers, news, hint cards, game-over and scenario
   cards, the new-engine card. Same rules: numbers and icons first, one short line, details behind (i). Count words
   before and after; add them to `phase49Words.spec`.
3. **Station waiting line:** the "2 waiting / Barbridge Crossing 2 2" text is confusing. Show it as "→ Barbridge
   Crossing 2 · 2" rows, or as icon + number pairs.
4. e2e, screenshots `phase-49b-*.png`, PROGRESS entry.
Status: [x] 1 [x] 2 [x] 3 [x] 4

## Phase 48B — Through journeys: finish the survival check with real train lengths
Phase 48 left the bench bots on the old 3/4/5/6 car limits (`tools/bench/legacyCars.ts`). With the new limits, the
good bot went bankrupt once (1840 Normal, seed 1). Real players will use the new lengths, so this must be
understood.
1. Run the good bot with the new `maxCars`. Find out why seed 1 went bankrupt: heavier trains too slow on grades?
   A bad engine choice? Running costs? Fix the *bot* if it chooses badly (pick cars by demand and grade, as a good
   player would). Fix the *game* only if a real mechanism is wrong. Then retire `legacyCars.ts`, or keep it only
   for historical comparison tables.
2. Run the missing survival rows with the new lengths: 1930 and 1950, all bad bots, and the 1900 bad bots, on
   Normal and Hard. Use the Phase 42–44 bounds and never loosen them.
3. Owner scenario with the new lengths: report the most profitable fleet, and per-train profit at 2/4/6/10/18.
   An overcrowded line (10+ trains) should show individual trains losing money; say whether it does.
4. PROGRESS entry with the tables.
Status: [x] 1 [x] 2 [x] 3 [x] 4

## Phase 50 — Owner play-test fixes after 48/49 (train length on map, text put back, waiting labels)
Owner feedback (2026-10-15, screenshots): "The trains are now way too long, extending on water. You removed too much
text: car names and the default action on a station. What is 'any train'?"
1. **Train length on the map.** With the Phase 48 car limits (up to 8–10 cars early), a train at Venice reaches from
   the platform far down the line, out over the sea. A train must look like it fits the station.
   - Draw cars shorter on the map, so a full early train is about as long as a station's platforms. Pick a visual
     length per car so the longest train of the era fits a normal Station, with Terminals longer.
   - Keep the sim's tail length (signalling, `CAR_LENGTH_TILES`) consistent with what is drawn. If you change it,
     check that block and headway tests still pass and say what changed.
   - Screenshot a full 8-car train at a station (`phase-50-train-length.png`) and LOOK at it.
2. **Put back the text that was cut too far** (owner: too much was removed).
   - Car tiles in the buy wizard and consist editor: show the car name under the icon ("Passenger car 40",
     "Mail car 30", "Coal hopper 20").
   - Train route: every stop shows its rule as a word chip, including the default ("Load & unload" or whatever
     the default rule is called), not only non-default rules.
   - The new-engine card: buttons get short labels again ("Details", "OK").
   - Check the other Phase 49/49B icon-only spots. Where an icon alone is not obvious to a new player, add back a
     one- or two-word label. Do not bring back the long sentences.
3. **"any train" in the station waiting list** lumps two things together: passengers bound for destinations
   beyond the top rows, and old-save passengers with no destination. Show "→ other towns N" for the first; fold the
   second into it or show "→ no destination yet N". Never "any train".
4. e2e (update, never weaken), screenshots `phase-50-*.png` (LOOK), PROGRESS. Do not change passenger demand or
   waiting rules: they are being redesigned with the owner separately.
Status: [x] 1 [x] 2 [x] 3 [x] 4

## Phase 51 — Passengers: wait only for the next train (A), many small flows (B)
Owner approved (2026-10-15), after play-testing 48/49: "There are still too many passengers waiting. I have no
incentive to make trains with multiple stops." Real mechanisms only, numbers in src/data with a one-line
justification, deterministic sim. Phase 50 (UI and train drawing) may still be running: rebase carefully;
`src/ui/waitingSplit.ts` may conflict, so keep its new wording.

**Why today feels wrong (Opus):**
- Each destination's waiting pile fills linearly up to one month of demand and stays there (Phase 35D). A train
  every few days barely dents it, so every station always looks overcrowded and the player adds trains.
- `PAIR_DEMAND.maxShare = 0.5` lets one destination take half a town's travel. Venice→Trieste alone fills shuttle
  after shuttle, so stopping elsewhere earns nothing extra.

1. **A — People wait only for the next train.**
   - Real travellers come to the station for a departure; they do not camp for a month.
   - Each destination bucket at a station (people bound for that destination; Phase 48 lots) is capped at
     `demand per day × service interval`, clamped to `[MIN_WAIT_DAYS, MAX_WAIT_DAYS]` (src/data; suggest 1 and
     14 days, each with a one-line justification).
   - Service interval for that destination = round-trip time of the trains that carry those people (they call
     there, or at the change station on the route) ÷ the number of such trains. The gap-rule code already computes
     round-trip time; reuse it.
   - No train for that destination: nobody waits for it (as now, only reachable destinations generate).
   - Generation stays linear. Whatever goes over the cap is counted as unserved ("lost") demand, as overflow is
     now. People changing trains at an interchange are already travelling and are not capped.
   - Expected result: a train every 3 days means about 3 days of demand waiting, not a month.
   - The station panel and the Lines "add a train" hint keep working. The hint triggers on full trains plus lost
     demand, not on a big pile.
2. **B — Many small flows instead of one big one.**
   - Lower `PAIR_DEMAND.maxShare` to about 0.2. Real towns send travellers to many places.
   - Check `capShares` with few candidates (cap = max(maxShare, 1/n)). Decide whether to redistribute or drop the
     excess share and note it; the conservative choice is to keep redistributing as now.
   - If that alone leaves central-eu towns with only 3–5 candidates (so each still gets 20–33 %), say so with the
     numbers for Venice, Milan and Ljubljana, and stop there. Do not invent towns.
   - A multi-stop train fills from every pair along its route (Phase 48 lots already do this). Verify that seats
     freed at a stop are refilled there.
3. **Bench and targets** (`tools/bench`). Report before/after in PROGRESS.
   - (a) A multi-stop line along 4–5 central-eu towns, e.g. Milan–Venice–Trieste–Ljubljana or a better real
     chain, versus point-to-point shuttles over the same towns with the same trains and cars. The multi-stop line
     should earn clearly more per train (aim ≥ 25 %). Report profit per train, average load, and waiting at each
     station.
   - (b) Owner scenario Venice–Milan: the most profitable fleet, per-train profit at 2/4/6/10, and average
     waiting at Venice before and after. Waiting should be days of demand, not a month.
   - (c) Good-player and survival rows for 1840/1900 on Normal and Hard, against the Phase 42–44 bounds. If total
     passenger income falls so far that a bound fails, find the mechanism and report it. You may recalibrate
     `TRIPS_PER_HEAD_ANCHORS` only with a stated historical reason, as Phase 35E did, never as a flat fudge.
     Never loosen a bound.
   - Unit tests:
     - the cap equals the rate × interval and is clamped;
     - the cap is zero with no service;
     - overflow is counted as lost;
     - a station's top destination share is ≤ maxShare when there are enough candidates;
     - a multi-stop train refills seats at an intermediate stop.
4. UI only where the numbers change meaning. Station waiting rows may show "next ~3 d". Keep it one short line,
   and keep Phase 50's wording. Update SPEC §9.5d/e, add a PROGRESS entry with the tables, and add screenshots
   `phase-51-*.png` (LOOK at them).
Status: [x] 1 [x] 2 [x] 3 (multi-stop target not met, see PROGRESS) [x] 4

## Phase 52 — Passenger display and old-save fixes (owner play-test of Phase 51)
Owner screenshots (2026-10-17), on a game started in 1840 before Phase 48:
- Ljubljana shows "→ Trieste next ~28d 94 / → Venice next ~28d 94", and a train arrives 5 days later and takes both
  groups. Owner: "don't really understand… a train going to Trieste takes both groups, is this ok?"
- Venice shows "→ other towns 2409", which never changes.
- A train waits for a full load, leaves full, and the station still looks crowded.

Opus diagnosis from the code:
- (a) "other towns" 2409 is the pre-Phase-48 pile. `accrueLots` keeps `legacy = amount − lots` untouched and
  uncapped forever. Lots board first and fill the train, so the legacy people never get a seat.
- (b) "next ~28d" is the *average* interval (round trip ÷ trains), not a countdown, so it reads as wrong.
- (c) The Venice-bound people at Ljubljana are correct: they ride to Trieste and change there. The screen does
  not say so.

1. **Old-save passengers.** On the next accrual, convert a station's legacy amount into destination lots by the
   station's current route shares (origin = this station), then apply the Phase 51 caps. Whatever goes over a cap
   is counted as lost, once, without a news flood. With no routes the legacy amount drops to 0. Test it with a
   save-shaped fixture. After one day no station has an "other towns" row made of legacy people.
2. **Interval wording.** Show "every ~28 d" instead of "next ~28 d"; it is the average gap. Keep it short.
3. **Show the change.**
   - A waiting row whose route needs a change shows the first leg in the name: "→ Trieste → Venice 94", no extra
     words.
   - In the train panel, the cargo line shows, for a train's passengers, how many change at the next stop, if
     cheap to compute. Otherwise skip it and note that in PROGRESS.
4. Leftovers from Phase 50:
   - two different cars are both named "Boxcar", and two "Ore hopper". Give each its real name (e.g. "Goods van",
     "Ore wagon"), checking the cargo each one carries;
   - an 8-car train still overhangs a Station's platform. Make the platform or the drawn car length fit, keeping
     sim length consistent.
5. e2e (never weaken; the word-count spec limits stay), screenshots `phase-52-*.png` (LOOK), PROGRESS. Do not
   change demand, fares or caps: those wait for the owner.
Status: [x] 1 [x] 2 [x] 3 (train-panel change count skipped, see PROGRESS) [x] 4 [x] 5

## Phase 53 — Passengers: per-distance fares, fewer travellers each paying more, fair shares
Owner approved (2026-10-17). Goal (owner, repeated since Phase 48): fewer trains, small crowds, and a real reason to
run multi-stop passenger trains. Real mechanisms only, numbers in src/data with a one-line justification, sim
deterministic. Phase 52 (display, old-save pile) may still be in flight and edits `cargoFlow.ts` and
`waitingSplit.ts`. Fetch main often and rebase carefully; keep its changes.

**Diagnosis (Phase 51 PROGRESS + Opus):**
- Multi-stop trains earn ~$6k/train/yr against ~$26k for shuttles, for two reasons.
- (1) `computeRevenue` time factor: passengers pay 20 % once a trip is 6 days later than a 60 km/h reference
  train. Early engines and intermediate stops make every long trip "late".
- (2) Towns are capacity-bound: unserved 30k+ a year against 2–4k carried. Any single pair fills every train, so a
  stop elsewhere gains nothing. Phase 51 doubled `TRIPS_PER_HEAD_ANCHORS`, which made (2) worse.
- (3) `capShares` raises the cap to 1/n when a town has few candidates, so all destinations get equal shares. Size,
  distance and the Phase 48 change penalty stop mattering (Ljubljana: Trieste 94 = Venice 94).

1. **Per-distance passenger fares.**
   - Passengers pay by distance at the era's tariff. Real fares were per mile or per km: Britain's 1844 Act set
     1d a mile on the "Parliamentary" trains, and continental railways charged per-km tariffs.
   - No lateness collapse for passengers. Waiting at an interchange and dwelling at intermediate stops do not cut
     the fare.
   - Keep a *small* speed effect relative to the era's typical train, not a fixed 60 km/h: e.g. 0.9–1.15× by trip
     time against the era's reference. Name and document the bounds in src/data. `competitionLoss` stays.
   - Mail keeps its urgency decay, but measured against the era's reference speed.
   - Freight is unchanged.
2. **Fewer travellers, each paying more.**
   - Undo the Phase 51 ×2 on `TRIPS_PER_HEAD_ANCHORS`. Set the volume so towns are *demand-bound*: for a big 1840s
     pair like Venice–Milan, one direction's monthly demand should be about 1–2 full early trains (5–8 cars × 40
     seats), not 20.
   - Then set the passenger fare (`baseRate` and/or the era tariff) so a typical company stays viable: a full
     train earns at least what it does now.
   - Write the reasoning in SPEC: one game passenger stands for a party of travellers, because a game month of
     train running compresses many real departures. Say this plainly; it is a scale, not a bonus.
3. **Fair shares.**
   - `capShares` caps each destination at `maxShare` and does **not** raise the cap to 1/n. A town with few
     neighbours in range generates fewer trips; the excess is not generated. That is real: fewer places to go,
     less travel.
   - Gravity (size / distance) and the change penalty then decide the split again.
4. **Bench targets** (report before and after in PROGRESS; extend `multistop.ts`, `owner.ts`, `through.ts`):
   - (a) Multi-stop vs shuttles on Milan–Venice–Trieste–Ljubljana and Frankfurt–Nuremberg–Munich–Salzburg, at
     4 and 6 trains: multi-stop per-train profit ≥ 1.25× shuttles.
   - (b) Owner scenario Venice–Milan 1842: most profitable fleet 1–3 trains. Average waiting at Venice per
     destination ≤ about one train-load. Report profit per train at 1/2/4/6.
   - (c) Good bot and bad bots, 1840/1900, Normal and Hard, 3 seeds: every Phase 42–44 bound holds; never loosen.
     The good bot may be improved the way a good player would play (e.g. extend lines through towns instead of
     only pairs); document it. Also run 1930/1950 good rows.
   - (d) Balance tests (pax/coal, mail/pax, goalCalibration…): hold without loosening. Fixture changes only with a
     stated real-map reason, as in Phase 51.
   - Unit tests:
     - a slow multi-stop trip pays at least 0.9× the per-distance fare;
     - shares with 2 candidates are each ≤ maxShare (and the town total falls);
     - a direct destination draws more than the same town via a change;
     - Venice-type demand per direction ≈ 1–2 trains a month.
5. UI: none needed beyond what changes meaning. SPEC §8.1 and §9.5d/e, PROGRESS with all tables, screenshots
   `phase-53-*.png` of a station after a few months (LOOK at them).
Status: [x] 1 [x] 2 [x] 3 [~] 4 (a: multi-stop >= 1.25x shuttles NOT met; c: bad-bot bounds missed on some rows, see PROGRESS) [~] 5 (SPEC and PROGRESS done; no phase-53 screenshot: the e2e patch has no real towns to fill a platform)

## Phase 53B — Finish 53: no fudge table; changing trains costs the real wait
Opus review of Phase 53 (PROGRESS 2026-10-17): per-distance fares, smaller volume and fair shares are in, and the
owner fleet is good (best 2 trains). Three things are not acceptable:
- `PARTY_SIZE_ANCHORS` (0.25 → 2.7 by era) is a calibration table that the builder admits has no real basis. That
  breaks the owner's rule: no fudge factors.
- Multi-stop still earns less than shuttles: Frankfurt chain 0.67× / 0.76×, target ≥ 1.25×.
- Bad-bot bounds are missed: overbuilder 1840 Normal 1/3, trainSpammer and leveraged Hard 1900 1/3.

**Opus diagnosis of multi-stop:** shuttles plus changes serve the same journeys as a through train, at the same fare,
with better load per leg. A change costs a passenger only `CHANGE_PENALTY_TILES` = 15 tiles in the gravity weight.
Since Phase 53 removed lateness from fares, the wait at the interchange costs nothing either. In the game's own
timescale the onward train comes every 10–30 days, and in reality a missed connection meant hours or a night in a
town. A change should cost what it really costs: the wait.

1. **Party size is one constant.**
   - Replace `PARTY_SIZE_ANCHORS` with a single `PARTY_SIZE` (the unit scale: one game passenger stands for N
     travellers, because game time is compressed). Justify it once in SPEC.
   - Real growth of rail travel over the eras belongs in `TRIPS_PER_HEAD_ANCHORS` (journeys per head per year
     really rose many-fold from 1845 to 1900). Put that growth there, compressed if needed, with sources and the
     compression stated. Later eras' longer and faster trains carry it.
   - If an era then falls out of balance, find the mechanism (costs, fares, train capacity) and report it. Do not
     add another era table.
2. **A change costs the expected wait.**
   - The effective distance used for gravity and route choice becomes: route distance + for each change,
     `max(CHANGE_MIN_TILES, expected wait at the change station × era reference tiles/day)`.
   - Expected wait = half the onward service interval, from the same service data as Phase 51
     (`serviceIntervalDays`), clamped by `MIN/MAX_WAIT_DAYS`. Keep 15 tiles as `CHANGE_MIN_TILES` (the platform
     walk and luggage).
   - Through trains have no change, so a direct multi-stop line draws more travellers than shuttles with changes.
   - Unit test: a destination behind a change with a 20-day onward interval draws clearly less than the same town
     on a through train.
3. **Re-run and report**, before and after, with the same benches as 53:
   - multistop (clean Frankfurt chain; target ≥ 1.25× per train);
   - `owner.ts` (best fleet 1–3);
   - `through.ts`;
   - good and bad bots for 1840/1900/1930/1950, Normal and Hard, 3 seeds.

   Every Phase 42–44 bound must hold. Never loosen one. If Hard 1900 dumb bots still survive, find the real
   reason. For example: do they now earn because the per-distance fare no longer punishes their slow, overloaded
   trains? A real fix could be crowding (a full train turns people away to competitors) or running costs. Propose
   it in PROGRESS; implement it only if it is clearly a real mechanism.
4. The good bot's new policy (add a train only on a backlog; keep a 40 % reserve) is fine as good-player behaviour.
   Keep it documented. Keep the raised goal amounts only if `goalCalibration` still needs them after items 1–3.
5. SPEC §8.1 and §9.5d updates, PROGRESS with all tables, and one `phase-53b-*.png` of a real station with a pile.
   Use a central-eu city, not the debug patch, and LOOK at it.
Status: [x] 1 [x] 2 [~] 3 (benches run; multi-stop 1.25x, bad-bot and 1900 Normal/Hard bounds NOT met, see PROGRESS) [x] 4 [x] 5

## Phase 53C — Make through trains win for real reasons; restore the era and difficulty balance
Opus review of Phase 53B: the fudge table is gone and the owner fleet is right (best 2). Still missing:
- multi-stop per train is 0.66× / 0.86× of shuttles (target ≥ 1.25×);
- bad bots survive on Normal (overbuilder 0/3) and on Hard (1/3–2/3);
- 1900 Normal good bot is $10–17M against its $20–34M bound, and the Hard gap in 1900 is gone;
- 1840 is now very rich: good bot $10.6M, where the old target was ~$4M.

The builder's diagnosis is accepted:
- (i) The pile cap uses the *estimated* interval. Bunched multi-stop trains hit the cap and run 39 % full, turning
  7,400 people a year away.
- (ii) One 40-seat car for every era leaves 1900+ trains poor per seat once the party table went into trips.

Opus adds a third cause:
- (iii) Shuttles turn round at every town for free. Real steam engines had to be turned (turntable or wye) or run
  round their train, and coaled and watered, at every terminus: about an hour in 19th-century practice, against a
  2–3 hour run. A through train turns only at the two ends. In the game's own time scale (a 60 km/h train covers
  one real hour of running in several game days), one real hour of turnaround is several game days. That is a real
  and large cost of the shuttle pattern.

All three are real mechanisms. Build them in this order and measure after each.
1. **People wait for the actual next train.** Replace the estimated-interval cap with the observed one.
   - A destination pile fills linearly from the moment the last train that carries those people left (a
     per-(station, next stop) departure stamp, saved; old saves default to "now"), up to `MAX_WAIT_DAYS` of demand.
   - What a departing train cannot take stays, up to that cap. Overflow is lost as before. Keep "every ~N d" on
     the UI as the observed average.
   - Unit tests: bunched trains lose no one under the cap; a long gap loses only the part above MAX_WAIT_DAYS.
2. **Terminus turnaround.**
   - When a train reverses direction at a stop, i.e. the stop is the end of its run or its orders send it back the
     way it came, it spends `TURNAROUND_HOURS` by traction type before it can leave. Steam: turning or running
     round, plus coal and water, about 1 real hour. Diesel and electric: about ½ hour for running round. Double-
     ended or multiple-unit later types: less, if the data says the type has cabs at both ends.
   - Convert real hours to game time with the same compression the game uses for running time (tiles per game day
     at the era's speed, `eraReferenceTilesPerDay`). Keep the numbers in src/data with the justification.
   - Intermediate stops keep their normal dwell. The train panel shows the turnaround as a state ("Turning").
   - Freight is affected too. That is realistic; report the freight bench change.
3. **Passenger car seats by era**, following the existing art era buckets (early / mid / modern):
   - 4-wheel and 6-wheel compartment carriages ~40 (keep);
   - bogie coaches from the 1880s ~60;
   - steel coaches from the 1920s ~80.
   - Price and upkeep per car follow from the existing rules: say what changes. A car keeps the seats of its era
     when bought.
4. **Re-run** multistop (clean Frankfurt chain, target ≥ 1.25×), owner (best fleet 1–3), through, and survival,
   good and bad, 1840/1900/1930/1950, Normal and Hard, 3 seeds, after each of items 1–3.
   - Every Phase 41–44 bound must hold, including good 1900 Normal $20–34M and Hard ≥ 40 % below Normal. Never
     loosen one.
   - If bad bots still survive after 1–3, pick the *real* mechanism from the 53B proposals that explains it (thin
     long lines: track upkeep per km actually charged; loan limit following earnings). Build it only if it is a
     plain real rule. Otherwise report.
   - If 1840 stays far above its old target, say why.
5. SPEC, PROGRESS with every table (before and after each item), screenshots `phase-53c-*.png`: a train "Turning"
   and a Venice station. LOOK at them.
Status: [x] 1 (main) [~] 2 (branch phase-53c-wip; 4 balance bounds fail, see PROGRESS) [~] 3 (branch) [~] 4 (benches run; 1900 Normal, 1840, bad-bot and multi-stop 1.25x NOT met) [ ] 5

## Exploration E1 — Which passenger model makes a multi-stop train the natural choice? (prototype on a branch, not main)
Owner (2026-10-18): "Not sure what to do… maybe remove the rule that passengers wait for a certain city. If there are a
bunch of small cities with few passengers it is better to have one train serving all of them. Also now there are too
many wagons; better fewer passengers that pay more. Explore a bit, try different approaches. The goal is that it is
good to have a passenger train with multiple stops."

Work on branch `explore-passengers`, starting from `phase-53c-wip` (main + terminus turnaround + era coach seats). Do
**not** push to main. Deliverable: `docs/explore/passengers.md` on the branch (short, tables, a recommendation) plus
the prototype code behind a model switch, so the owner can choose.

**The right question.** Phases 48–53 compared multi-stop and shuttles *per train at equal train counts*. When demand
is plentiful, that always favours shuttles. The owner's point is different: a set of small towns has small flows. One
train calling at all of them fills its seats from many small flows. A shuttle per leg runs nearly empty and cannot pay
its crew and upkeep. So compare **the best total profit for a given set of towns**, choosing the number of trains and
cars freely per configuration.

**Models to prototype** (a `passengerModel` switch in the game options, used by the benches):
- **M1 — current** (passengers bound for a destination, changes allowed), with fewer travellers each paying more.
  Volume: one scale constant, so a 15k town sends ~20–40 a month to a typical neighbour. Fare: per distance, scaled so
  a *full* car still earns what it does now.
- **M2 — direct trains only, one pile per station** (owner's suggestion).
  - A station's demand is the gravity share of the towns that *its trains call at directly* (no changes counted).
  - People wait in one pile per station, not per destination.
  - When a train calls, people board and split over the train's *later stops* by gravity (pop / distance) among
    those stops. They pay per distance on arrival.
  - So a train calling at more towns makes every one of its stops generate more travellers. That is the intuitive
    "one train serving all the small towns".
  - No transfers in this model.
- **M3 — M2 plus changes:** like M2, but a town reachable with one change is also counted, at a strong discount for
  the real wait (Phase 53B change cost). Is it worth the complexity over M2?

Use the same volume and fare scale in M1–M3, and the same waiting rule: a pile fills from the last departure up to
`MAX_WAIT_DAYS`.

**Scenarios** (2 years, 3 seeds, 1842 Norris and 1900 Atlantic; report total profit/yr, profit per train, average
load, cars in use, average waiting):
- S1: a chain of 5 small towns (12–25k), 15–25 tiles apart (synthetic map or central-eu small-town chain).
  Configurations: 1 multi-stop train end to end; 2 multi-stop trains; 4 shuttles (one per leg); 8 shuttles; for
  each, the best number of cars.
- S2: two big cities (Venice–Milan): 1–4 direct trains (an express between two big cities may rightly win here).
- S3: a big city with 3 small towns along the way (Milan–…–Venice style): an all-stops train vs express + shuttles.
- Turnaround on/off for S1, to see how much it matters.

**What "good" looks like:**
- S1: the best configuration is a multi-stop train, by a clear margin (≥ 25 % more total profit than the best
  shuttle set).
- S2: a direct train is fine.
- S3: the all-stops train is competitive.
- In all three: few wagons (a typical early train 3–5 cars) and crowds of tens, not hundreds.

Also report, for the recommended model: simplicity for the player (what the station panel would show), and the
good-bot NW for 1840 and 1900 Normal (a quick, uncalibrated read only).

Do not change any test bound on the branch to make a model look good. If a model needs test changes, list them in
the doc.
Status: [ ] M1 [ ] M2 [ ] M3 [ ] scenarios [ ] doc

## Phase 54 — Ship the owner's passenger model (E1 "M2"): direct trains, one pile per station; express + locals
Owner decisions (2026-10-18), after Exploration E1 (`docs/explore/passengers.md` on branch `explore-passengers`):
- Use the owner's model, M2.
- "Yes, it's OK to update test limits": the 4 balance tests that fail with the terminus turnaround and the era
  coach seats (`balancePassengers` pax/coal 1840s and mail/pax, `balanceLongHaul` 1840 payback and 1930/1950
  ratio).
- New wish: "If 2 large towns produce lots of passengers, it should make sense to connect them with 1 express train
  that does not stop in between, plus 1–2 local trains that stop at every station."

Start from branch `explore-passengers` (M2 prototype + terminus turnaround + era seats), rebased onto main. Push to
main only when `npm run check` is green. Real mechanisms only; numbers in src/data with a one-line justification.

1. **M2 becomes the only passenger model.**
   - Remove the destination-lot machinery and the M0/M1/M3 switches: per-destination piles, changes, the change
     wait, legacy conversion.
   - Rules:
     - A station's travel demand = the gravity shares of the towns its trains call at *directly*.
     - People wait in one pile per station, filling from the last departure up to `MAX_WAIT_DAYS`.
     - **A train takes the people heading for the towns it stops at.** Internally, a calling train may board at
       most the pile × (gravity weight of its later stops ÷ gravity weight of all towns the station's trains
       reach). The board then splits over its later stops by gravity, and fares are per distance on arrival.
     - The player sees one number. This keeps an express (A→B only) from carrying people who wanted the small towns.
   - Keep the per-distance fare and the speed factor.
   - `PASSENGER_PARTY_PEOPLE = 3` (fewer passengers each paying more, as the owner asked), stated once in SPEC.
   - Save migration: old piles of any shape collapse into the one station pile.
2. **Express + locals should win by real mechanisms, not a rule.**
   - Add scenario S4 to `tools/bench/explore.ts` (keep it as a bench): two big towns (100k+) with 3 small towns
     (10–20k) between.
   - Configurations: 2 locals; 3 locals; 1 express + 1 local; 1 express + 2 locals; 2 express + 1 local; 2
     express. The best car count for each.
   - Target: "1 express + 1–2 locals" is the best total profit, ahead of all-locals and all-express.
   - The mechanisms already in play: an express is faster (no intermediate dwell or acceleration), so it gets the
     fare speed factor. A local loaded with big-town people fills before the small towns.
   - If that is not enough, add **travel time in the gravity weight**: a town reached by a faster direct train
     draws more trips. Real basis: people travel more where the journey is quicker ("time-space shrinkage"). Use
     the best direct service's run time instead of distance, with the same exponent. Measure again.
   - Report the S4 table. Make sure an express really passes intermediate stations without stopping (orders
     A, B only).
3. **Merge terminus turnaround + era coach seats** (Phase 53C items 2–3). Update the 4 balance tests to new limits
   (owner OK). Write each old and new limit and the real reason in PROGRESS: a full coal train loses a trip per
   turn, a part-loaded passenger train barely does. Tests asserting the old destination-pile mechanism get *new
   fixtures* for M2, not looser bounds.
4. **UI:**
   - Station: "Waiting 41 · next train ~6 d" and "Trains here reach: A, C, D" (towns, biggest share first). The
     "Where to" sheet shows the shares among reachable towns and, as a hint, the biggest unserved towns in range.
   - Remove per-destination rows and change texts.
   - Train panel: passengers on board by destination as one short line if it fits the word limit.
   - Keep word-count limits; never loosen them.
5. **Economy and difficulty** (reference targets, Phase 41–44 bounds):
   - Re-run good/bad bots for 1840/1900/1930/1950, Normal and Hard, 3 seeds.
   - Make the good bot build *multi-stop lines* through towns, as a good player would under M2, and keep its
     backlog/reserve rules.
   - Bounds: good survives everywhere; good 1900 Normal $20–34M; Hard ≥ 40 % below Normal; bad bots bankrupt
     ≥ 50 % on Normal and ≥ 80 % on Hard.
   - If a bound is missed, find the real mechanism. Allowed: the single volume scale `TRIPS_PER_HEAD` compression,
     stated openly as the game scale, and a loan limit tied to earnings (real lending practice), if bad bots
     survive on credit.
   - Report the 1840 good-bot level against the old ~$4M reference.
6. SPEC (§8.1, §9.5d rewritten for M2), PROGRESS with all tables, e2e (update, never weaken), and screenshots
   `phase-54-*.png`: a Venice station, an express and a local on one line. LOOK at them.
Status: [x] 1 [~] 2 (bench and boarding done; target composition not met, see PROGRESS) [x] 3 [~] 4 (no train-panel aboard line: word limit) [~] 5 (good bot bounds met; bad-bot Hard bounds and the multi-stop bot not met) [x] 6

## Phase 55 — Overtaking at stations and passing loops; Info text stays; engine-cost numbers; double track 0.75×; Main menu

Owner decisions (2026-10-18), after the Phase 54 play-test:
- "Do number 1, can I also build passing loop?" (overtaking, and building loops himself).
- "Do 2" (the station Info text disappears too quickly).
- "Check numbers for 3" (engine choice hardly matters): **numbers only, no price or cost change in this phase.**
- "At four double track should be 0.75 of normal": adding a second track costs 0.75× a new single-track edge.
- New: "When I am in game, I don't know how to return to the start menu."

Real mechanisms only; numbers in `src/data` with a one-line justification. Never loosen a test bound or word limit.

1. **A faster train overtakes a slower one at a station or passing loop** (SPEC §7.5).
   - Today: same-direction trains only follow (`followerSpeedCap`), so a slow train in front sets the pace of every
     train behind it until the next station. Stations and loops are passing places only for *opposing* trains.
   - Real practice ("putting the slow train inside"): a train ready to leave a passing place (a station it stops at,
     or a passing loop) **holds** if a faster same-direction train will catch it before the next passing place on
     its route. It waits until that train has passed through, then departs. Status/`waitingOn`: "Waiting for Train N
     to pass" (strings.ts).
     - "Will catch it": compare arrival times at the next passing place from each train's position and the speed it
       can reach (use the same running-time estimate as `headway.ts` / `computeTargetSpeed`, not a fixed rule). Only
       trains already heading for this passing place on the same route direction count, within a lookahead you state.
     - A train standing in a station or loop must not block a train running **through** it (check that a
       pass-through or non-stopping train is not held by the follower logic behind a stopped train in the loop).
     - No deadlock and no starvation: a train holds for at most one overtaking train at a time and never more than a
       stated limit (e.g. it never waits for a train that is itself waiting); the Phase 18 fairness rule still holds.
       Add unit tests for: express behind a local on one line; two equal-speed trains (no hold); a slow train that
       stops everywhere and an express that stops only at the ends; opposing traffic on single track at the same time.
   - **Passing loops on double track** too (a refuge loop for overtaking): today `computePassingLoopPlan` refuses a
     double edge. Allow it on plain straight double track; on double track it only serves overtaking.
   - Bench: add an overtaking scenario (S4 line, 1 express + 2 locals, express behind a local). Report express run
     time end to end with and without the rule, and total profit. The express should lose little time behind locals.
2. **The player can build a passing loop.** Today the only way is tapping the traffic-jam toast.
   - With the Station tool, tapping a plain straight track tile where a loop can go offers **Station / Passing loop**
     (short labels, loop price shown), then uses the existing `openPassingLoopPanel` / `buildPassingLoop`.
   - Help text: one line in the existing passing-loop help entry that loops also let fast trains overtake.
3. **Info text stays until dismissed.** "When I click info on a station I cannot even read it, it disappears so
   quickly." Reproduce first in e2e: find what the Info tool and the (i)/explanation taps in the station panel show
   (toasts last 3.5 s and are pushed out by news at the toast cap of 3). Fix: an explanation the player asked for
   stays until tapped away (or the panel closes), and news cannot push it out. News toasts are unchanged.
4. **Engine-cost numbers (report only, no change).** For 1840, 1870, 1900, 1930 and 1950 starts (Normal), list for
   each engine you can buy: price, price as % of start cash, maintenance/yr, fuel/yr on a typical line, and profit/yr
   with the bench's typical consist. Use `tools/bench/owner.ts` (Venice–Milan) and S4. Then measure one real
   candidate mechanism without shipping it: fuel burnt scales with the power used (a bigger engine on a short train
   burns more), so show how the "best" engine's profit changes. Put the tables in PROGRESS for the owner.
5. **Double track 0.75×.** `DOUBLE_TRACK_UPGRADE_MULTIPLIER` 0.6 → 0.75 (a fresh double edge
   `DOUBLE_TRACK_MULTIPLIER` 1.6 → 1.75). Real basis: the second line needs a wider formation, cuttings and
   embankments, so it costs most of a new line. Bridges unchanged. Re-run the good/bad bots (1840/1900, Normal/Hard,
   3 seeds) and report; if a bound moves, say so, do not loosen it.
6. **Main menu from the game.** ☰ menu → "Main menu" row: autosaves, then opens the title screen (Continue / New
   Game / Load). With `?debug=1` no autosave (as today). e2e: open the menu, tap Main menu, title screen shows,
   Continue returns to the same game.
7. SPEC (§7.5 overtaking and loops on double track, §10 menu), PROGRESS with tables, e2e (update, never weaken),
   screenshots `phase-55-*.png`: an express passing a local held in a loop, the Station/Passing loop choice, the
   Info text staying, the Main menu row. LOOK at them.
Status: [x] 1 [x] 2 [x] 3 [x] 4 [x] 5 [x] 6 [x] 7

## Phase 56 — Every engine has its use: price and upkeep from the engine's real size

Owner decision (2026-10-18), after the Phase 55 engine-cost report: "Ideal case would be that each engine has its own use
case, or at least most of them. Small and slow should be enough for close-by cities, and more cost effective. A fast
expensive train with one carriage should not break even for a long time. For a short line a small slow train should at
least break even faster. Increase the cost between them a bit; upkeep should be a bit higher." **Go, without the Buy
Train payback line** (no new UI line in this phase).

Why today every engine looks alike (Phase 55 item 4, `tools/bench/engineCosts.ts`): price is 2-16 % of start cash up to
1900, maintenance + fuel are under ~11 % of a train's profit, a Norris pays back in ~4 months, so the fastest engine
always wins and the cost side decides nothing.

Real mechanisms only; numbers in `src/data` with a one-line real justification. Do not add new era calibration tables
or flat multipliers. Never loosen a test bound or word limit.

1. **Price from the engine's real size.** Add each engine's real working weight (engine + tender, tonnes, from the real
   type it stands for; one-line source note per engine) to `LocomotiveDef`. Price = a price per tonne (era-scaled as
   prices are today) × weight, plus a type premium for electric and diesel (real: electrical/diesel equipment cost more
   per tonne than a steam boiler). State the per-tonne rate and the premium with their basis. The gap between small and
   big engines should come out several times wider than today (e.g. a Hudson several × an American, an Articulated more).
   Keep the existing gross weight model (`economy.ts` weight by class) consistent with the new weights, or replace it
   with them, and say which.
2. **Upkeep from size and distance run.** Real repair bills per engine-mile grew with engine weight. Split the
   locomotive's yearly cost into (a) a fixed part per year ∝ weight (depot, inspection, boiler/equipment wear by age) and
   (b) a running part per tile run ∝ weight (repairs follow mileage), alongside the existing fuel and wages. Upkeep goes
   up overall, most for the big engines. Keep the save format working (old saves load; derived values, not stored).
3. **Targets (bench).** Extend `tools/bench/engineCosts.ts`: lines short (~10-15 tiles, two close towns), medium
   (Venice-Milan) and long (~60+ tiles); consists 1 car, half, full; freight: a coal line with a heavy train. Report per
   era (1840, 1870, 1900, 1930, 1950, Normal) price, upkeep/yr, profit/yr and **payback years** for every buyable engine.
   - Short line: a small, slow, cheap engine has the fastest payback of its era.
   - Long line: a fast engine is the best buy (fastest payback with a full consist).
   - Fast expensive engine with 1 car: no payback within 10 years.
   - Heavy freight: a strong slow (freight) engine beats a fast passenger engine.
   - Most engines are the best choice somewhere: list each engine with the case it wins, and the ones that win none.
   If a target is missed, find the real mechanism (e.g. dwell/turnaround dominating short lines, power on grades); do
   not tune a fudge to hit it. Report misses openly.
4. **Balance.** The good bot picks the engine with the best payback for each line (instead of `bestLoco()`, the fastest),
   keeping its backlog/reserve rules. Re-run survival (good + bad bots, 1840/1900/1930/1950, Normal and Hard, 3 seeds).
   Bounds: good survives everywhere; good 1900 Normal $20-34M (Phase 57: now $30-45M on the median of 10 seeds); Hard >= 40 % below Normal. If the good bot falls outside
   $20-34M, stop and report the numbers and the cause for the owner; do not change revenue or loosen the bound.
   Balance tests (`balance*.test.ts`) that fail: report old/new values and the real reason; do not loosen them.
5. SPEC (§7.7 roster table, §9 costs), PROGRESS with all tables, e2e (update, never weaken; the buy wizard shows the new
   prices/upkeep), screenshot `phase-56-buy-train.png` (the engine list with the new prices). LOOK at it.
Status: [x] 1 [x] 2 [x] 3 (targets partly missed, see PROGRESS) [~] 4 (bot done; stopped: good 1900 Normal 34-43M is above the 20-34M band, 1930 Hard gap 36 %; one balanceLongHaul bound red, reported) [x] 5

## Phase 56B — Fix-ups after 56: diesel/electric price by power, upkeep shown in today's money, the silver bound, a steadier balance measure

Owner: "Go 56B" (2026-10-19), on the orchestrator's proposal after the Phase 56 review, which included: lower the
`balanceLongHaul` 1930 silver bound to 0.6 (the dearer Hudson is what the owner asked for), and judge the good bot's
1900 Normal band on the median of 10 seeds instead of 3. Items 3-4 are done last, so the owner can still object.

Real mechanisms only; numbers in `src/data` with a one-line justification. No new era tables or flat multipliers.

1. **Diesel and electric price by power, not weight.** Phase 56 priced every engine by tonnes, which made modern
   electrics far too cheap (High-Speed Trainset $600k -> $184k, Modern Electric $300k -> $122k). Real diesel and electric
   prices followed installed power (diesels were sold per horsepower; electrics per kW of traction equipment). Steam keeps
   the Phase 56 weight price. For diesel and electric: price = a rate per unit of installed power (map the game's `power`
   to horsepower/kW with a stated conversion) era-scaled as today; state the rate and its real source (e.g. a 1950s
   1,500 hp cab unit's price). Upkeep for diesel/electric stays by weight unless the source says otherwise; say which.
   Report the new roster table (old 55 price, 56 price, 56B price) and re-run `tools/bench/engineCosts.ts` for 1930 and
   1950 (all lines) to show what changes in the best-buy table.
2. **Upkeep shown in today's money.** The Buy Train spec sheet shows a 1945 price ($536k Hudson) next to an 1830-price
   upkeep ($25k/yr). Show the yearly upkeep at the current year's prices wherever an engine's price is shown at current
   prices (buy wizard, replace-engine list, roster), and check the train panel's cost figures for the same mismatch. Word
   limits kept. e2e: the Hudson's upkeep in 1945 equals its data upkeep × `eraInflation(1945)` within rounding.
3. **Silver bound (owner OK via 56B).** `tests/sim/balanceLongHaul.test.ts` 1930 silver `lateReturn > 0.7` -> `> 0.6`,
   and `lateReturn × invested > 2.3e6` -> the measured value's floor at one significant step below it (state it). Write old,
   new and measured values and the reason (Phase 56: the Hudson costs 1.5× and its upkeep 2×) in PROGRESS. No other bound
   changes. `npm run check` must be fully green at the end.
4. **Steadier balance measure.** `tools/bench/survival.ts`: a `SEEDS=` (default 3) and, for the good bot, print the
   median and the min-max of final net worth. Run good bot 1840/1900/1930/1950 Normal and Hard with 10 seeds and report
   the medians. The 1900 Normal band $20-34M is judged on the median. If the median is outside, report the numbers and
   stop (do not change revenue or costs to hit it). Hard >= 40 % below Normal, also on medians.
5. PROGRESS with tables, SPEC (§7.7 price rule for diesel/electric, §9 upkeep display), e2e (update, never weaken),
   screenshot `phase-56b-buy-train.png` (the electric/diesel list in 1960 and the upkeep in today's money). LOOK at it.
Status: [x] 1 [x] 2 [x] 3 [x] 4 (run; the 1900 Normal median is outside the band, reported and stopped) [x] 5

## Phase 57 — New balance band, a real price for the High-Speed Trainset, and a job for freight engines

Owner: "OK, let's do all 3" (2026-10-19), on the orchestrator's proposal after the Phase 56B review:
(1) accept the Phase 56 level and move the good bot's 1900 Normal band from $20-34M to **$30-45M** (median of 10 seeds);
(2) price the High-Speed Trainset by its real rating; (3) make heavy freight engines worth buying through real mechanisms.

Real mechanisms only; numbers in `src/data` with a one-line real justification. No new era tables or flat multipliers.
Never loosen a test bound or word limit (the band in item 1 is the owner's decision and is not a test bound).

1. **Band.** Write the new 1900 Normal band ($30-45M, median of 10 seeds) in PLAN's reference targets / HANDOFF and in the
   `tools/bench/survival.ts` comment. Other bounds unchanged (good survives everywhere; Hard >= 40 % below Normal).
2. **High-Speed Trainset price.** Its game `power` (16) is a gameplay cap; the real TGV Atlantique has 8.8 MW. Add an
   optional `ratedPowerKw` / `ratedPowerHp` to `LocomotiveDef` (the real rating, source note) used **only for price** when
   present; set it for the High-Speed Trainset (and any other engine whose game `power` is clearly a cap — check each
   diesel/electric against its real rating and list them). Report old/new prices.
3. **A job for freight engines (measure first, then build only the clear corrections).**
   a. *Bench* (`tools/bench/engineCosts.ts` or a new `freight.ts`): a coal line on real terrain — the mine in hills (where
      the game places mines) to a steel mill in the plains, a real climb on the loaded run — with the mine at the output it
      reaches after typical service growth (state the years), and a second case with 2-3 mines feeding one line. Every
      buyable engine of 1870, 1900, 1930, 1950, consist up to its `maxCars`; payback years and profit/yr.
   b. *Find the missing mechanism* if freight engines (Consolidation, Mikado, Articulated, Road Switcher, Heavy Diesel)
      still do not win. Check at least:
      - `LOCO_WEIGHT_UNITS` is 2 for every engine in `computeTargetSpeed`: a 540 t Articulated and an 8 t Grasshopper weigh
        the same in the effort model. Real: the engine's own weight is part of the train; and adhesion (weight on the driving
        wheels) limits what an engine can pull up a grade. Use the Phase 56 `weightTonnes` if it is the real mechanism.
      - Crew per train vs per car: a long freight train needs one footplate crew (check `trainCrewSize`).
      - Car weight units vs real tonnes (`CAR_WEIGHT_LOADED` 1, `CAR_WEIGHT_EMPTY` 0.4) and `GRADE_EFFORT_FACTOR`.
      - Industry output against real mines (a 19th-century colliery shipped tens of thousands of tonnes a year).
   c. *Build* only corrections of clear modelling errors with a real basis (e.g. engine weight in the effort model) and
      re-measure. **Do not change industry output or any economy scale**: if output volume is the missing piece, write the
      numbers and a proposal in PROGRESS for the owner and stop there.
   d. Target: on the hill coal line, a freight engine of its era has the best payback for a full train from 1870 on, while
      the Phase 56 passenger results (small engine best on short lines; fast engine on long lines) still hold. Report
      openly if missed.
4. **Balance.** Re-run the good bot (10 seeds, 1840/1900/1930/1950, Normal and Hard; medians) and the bad bots (3 seeds).
   1900 Normal median in $30-45M; Hard >= 40 % below Normal. If missed, report numbers and cause and stop (do not tune).
   If a balance test fails, report old/new values and the real cause; do not loosen it.
5. PROGRESS with tables, SPEC (§7.4 effort model if changed, §7.7 rating), e2e (update, never weaken), screenshot
   `phase-57-*.png` (a heavy coal train climbing on a hill line, its train panel). LOOK at it.
Status: [x] 1 [x] 2 [~] 3 (measured, no correction built; target missed, proposal in PROGRESS) [x] 4 [x] 5

## Phase 58 — Engines by job, as in Railroad Tycoon: power sets the useful train length, cargo urgency sets the value of speed

Owner: "OK, do this bigger phase" (2026-10-19), after the Phase 57 freight finding and a look at how Railroad Tycoon
did it. Sources (orchestrator's web search, 2026-10-19): in RT1 delivery speed matters most for mail, less for passengers
and fast freight, and bulk freight is paid by quantity, speed giving "little advantage"; engines differ in top speed and
drawbar horsepower, and more power "pulls more cars without slowing down much" (Grasshopper 20 mph / 500 hp, Mogul
25 mph / 2,000 hp, Mikado 45 mph / 3,500 hp); RT2 players match engines to jobs (Pacific for flat passenger runs, heavy
engines for mountain coal); RT3 mail, passengers and perishables decay fast. Phase 57 found the game's real mismatch:
small engines haul real-length trains (Norris 8 cars) but big ones about a quarter of one (Articulated 22, real 100+;
Consolidation 12, real 30-40), while big engines are priced like the real ones.

Real mechanisms only; numbers in `src/data` with a one-line justification and source. No new era tables or flat
multipliers. Never loosen a test bound or word limit. Measure before and after every step with
`tools/bench/engineCosts.ts` (passengers) and `tools/bench/freight.ts` (coal on a hill line, Terminal + full load).

1. **One train-length scale for every engine.** Replace the hand-set `maxCars` by the real typical train length of the
   type each engine stands for (cars of that era, one-line source per engine) times **one** stated game scale
   (`TRAIN_LENGTH_SCALE`, chosen so the early engines keep about their Phase 48 lengths). Big freight engines get
   proportionally longer trains. Power and grades (`computeTargetSpeed`) already slow a long train: check on the hill
   bench that a weak engine with a long train crawls up the ridge and a strong one does not, i.e. power decides the
   *useful* length, the cap only the real limit. Show the before/after table of `maxCars`.
2. **Stations and loading follow.** `maxTrainLength` (Depot 6 / Station 10 / Terminal 16) and the overlength slowdown:
   keep the rule (a too-long train loads slowly), and scale the platform lengths with the same `TRAIN_LENGTH_SCALE` if
   the new freight trains could otherwise never load at full speed anywhere; say which. Rendering: a long train must still
   draw correctly (check a 40+ car train on screen, curves and stations), and signalling/following must hold (unit tests
   for a long train through a junction and a passing loop). Performance: measure frame time with the longest train.
3. **Cargo urgency audit.** Freight already has `urgency`/`decayDays` per cargo and an early-delivery bonus of up to
   +25 % (`computeRevenue`). Real basis: bulk freight (coal, ore, stone, lumber, grain) was carried on tonnage tariffs,
   paid per ton-mile whatever the speed; express and perishable goods, mail and passengers paid for speed. Check each
   cargo's urgency, decay and early bonus against that and correct the clear errors (e.g. no early bonus for bulk). Say
   which cargoes change and why. Passengers keep their Phase 53 fare rule.
4. **Measure the roles** (both benches, 1870/1900/1930/1950; small towns and big cities; coal on the hill line with 1 and
   3 mines at x2.16). Target, as in Railroad Tycoon:
   - short passenger line: a small, cheap engine pays back fastest (Phase 56 result kept);
   - long passenger line between big towns: a fast passenger engine is the best buy;
   - heavy coal on the hill line: a strong freight engine of the era (Consolidation, Mikado, Articulated, a heavy diesel)
     is the best buy for a full train from 1880 on;
   - list each engine with the case it wins; most engines should win something. Report misses openly.
5. **Balance.** Good bot (10 seeds, 1840/1900/1930/1950, Normal and Hard, medians) and bad bots (3 seeds). The good bot
   should pick freight engines for its freight lines (`chooseLoco` by payback, consist sized by demand). 1900 Normal median
   in $30-45M; Hard >= 40 % below Normal; good survives everywhere. If missed, report the numbers and cause and stop. If a
   balance test fails, report old/new values and the real cause; do not loosen it.
6. PROGRESS with tables, SPEC (§7.4, §7.7, §8 cargo urgency, stations), e2e (update, never weaken), screenshots
   `phase-58-*.png`: a long coal train with a heavy engine on a hill line, a short local, the buy list. LOOK at them.
Status: [x] 1 [x] 2 [x] 3 [x] 4 (measured; freight-engine targets missed, see PROGRESS) [x] 5 [x] 6

## Phase 59 — Track joins that work, a strong test player, and an economy checked against real railways

Owner play-test (2026-10-19, Normal, 1845), "Go" on the orchestrator's proposal:
- "Had some problems building rails here": `docs/playtests/pt6-track-red.jpg` (a straight E-W drag from the NE-SW line to
  the NW-SE line is red; the refused step is at the join with the NW-SE line; no reason shown) and
  `docs/playtests/pt6-track-suggestion.jpg` ("Smallest legal connection $12k" detours south to another line instead).
- "On Normal the game is way too easy. I almost cannot build as fast as I can make money. Maybe the bots are too stupid?"

Real mechanisms only; numbers in `src/data` with a one-line justification **and a source**. No flat multipliers. An era
table is allowed only where each row has a real source. Never loosen a test bound or word limit.

1. **Track joins (do first, push on its own).**
   - Reproduce the owner's layout in a unit test: two diagonal lines crossing in a V, a straight E-W drag joining one at a
     mid-line tile from the other. Find why the join step is refused (sharp turn, junction-layout rule, diagonal node
     geometry). If it is a bug, fix it. If it is a rule, check it against real practice: a turnout off a diagonal line
     at 45° is a normal junction and should be legal.
   - A red drag always says why, in one short line near the cost label (strings.ts, word limits kept), e.g. "Too sharp
     to join here" or "Junction too close to another".
   - "Smallest legal connection" prefers a legal join next to where the drag ended (nearest tiles on the same line)
     before any detour to another line. Test both.
   - e2e: the owner's case draws green (or shows the reason and a nearby legal suggestion). Screenshot
     `phase-59-track-join.png`. LOOK at it.
2. **A strong test player** (`tools/bench/strongPlayer.ts`, keep `goodPlayer.ts` as the cautious reference). Plays like
   the owner: spends cash as soon as a profitable build is available (small reserve: one month of costs), builds
   multi-stop lines through towns, adds freight lines (mine/forest/farm to their consumers, Terminal + full load where
   output is big), picks engines by payback (`paybackEstimate.ts`), adds trains while lines have waiting cargo, upgrades
   busy single track. Must not go bankrupt in 10 seeds on Normal, 1840 and 1900. Report its net worth, trains, track
   and cash curve by year next to the good bot's, and how fast cash piles up unspent ("cash idle > 20 % of net worth"
   is the owner's "cannot build as fast as I make money").
3. **Economy against real railways (measure first).**
   a. Measure, per era (1840, 1870, 1900, 1930, 1950), for the strong player on Normal: operating ratio (operating costs
      / revenue), return on capital (operating profit / capital invested), payback of a new line and of a train, and
      the cost split (crew, fuel, engine and car upkeep, track upkeep, stations, overheads).
   b. Find the real figures with sources (web search): operating ratios of British and US railways by decade (roughly
      50-60 % in the 1840s-60s, 60-70 % around 1900, 70-80 % in the 1920s-50s — verify), returns on railway capital
      (a few % to ~10 %), the real cost split (maintenance of way, motive power, transportation, general/administration,
      taxes). Write them in PROGRESS with links.
   c. Compare. Where a real cost category is missing or far too small in the game, add or correct it from its real
      source (e.g. general administration and taxes as a share of revenue or of capital; track maintenance per
      train-mile; station staff; car upkeep). Do not cut fares unless a fare is shown to be above the real one.
   d. Target, Normal, strong player: operating ratio inside the real range of its era (a game may sit at the low end),
      return on capital well above real (it is a game) but cash is tight for the first several years: report how many
      years until "cash idle > 20 % of net worth". Hard must stay harder than Normal by >= 40 % (medians).
4. **Bands.** Re-run good bot and strong player, 10 seeds, all eras, Normal and Hard (medians), bad bots 3 seeds. Do
   not set new bands yourself: report the numbers; the owner decides the new bands. Good survives everywhere; the strong
   player survives on Normal. If a balance test fails, report old/new values and the real cause; do not loosen it.
5. PROGRESS with tables and sources, SPEC (§9 costs, §5 track joins), e2e (update, never weaken), screenshots. LOOK.
Status: [x] 1 [x] 2 [x] 3 (measured; cost fix on branch phase-59-costs, tests red, owner decides) [x] 4 (numbers, no bands set) [x] 5

## Phase 60 — Merge the real running costs (section gangs, head office); new reference player for balance

Owner: "OK, do this, yes" (2026-10-20) on the orchestrator's proposal after Phase 59: (1) merge branch `phase-59-costs`
with the **4-man** section gang (4 men per 24 km) and the 14 % head office, and lower the two long-haul `lateReturn`
bounds that it breaks from 0.6 to **0.5** (owner OK, only these two: `tests/sim/balanceLongHaul.test.ts` 1900 chain and
1930 silver chain); (2) base the balance bands on the strong player from now on: measure, the orchestrator proposes, the
owner decides. Track/station build cost toward real (about 1/20 of real per km today) is **not** in this phase.

1. **Merge.** Bring `phase-59-costs` (commit 4976fcf) onto current main (merge or cherry-pick, resolve conflicts). Keep
   `SECTION_GANG_MEN` 4, `SECTION_LENGTH_KM` 24, `GENERAL_ADMIN_SHARE_OF_EXPENSES` 0.14 with their sources. Lower only the
   two named bounds to 0.5; write old/new/measured and the reason in PROGRESS. Every other test must pass unchanged; if
   another one fails, report it with the real cause and stop (do not loosen it). Finance panel shows "Head office" and the
   track upkeep line; word limits kept. Old saves load.
2. **Measure (pieces of at most ~15 minutes, each pushed to `docs/bench/phase60.md` as it finishes).** Strong player and
   good bot, 10 seeds, 1840/1870/1900/1930/1950, Normal and Hard: final NW median [min-max], bankruptcies, operating ratio
   yr 3/10/16, return on capital, years to cash > 20 % of NW. Bad bots 3 seeds. Do not set bands; write the table.
3. SPEC (§9 costs: section gangs, head office), PROGRESS with tables, e2e (update, never weaken), screenshot
   `phase-60-finance.png` (finance panel with Head office and track upkeep). LOOK at it.
Status: [x] 1 (orchestrator, f7d11b0) [x] 2 (numbers in docs/bench/phase60*.md and PROGRESS; no bands set) [x] 3

## Phase 61 — Real staffing and running costs by era (replace the tuned `COST_REALISM_ANCHORS`)

Owner: "Go" (2026-10-20), after the Phase 60 numbers. `COST_REALISM_ANCHORS` (src/data/economy.ts: 0.21 in 1830, 0.2 in
1870, **0.05 in 1900**, 0.12 in 1930, **0 in 1950**) was picked in Phases 43/53 by sweeping values until the good bot
survived: no real basis. It blends "early" and "mature" crew shifts, coach attendants, servicing/fuel and the station
handling share, so 1900 and 1950 run on 1830s skeleton costs. Phase 60 strong player, Normal: operating ratio y16 0.34 /
0.39 / 0.41 / 0.57 / 0.56 (1840 / 1870 / 1900 / 1930 / 1950) against real 0.43-0.53 (1840s-50s), ~0.63 (1901), ~0.74
(1927-50); idle cash > 20 % of NW after 2 years in 1900 and 1950.

Real mechanisms only; every number in `src/data` with a one-line justification **and a source**. Never loosen a test
bound or word limit; if a balance test fails, report old/new values and the real cause and stop (the owner decides).
Benches in pieces of at most ~15 minutes, each pushed to `docs/bench/phase61.md`.

1. **Replace the table with what it stands for, from history.** Remove `COST_REALISM_ANCHORS` / `costRealism` /
   `blend`. For each quantity it blended, use the real figure of the era (sourced; interpolated between sourced years):
   - crew shifts per train per day (single crew 1830s-60s; shift working / hours-of-service laws later — e.g. US 1907
     Hours of Service Act, 1916 Adamson eight-hour day; British 1890s hours inquiries);
   - attendants per passenger/mail car (guards only early; conductors, brakemen, porters, dining/sleeping staff later);
   - servicing/fuel share and fuel per tile (wood/cheap coal early, bought coal and oil later; real fuel prices by era);
   - station handling share of fares (ticket clerks, porters, agents' commission).
   Each must rise as the real one did (a later railway is never cheaper to staff than an earlier one at the same size).
   Wages already follow the era; do not double count.
2. **Measure** (strong player 10 seeds Normal, 5 Hard; good bot 5 seeds; bad bots 3 seeds, 1840/1900/1950 only):
   operating ratio y3/10/16, return on capital, NW medians, bankruptcies, years to cash > 20 % NW. Target: operating ratio
   inside or close to the real range of each era; strong player survives Normal everywhere; Hard harder than Normal in
   every era. Report misses; do not tune.
3. PROGRESS (tables, sources), SPEC §9, e2e (never weaken). No bands set: the orchestrator proposes, the owner decides.
Status: [x] 1 (merged by orchestrator, 01c638b) [x] 2 [x] 3 (late-era bankruptcies reported, owner decides)

## Phase 62 — Passenger shares that follow town size; a better repair-crew vehicle (after Phase 61)

Owner play-test 7 (2026-10-20, Normal, 1838-1845; `docs/playtests/pt7-*.jpg`): "Much better than before. Still, feels
like I have a little more money on Normal." The owner clarified: "I meant a little too much money" (Normal is still slightly too easy; Phase 61 handles costs). "Is it OK that the same number of passengers wait
for each station?" (`pt7-where-passengers-go.jpg`: Ljubljana sends 11/mo, 25 % each, to Vienna, Venice, Trieste and Graz,
although Vienna is several times Graz.) "Graphics for the repair car are quite bad, need to improve them a bit."

Real mechanisms only; numbers in `src/data` with a one-line justification and source. Never loosen a test bound or word
limit; if a balance test fails, report old/new and the cause and stop (owner decides).

1. **Passenger shares by destination.** Cause to confirm: `capShares` (src/sim/stations/passengerFlows.ts) water-fills
   gravity shares to `PAIR_DEMAND.maxShare` 0.2 over every town in range; with 5-6 towns in range every big destination
   sits at the cap, so served towns come out equal. The cap has no real basis. Replace it with the real mechanism: the
   gravity model (trips ∝ population × distance decay, with the existing exponent and source) plus **intervening
   opportunities** / competing destinations (a town's pull is shared with the nearer towns along the way; Stouffer 1940,
   or a doubly-constrained gravity model) so a metropolis does not take everything without an arbitrary cap. A bigger,
   nearer town must draw more than a smaller, farther one. Unit tests: Vienna > Graz from Ljubljana in the owner's case;
   a metropolis among small towns gets a large but not total share. Re-run the passenger benches (S4 express + locals,
   `explore.ts`) and the strong player (5 seeds Normal, 1840/1900) and report.
2. (Moved to Phase 63: repair-crew art.)
3. PROGRESS, SPEC (§8.1 passenger shares), e2e (never weaken).
Status: [x] 1 [-] 2 (moved to 63) [x] 3

## Phase 63 — UI: news opens its train, clear news in one tap, industry panel as a picture, drop the stop gap stepper, repair-crew art

Owner play-test 7 (2026-10-20; `docs/playtests/pt7-news.jpg`, `pt7-steelmill-panel*.jpg`): "If there are news regarding a
train, tapping on this news should open the train. No need to confirm when clearing news. This [industry] info on the
station is not very user friendly, way too much text, need a better way to represent it graphically. We can remove the
settings for how many days to wait between trains at a stop, I never use it." Plus Phase 62 item 2: "graphics for the
repair car are quite bad".
UI/render only (`src/ui`, `src/render`, strings): no sim or balance change, so it can run beside Phase 61. Word limits
(`e2e/phase49Words.spec.ts`) kept or lowered, never raised. STYLE.md Part 3 look.

1. **News opens its subject.** Every news item about a train (breakdown, "nobody accepts", stuck, worn out, ...) is a
   tap target that opens that train's panel (as town/industry news already open their place); the item shows a chevron.
   If the train no longer exists, the tap does nothing and the chevron is not shown. e2e.
2. **Clear all news in one tap** (no "Clear all news?" step). Strings tidied. e2e updated (not weakened: it checks the
   list is empty after one tap).
3. **Industry panel as a picture** (station Cargo tab for a processing industry, e.g. the steel mill): replace the text
   lines ("Makes steel from coal and iron ore", "Last month: 38 t coal, 75 t iron ore -> 38 t steel", "Stock: 21 t coal,
   240 t iron ore (full)", "On the way: coal", the details note) with a small recipe diagram: input cargo icons with a
   stock gauge each (fill = stock / capacity, "full" as a coloured cap, a small truck/train mark when some is on the way),
   an arrow, the output icon with last month's amount. Numbers stay as short labels (e.g. "38 t"); explanations go
   behind (i). Same treatment for raw producers (output gauge) and for towns' demand chips where it fits. Word count of
   the panel must go down. Screenshots `phase-63-industry-panel.png` (steel mill with one input full, one on the way).
4. **Remove the per-stop "days between departures" stepper** from the train Route tab (the calendar row with - / + under
   each stop). Keep the line-level "Space trains evenly" button (one tap, it sets the gap itself). Old saves keep any gap
   they have; the sim is unchanged. e2e for the stepper removed, the Space-evenly e2e kept.
5. **Repair-crew vehicle art** (`src/render/repairCrews.ts`): a recognisable repair/breakdown train in the engraved style
   (a small engine with a tool van, a crane wagon from about 1870, a motor/diesel later), drawn procedurally and cached
   like the engines; also in the panel thumbnail if it has one. Screenshot `phase-63-repair-crew.png` at zoom 1 and 2.
6. PROGRESS, SPEC (§10 UI), e2e (update, never weaken), LOOK at every screenshot.
Status: [x] 1 [x] 2 [x] 3 [x] 4 [x] 5 [x] 6

## Phase 64 — Goals and balance by profit and revenue, not cash (after Phase 61's numbers)

**Start from branch `phase-62-shares`** (Phase 62 item 1: volume unchanged, split by uncapped gravity; Venice-Milan bound
500 -> 700 with owner OK). Its one remaining red test, `goalCalibration` (gold goal within sight, ratio <= 3, now 3.25),
concerns the net-worth gold goal this phase replaces: rewrite it for the new goal types (same intent: every gold goal
reachable by the reference operator within a ratio of 3), never loosen it. Merge 62 + 64 to main together, and tick both.
Goal amounts: derive from the Phase 65 strong-player medians (`docs/bench/phase65.md`; write the formula), push the
branch, and **stop before merging** so the orchestrator can show the owner the amounts.

Owner (2026-10-21): "The goal of total cash does not seem OK to me. We should strive for profit or revenue, not cash. We
want players to spend money to build things, not hoard it." Today `netWorth` = cash - loans + **0.5** x construction +
rolling stock (`NET_WORTH_CONSTRUCTION_FRACTION`), so every $1 spent on track lowers net worth by $0.50: a net-worth goal
(`src/data/goals.ts` gold 1870 $25M, gold 1930 $260M, silver 1920 $50M; random gold `startingCash x 77`) rewards hoarding.

1. **Goal types.** Replace the `netWorth` goal type with **`annualProfit`** (operating profit of a completed calendar
   year: revenue - running costs, as the Finance overview defines it; no construction) and keep `annualRevenue`. Every
   region goal and the random gold goal that used net worth becomes an `annualProfit` (or `annualRevenue`) goal. Amounts:
   from the Phase 61 strong player's yearly operating profit / revenue medians at the goal's year (state the source row);
   the orchestrator checks them with the owner before merging. Goals panel and toasts: short labels ("Yearly profit $4M by
   1900"); strings in strings.ts; word limits kept. Old saves: a stored `netWorth` goal converts to the matching
   `annualProfit` goal on load.
2. **Other uses of net worth that steer play:** list every place (achievements, company history ranking, scenario wins,
   game-over, credit limit) and change only those that reward hoarding to profit/revenue, saying which; credit limit
   stays (lenders look at assets and earnings). Report the list.
3. **Bench headline:** `strongPlayer`/`goodPlayer`/`survival` print yearly operating profit and revenue (years 5/10/16) as
   the headline; bands from now on are on profit and revenue (owner decides the numbers).
4. Tests (update goal tests to the new type; never weaken), e2e, SPEC §11, PROGRESS.
Status: [x] 1 [x] 2 [x] 3 [x] 4

## Phase 65 — Each crisis as deep as it really was

Owner: "Go" (2026-10-21) after Phase 61: the strong player goes bankrupt in 4/10 Normal 1930 and 8/10 Normal 1950 runs,
all in scheduled recessions (1937, 1953, 1957, 1960). `src/data/panics.ts` gives every panic the same base fall in
passenger and freight demand, `PANIC_DEPTH_RANGE` 0.2-0.4 for 12-24 months, so every recession is as deep as the Great
Depression; with mostly fixed costs (track gangs, stations, crews, head office) one panic turns a 0.70 operating ratio
into a loss.

Real mechanisms only; numbers in `src/data` with a one-line justification **and a source**. Never loosen a test bound;
if a balance test fails, report old/new and the cause and stop (owner decides). Benches in pieces of at most ~15 minutes,
pushed to `docs/bench/phase65.md`.

1. **Per-panic depth and length from history.** For each panic in `PANICS`, the real fall in railway traffic or gross
   earnings (passenger and freight separately where the source has it) and its length, e.g. US railway gross earnings /
   ton-miles / passenger-miles by year (ICC, NBER, Historical Statistics of the US), British railway receipts (Mitchell).
   Orchestrator's rough memory to verify, not to use unchecked: 1893 about -12 %, 1907-08 about -10 %, 1929-32 about
   -50 % over three years, 1937-38 about -18 %, 1953-54 and 1957-58 about -8 to -10 %, 1960-61 a few %. Replace the flat
   range by these per-panic figures (with the seeded draw kept only as small noise around the sourced value, if at all).
   Keep the difficulty's depth/duration factors (Hard deeper). A panic without a source: say so and use the nearest
   sourced one of its kind, flagged.
2. **Measure** (strong player 10 seeds Normal / 5 Hard, good bot 5 seeds, all eras): revenue and operating profit y5/10/16,
   op ratio, bankruptcies, Hard vs Normal. Target: strong player survives Normal in every era; Hard harder than Normal.
   Report misses; do not tune. If 1930/1950 Normal still fail, report the cause (no start-cash change in this phase).
3. PROGRESS (tables, sources), SPEC (§9 panics), tests (update fixtures for the new per-panic data; never weaken).
Status: [x] 1 [x] 2 [x] 3

## Phase 66 — Lay up trains in a slump (what real railways did in the Depression)

Owner: "Go" (2026-10-21) after Phase 65: a 1930 start meets the real Great Depression (-48 % traffic 1931-32) and the
strong player goes bankrupt in 7/10 Normal runs, because a train pays its full crew and servicing even half-empty or idle.
Real railways laid up engines and laid off crews: US railway employment about 1.7 M (1929) -> about 1.0 M (1933) and the
operating ratio only rose from about 0.72 to 0.77 (verify with sources).

Real mechanisms only; numbers in `src/data` with a one-line justification and source. Never loosen a test bound; if a
balance test fails, report old/new and cause and stop on a branch `phase-66-layup` (owner decides).

1. **Lay up / return to service** (commands `layUpTrain`, `returnTrainToService`, `{ok}`/`{ok:false, reason}`): a train
   stopped at a station with a depot/engine shed (or any station: say which, with the real basis) is laid up: it holds no
   platform or block, pays **no crew wages** and only a laid-up share of its servicing (stored engines were greased and
   inspected: source the share), still ages and still counts in net worth. Returning takes a stated time (fire-up /
   recrew, e.g. a day or two) and resumes its orders. Saves: old saves load with no train laid up.
2. **UI.** Train panel: one "Lay up" / "Back in service" button (strings.ts, word limits kept); a laid-up train is drawn
   parked/greyed at its station and the Trains list shows it as "Laid up". During a panic, one news line once per panic:
   "Traffic down N % — lay up trains on losing lines" (tap opens the Trains list).
3. **Bots.** `strongPlayer.ts`: in a panic, lay up the trains of lines whose operating profit is negative over the last
   2-3 months (keep at least one train per line), return them when the panic ends or the line's waiting traffic needs
   them. `goodPlayer.ts` the same, simpler. Bad bots unchanged.
4. **Measure** (strong 10 seeds Normal / 5 Hard, good 5 seeds, all eras; pieces to `docs/bench/phase66.md`): bankruptcies,
   revenue and operating profit y5/10/16, op ratio, Hard vs Normal. Target: strong player survives Normal in every era
   (1930 included); Hard harder than Normal. Report misses; do not tune.
5. e2e (lay up and return; never weaken), PROGRESS (tables, sources), SPEC (§7, §9), screenshot `phase-66-laid-up.png`
   (a laid-up train and the button). LOOK at it.
Status: [x] 1 [x] 2 [x] 3 [x] 4 [x] 5

## Phase 67 — Loans as long-term bonds; one re-measure; goals, achievements and scenario stars on yearly profit

Owner: "Go" (2026-10-21). Phase 62 + 64 are merged to main by the orchestrator (passenger split by uncapped gravity with
the old volume; net-worth goals replaced by yearly profit/revenue goals, amounts from the pre-62 Phase 65 medians).
Phase 66 found the 1930 bankruptcies are the lenders' call: in a panic the credit limit falls (477k -> 35k in one seed)
and debt over the limit is called out of cash. Real railways borrowed on long-term bonds (often 20-50 years) that could
not be called; in a panic they could not borrow more, and a railway that missed its interest went into receivership.

Real mechanisms only; numbers in `src/data` with a one-line justification and source. Never loosen a test bound; if a
balance test fails, report old/new and cause and stop on a branch `phase-67` (owner decides). Benches in pieces of at most
~15 minutes, each pushed to `docs/bench/phase67.md`; never end a turn while a bench runs.

1. **Bonds.** Borrowing issues a bond with a term (sourced typical railway bond term by era) and interest; existing debt is
   never called because the credit limit fell. The credit limit only limits **new** borrowing. Repay early stays allowed.
   Bankruptcy: when cash stays negative past the grace period because interest or running costs cannot be paid (as now
   for operating losses), not because of a call. Old saves: existing loans become bonds with the default term. UI: Borrow
   shows the term; strings short. Unit tests: a panic cuts the limit but calls nothing.
2. **Laid-up trains do not count as service** in the passenger service rates (`serviceRates`, Phase 66 note).
3. **Re-measure** (strong 10 seeds Normal / 5 Hard, good 5 seeds, all eras): profit and revenue y5/10/16, op ratio,
   bankruptcies, Hard vs Normal, laid-up counts. Targets: strong survives Normal in every era; Hard harder than Normal.
   Report whether 1900 got too easy after Phase 62 (strong 1900 profit y16 was 2.8M before 62, about 9.7M on 5 seeds
   after) and the real reason; do not tune.
4. **Re-derive the goal amounts** from these medians with the Phase 64 formula (same `goalCalibration` bounds), and move
   achievements `worth1M/10M/100M` and scenario net-worth stars to yearly operating profit (thresholds from the same
   medians: say which year index and why). Table of old -> new for the owner in PROGRESS; push and STOP before merging
   item 4 (branch `phase-67-goals`) so the orchestrator can show the owner the amounts. Items 1-3 go to main when green.
5. PROGRESS, SPEC (§9 finance, §11 goals), e2e (never weaken).
Status: [x] 1 [x] 2 [x] 3 [ ] 4 [x] 5
