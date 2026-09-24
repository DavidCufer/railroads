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

- [ ] Data tables in `src/data/`: cargo types (§8.1), industries (§8.2), city tiers (§8.3).
- [ ] Generator places cities (names from a syllable generator) and industries with the terrain affinities; playability check.
- [ ] Render cities (roof clusters by tier, labels scaled by tier and zoom) and industry icons.
- [ ] Info mode: tap a city/industry → right-side panel with basic info (name, tier/pop, produces/accepts).
- [ ] UI framework basics: the `h()` helper, panel container with slide-in/out, close button, toasts, `strings.ts`.
- [ ] Top bar with the date (static for now), a cash placeholder, and speed buttons wired to the sim loop (the calendar advances).

**Tests:** city spacing rule, industries placed only on allowed terrain, deterministic placement.
**E2E:** tap a city → panel shows its name; screenshot.

---

## Phase 4 — Track building
SPEC: §5 (all), §9.1 (starting cash), §9.5, §12 (commands)

- [ ] Track graph data structure (nodes = tiles, edges with double/electrified/bridge), with efficient add/remove and adjacency queries.
- [ ] Cost calculator (terrain multipliers, diagonal, grade, bridges by era, inflation, difficulty).
- [ ] `commands.ts` with `buildTrack`, `bulldoze` (with validation + reasons).
- [ ] Build toolbar; Track mode with drag → A* ghost path, green/red coloring, 45° turn markers, cost label, confirm bar (and the Quick build setting).
- [ ] Bridge auto-selection and tap-to-cycle bridge type in the confirm bar; bridge rendering by type.
- [ ] Double mode (upgrade), Bulldoze mode (25% refund).
- [ ] Two-finger pan while in build modes.
- [ ] Track rendering cached per chunk (ties at zoom ≥ 1, lines at low zoom, double = parallel).
- [ ] Cash shown and deducted; can't build when unaffordable (red + reason toast).

**Tests:** cost calculations (table-driven, incl. bridges, grades, diagonals), build/bulldoze round-trip, the turn-rule traversal function, can't build on water without a bridge, water bridge length limits.
**E2E:** simulate a drag between two tiles in `?debug=1` mode, confirm, and assert the edges exist and cash decreased by the previewed cost.

---

## Phase 5 — Stations
SPEC: §6.1, §6.3 (supply/acceptance calculation; no cargo flow yet)

- [ ] `buildStation`, `upgradeStation` commands; placement on track tiles; default naming.
- [ ] Station mode with a catchment preview overlay and a supplies/accepts preview panel before confirming.
- [ ] Acceptance-point calculation and supply-source calculation per station (cached; invalidated when stations/cities/industries change).
- [ ] Station rendering by type (platform + building, bigger for terminals); station labels.
- [ ] Station panel (name + rename, type, upgrade, supplies/accepts, placeholder for waiting cargo).
- [ ] The first station built gets a free Engine Shed (flag only for now).

**Tests:** catchment radius per type, acceptance threshold (≥ 8 points), overlapping supply split, naming rules.

---

## Phase 6 — Trains: buying, orders, movement, blocks
SPEC: §7.1–7.5, §7.7 (roster data; availability by year)

- [ ] Locomotive roster data table; available-by-year filter.
- [ ] `buyTrain` (must be at a station with an Engine Shed), car selection, orders editor (tap stations on the map), per-stop loading rules (store them; loading comes in Phase 7).
- [ ] A* routing over the track graph with the turn rule, wooden-bridge weight limit and electrification constraints; path cache and invalidation on track change.
- [ ] Movement with the speed model (grade, curves, acceleration), reversing at stations.
- [ ] Block partitioning; single/double-track reservation rules; station capacity; waiting at boundaries; deadlock timeout rerouting; ⚠ for no-route/jams.
- [ ] Train rendering: loco by type (steam smoke puffs, diesel hood, electric pantograph) + cars colored by cargo, rotated along the track, smooth interpolation between ticks.
- [ ] Train panel (status, orders, consist), Train list, tap a train to select, camera follow toggle.

**Tests:** pathfinding respects the 45° rule and constraints; two trains on a single-track line between two stations never occupy the same block; the same on double track allows opposing movement; a deadlock scenario triggers a reroute or warning within the timeouts; the speed model on a grade.
**E2E (debug hooks):** build a small line, buy a train, run 30 in-game days at 8×, assert the train visited both stations; screenshot.

---

## Phase 7 — Cargo flow and economy
SPEC: §6.3, §7.2 (loading rules), §8.1 (revenue), §8.2 (processing), §8.3 (city supply), §9 (finance)

- [ ] Daily production accrual to stations, storage caps, waiting-cargo decay.
- [ ] Loading/unloading with time cost (station type, train length), Auto / Full load / Unload only / Pass through rules.
- [ ] Revenue formula with the time factor; floating `+$` labels; per-train revenue stats.
- [ ] Processing chains (steel, lumber, food, goods, fuel) with a monthly processing step.
- [ ] Finance: monthly maintenance (trains, track, stations), loans (borrow/repay, credit limit, interest), ledger by category, net worth, bankruptcy rules by difficulty.
- [ ] Finance panel with the ledger table and a cash/net-worth line chart; yearly report dialog.
- [ ] Station panel shows waiting cargo bars; train panel shows the current load.

**Tests:** the revenue formula (table-driven), processing (steel needs both inputs), a loan/interest schedule, bankruptcy sequence, a deterministic 1-year simulation snapshot test (same seed + command log → same cash).
**Accept:** a hand-built coal mine → steel mill route plus a two-city passenger route are profitable within 2 in-game years at Normal difficulty (checked in a test). Tune the numbers in the data tables if not, and note the changes as Deviations.

---

## Phase 8 — Eras and technology
SPEC: §3, §5.3 (era-gated bridges, electrification), §7.6, §7.7, §9.5

- [ ] Year-gated availability everywhere (locos, bridges, electrification, cargo types like oil/fuel, improvements).
- [ ] Electrify mode + electric-loco route constraints + catenary rendering.
- [ ] Breakdowns, aging, obsolescence, steam phase-out rules; Replace Loco with trade-in.
- [ ] Water tower rule for steam.
- [ ] News system: messages (new tech, breakdowns, washouts, jams, city growth) → toasts + a News panel with history and an unread badge.
- [ ] Wooden bridge washout events.
- [ ] "New!" badges in the buy dialog; a technology section in the yearly report.

**Tests:** availability by year, breakdown probability formula, trade-in value, steam can't be bought after 1960, electric locos refuse non-electrified routes.

---

## Phase 9 — Upgrades and growth
SPEC: §6.2, §8.2 (industry dynamics), §8.3 (growth, civic investment)

- [ ] All station improvements with their effects wired into the economy and train logic.
- [ ] City growth model, footprint expansion (new tiles re-rendered), tier changes with news.
- [ ] Civic Investment command + button in the City panel.
- [ ] Industry growth/shrink/new-industry spawning.
- [ ] Overlays: all catchments, cargo supply heatmap, track type colors, train profit colors.
- [ ] Mini-map.

**Tests:** each improvement's effect (table-driven), city growth threshold crossing, civic investment cooldown, industry dynamics bounds (0.5×–3×).

---

## Phase 10 — Real-world maps and the new game screen
SPEC: §4.3, §4.4, §11

- [ ] `tools/mapgen` pipeline (Node script, `npm run mapgen -- <regionId>`), with a Natural Earth download + cache; hand-authored fallback polygons if the network is blocked (record which was used in PROGRESS.md).
- [ ] Region definitions for `us-east`, `gb`, `central-eu`, `us-west` (cities with real coordinates and start tiers, mountain features, resource zones, founding years for cities founded after the start year).
- [ ] Generated JSON committed under `src/data/regions/`; the loader turns it into `GameState`.
- [ ] Cities with a founding year appear when that year arrives.
- [ ] New game screen: Real World tab (cards with thumbnails) + Random tab (all options) + difficulty.
- [ ] Goals system (data-driven goal types), per-region goal sets, generated goals for random maps, Goals panel, celebration dialog.
- [ ] Title/main menu screen: New Game, Continue, Load, Settings.

**Tests:** each region loads; city positions are within ±1 tile of their projected lat/lon; key cities are on land; the goal evaluators.
**E2E:** screenshot of each region at overview zoom → `docs/screenshots/phase-10-<region>.png`. Eyeball these for recognizability and note any issues.

---

## Phase 11 — Save/load, settings, polish
SPEC: §13, §10 (remaining UI), §3

- [ ] Save serialization with versioning + a migration scaffold; IndexedDB storage; 3 rotating autosaves + 5 manual slots; autosave on app pause.
- [ ] Load screen with slot details; Continue = latest save.
- [ ] Settings screen (units, quick build, sound, grid, UI scale).
- [ ] First-game hints: a lightweight, dismissible tip sequence (build track → station → train → earn), not a blocking tutorial.
- [ ] Optional WebAudio sounds (whistle, chug, cash ding), off by default if they're annoying.
- [ ] UI pass on a phone-sized viewport (800×360): no overlapping panels, 44 px targets, readable text.

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
