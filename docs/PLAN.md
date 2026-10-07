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

Status: [x] 1 [ ] 2 (no bound can be restored: see PROGRESS 35E) [x] 3

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

Status: [ ] 1 [ ] 2 [ ] 3 [ ] 4 [ ] 5 [ ] 6
