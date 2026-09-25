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

- [ ] Stress scenario (Large map, 60 trains, 1,500 track edges) in debug mode; measure sim tick and frame time in e2e; optimize until the targets are met (path caching, block lookup, chunk caching, avoid per-frame allocations).
- [ ] Memory check: no unbounded growth over 20 in-game years at 8× (news history capped, charts downsampled).
- [ ] Error boundary: an uncaught exception shows a "Something went wrong — Save & Reload" dialog and writes an emergency save.
- [ ] Release build config: minified, source maps off in the APK, versionCode/versionName from package.json; an optional signed-release workflow using repository secrets (document the setup; don't commit keys).
- [ ] Final README: features, how to play, how to build, how to install.

**Accept:** targets met in desktop Chromium with 4× CPU throttling (Playwright CDP) as a proxy for a mid-range phone; APK artifact builds in CI.

---

## After v1 (ideas, not scheduled)
Tunnels; more regions (Japan, Scandinavia, the Iberian peninsula, India); a scenario editor; transfers
between trains; seasonal effects; achievements.
