# Progress log

Append one entry per phase/session: date, phase, what was built, key files, known issues, carry-over.

## 2026-09-24 — Planning
- Wrote `docs/SPEC.md`, `docs/PLAN.md`, `CLAUDE.md`. No code yet.
- Next: **Phase 0 — Project scaffold**.

## 2026-09-24 — Phase 0: Project scaffold
- Vite + TypeScript (strict) project scaffolded per SPEC §1 folder layout (`src/sim/{map,track,stations,trains,economy}`,
  `src/render`, `src/ui`, `src/data`, `src/save`, `tools/mapgen`, `tests`, `e2e`), with placeholder `index.ts` files in
  each not-yet-built folder.
- `index.html`: full-screen `#game-canvas` + `#ui` overlay div, safe-area-friendly base CSS.
- ESLint 9 flat config (`eslint.config.js`) with `@typescript-eslint`, plus a `no-restricted-imports` rule scoped to
  `src/sim/**` that blocks imports from `src/render/**` and `src/ui/**` (verified: it correctly errors on a test import).
  Prettier configured (`.prettierrc.json`, docs/*.md excluded from formatting to avoid churn on hand-written spec docs).
- `src/sim/rng.ts`: seeded PRNG (xmur3 seed expansion + sfc32 generator), pure, no `Math.random()`. Unit tests in
  `tests/sim/rng.test.ts` cover determinism (same seed → same sequence), range bounds, and `pick`.
- Game loop skeleton: `src/render/loop.ts` (fixed 20 Hz sim tick accumulator driving a `requestAnimationFrame` render
  loop, capped ticks/frame, clamps huge frame gaps) + `src/render/fps.ts` (rolling average frame time) +
  `src/main.ts` (wires the loop, draws a placeholder background, dev-only FPS/tick overlay under `?debug=1`, exposes
  `window.__game` in debug mode).
- Playwright configured (`playwright.config.ts`) to use the pre-installed Chromium at
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` when present (falls back to Playwright's own install
  otherwise, e.g. in CI), building + previewing the app. Smoke test (`e2e/smoke.spec.ts`): page loads, canvas is
  visible, no console errors, screenshot saved to `docs/screenshots/phase-0-smoke.png`.
- npm scripts: `dev`, `build`, `preview`, `typecheck`, `lint`, `format`, `test`, `e2e`, `check`.
- `.github/workflows/ci.yml`: installs deps + Chromium, runs `npm run check`, `npm run build`, `npm run e2e` on
  push/PR; uploads the Playwright report as an artifact.
- `.gitignore` covers `node_modules`, `dist`, Android build outputs, `tools/mapgen/.cache`, test-results output.
- Verified locally: `npm run check` (typecheck + lint + unit tests) and `npm run e2e` both pass; `npm run build`
  produces a working `dist/`.
- Key files: `src/main.ts`, `src/render/loop.ts`, `src/render/fps.ts`, `src/sim/rng.ts`, `eslint.config.js`,
  `playwright.config.ts`, `.github/workflows/ci.yml`.
- Known issues / carry-over: none. `npm audit` flags dev-only advisories in `vite`/`vitest`'s dev server tooling
  (not exploitable in the built app, 0 vulnerabilities in production deps); left as-is for now, worth revisiting
  with a version bump in a later phase.
- Next: **Phase 1 — Map model, random generator, terrain rendering, camera**.

## 2026-09-24 — Phase 1: Map model, random generator, terrain rendering, camera
- `src/sim/state.ts`: `GameState { seed, rng, map }` factory (`createGameState`). Map generation
  consumes from the *same* `RngState` stored on the returned state, so later phases (city naming,
  industry dynamics, breakdowns, ...) continue the one seeded stream deterministically instead of
  spinning up a second RNG.
- `src/sim/map/`: `types.ts` (`GameMap` — `terrain`/`elevation` as `Uint8Array`, `riverFlow` as
  `Uint16Array`), `grid.ts` (index/bounds/8-direction helpers), `terrain.ts` (the 8 terrain kinds +
  id<->name), `noise.ts` (seeded fractal value noise — permutation table built from the game's RNG,
  never `Math.random`), `rivers.ts` (steepest-descent carving, stuck→lake), `generate.ts` (elevation
  → sea-level threshold by target land fraction → terrain classification → rivers), per SPEC §4.2
  steps 1–3. Balance numbers (map sizes, land-fraction targets, noise octaves/persistence per
  roughness, river source count/stuck limit, terrain classification thresholds) live in
  `src/data/mapGen.ts`, not in the generator logic.
- Tests (`tests/sim/map/*.test.ts`, 7 new): generator determinism (same seed → identical
  terrain/elevation/riverFlow arrays), land fraction within ±5% of target for all three water
  levels, no NaN/out-of-range elevations, only valid terrain ids, and — across 15 seeds — every
  8-connected river component touches a water tile (flood-fill check, independent of the carving
  algorithm's own bookkeeping).
- `src/render/`: `camera.ts` (world-px camera with `pan`/`zoomAt`/screen↔world conversion, clamped
  to map bounds, zoom 0.25–2×), `terrain.ts` (`TerrainRenderer`: chunk cache keyed by
  `zoom-bucket|overview|cx|cy`, 16×16-tile chunks, buckets 1×/0.5×/0.25×; full-detail chunks get
  hillshading from a NW light + elevation deltas, soft edge-blend gradients toward differing
  neighbor terrain, procedural speckle texture, and river lines with width from a per-tile
  `riverFlow` accumulator; the 0.25× bucket uses the simplified "overview" flat-fill style per SPEC
  §4.1; water shimmer highlight dots are redrawn every ~400ms directly on the main canvas, not
  cached), `hillshade.ts`, `palette.ts`, `color.ts`.
- Chunk rasterization is budgeted per frame (8 new full-detail chunks/frame; overview chunks are
  unbudgeted since they're just flat fills) so panning into unrendered territory can't stall a
  frame — new chunks fill in over the next couple of frames instead of blocking.
- Camera input (`src/ui/cameraInput.ts`): pointer-events-based one-finger/mouse drag pan, two-finger
  pinch zoom, wheel zoom (all focal-point-preserving), and simple exponential-decay pan inertia on
  release.
- `window.__game` (debug hook, `?debug=1`): `getState`/`getMap`/`getTicks`, `getAvgFrameMs` (full
  rAF interval) and `getAvgRenderMs` (CPU time inside the draw call only), `regenerate(options)`,
  and `camera.{getZoom,setZoom,pan,setCenter}`. Temporary dev-only controls
  (`src/ui/debugControls.ts`): map-size dropdown + "New seed" button, top-right, strings from
  `src/ui/strings.ts`.
- **Deviation** (noted in SPEC.md too): the "typed arrays for terrain/elevation/flags" wording in
  PLAN.md's checkbox is satisfied by `terrain`/`elevation`/`riverFlow`; there's no separate generic
  "flags" array yet since nothing needs one until Phase 3 (`cityId`/`industryId` will be added then).
- **E2E** (`e2e/map.spec.ts`): screenshots at zoom 1, 0.5, 0.25 for seed 12345, medium map →
  `docs/screenshots/phase-1-zoom-{1,0.5,0.25}.png`; a pan/zoom stress test on a Large
  (192×128) map that mixes cold chunk rasterization (camera jumps to unexplored areas) with
  cached-chunk panning/zooming for 1.8s and asserts the average render-call time stays under 16ms.
  Typical results in this container: ~2–4ms average (way under budget).
  - Found during this work: headless Chromium's `requestAnimationFrame` is vsync-capped at exactly
    16.667ms (1000/60) *even when completely idle* in this environment, so "average time between
    frames" can never usefully show < 16ms regardless of render cost — it was passing/failing on
    vsync noise, not on the renderer. Fixed by adding `FpsCounter.avgRenderMs`, which times only the
    `TerrainRenderer.draw()` call itself (`performance.now()` before/after in `main.ts`), and having
    the e2e test assert on that instead. `avgFrameMs` (full rAF interval) is kept for the on-screen
    debug overlay since it's still the right number for *displayed* fps.
- Known issues / carry-over: rivers render as fairly thin/angular polylines (steepest-descent path
  between tile centers) rather than a smoothed curve — acceptable per SPEC wording ("blue lines with
  width by flow") but could be prettied up later. No cities/industries yet (Phase 3). Overview style
  (zoom < 0.5×) currently still draws terrain (flat-filled) rather than switching to "cities as dots,
  track as lines" — correct per SPEC §4.1, since those features don't exist until later phases.
- Next: **Phase 2 — Android shell & APK pipeline**.

## 2026-09-24 — Review of Phase 1 (Opus)
- Checks and e2e pass. But the screenshots show broken rivers (triangles/stubs/1-tile lakes) and a hard pixel-grid
  terrain look. Root causes and fixes are written up as **Phase 1.1** in PLAN.md.
- CLAUDE.md: sessions must push to `main`, look at their screenshots, and not commit incidental screenshot churn.
- Next: **Phase 1.1 — Fix rivers and terrain visuals**, then Phase 2.

## 2026-09-24 — Phase 1.1: Fix rivers and terrain visuals
- **River routing rewrite** (`src/sim/map/flood.ts`, new): priority-flood depression filling
  (Barnes et al. 2014, "Priority-Flood + ε") over the continuous pre-quantization elevation field
  (`GameMap.elevationRaw: Float32Array`, new — kept alongside the existing quantized `elevation`).
  A binary min-heap floods outward from every water tile; each newly-reached land tile is raised to
  at least `parent + ε` and records which neighbor it was reached from (`parent: Int32Array`).
  Walking a tile's parent chain is now *always* strictly downhill and *always* reaches water within
  a bounded number of steps — no local minima, so `src/sim/map/rivers.ts` no longer needs (or has)
  any random-walk/stuck-escape logic. Each river just follows `floodParent` from a hills/mountains
  source until it hits water or an existing river tile (a confluence); paths shorter than 12 tiles
  are discarded, sources must be ≥ 10 tiles apart, tributary flow is added downstream through the
  river it joins. The explicit downstream pointer (`GameMap.riverNext: Int32Array`, new) plus
  `riverFlow` (kept) are exactly what the renderer needs to draw one smooth line per river instead
  of a mesh.
- **Lakes** (`src/sim/map/lakes.ts`, new): `fillLakes` finds depression regions the flood raised by
  more than a small noise threshold and turns regions ≥ 4 tiles into real lakes (never 1–3 tile
  puddles). A second pass, `removeTinyWaterBodies`, connected-components *all* water (including
  ordinary sea-level-threshold noise, independent of the depression logic) and reclaims any
  non-largest component smaller than 4 tiles back to land — needed because tiny water flecks can
  also come directly from the original elevation-threshold classification, not just from filled
  depressions.
- `generateMap` now returns `{ map, rivers, flood }` instead of a bare `GameMap` (`state.ts` just
  destructures `{ map }`); `rivers: RiverInfo[]` and `flood` (the exact `FloodFillResult` used for
  routing) exist mainly so tests can verify real generator output rather than reimplementing the
  algorithm.
- **Renderer rewrite** (`src/render/terrain.ts`, `hillshade.ts`, `palette.ts`):
  - Hillshading now samples the continuous `elevationRaw` field bilinearly
    (`hillshadeFactorAt`/`bilinearElevation`) at a 4×4 sub-tile grid per land tile instead of one
    flat shade from the quantized field, with shading strength raised ~4.5× (0.12 → 0.55) — visibly
    stronger, continuous-looking shading instead of a near-flat tint.
  - Terrain-edge blending replaced straight linear-gradient strips with 4 jittered, randomly-sized
    radial "blob" washes per differing edge, plus a new diagonal-corner blend for the
    checkerboard-corner case cardinal-edge blending can't reach (a coastline poking in/out only at
    a corner) — reads as organic, mottled borders instead of stair-steps.
  - Forest: lighter "clearing" base color (`TERRAIN_COLORS.forest` lightened) with 2–4 explicit
    tree-canopy circles (dark green + an offset darker shadow) instead of one flat dark tile.
  - Hills: 2–3 soft radial-gradient "bump" highlights (light NW, dark SE-ish falloff).
  - Mountains: 1–2 small peak triangles per tile with a lighter NW-facing side and darker SE-facing
    side; the old "solid white tile at elevation 9" snowcap is gone — snow is now a small triangular
    cap only at the very top of a peak, only at elevation 9.
  - Rivers: `drawRivers` now walks `riverNext` (downstream) and a per-tile reverse lookup for
    `riverPrev` (any neighbor whose `riverNext` points here — confluences can have more than one),
    drawing one quadratic curve per incoming edge (`moveTo(midpoint(prev, tile))` →
    `quadraticCurveTo(tile center, midpoint(tile, next))`), instead of a straight segment to every
    river/water neighbor. Line width scales with `riverFlow` (2–6px at zoom 1). Since the curve
    always ends at the *midpoint* between a river tile and its downstream water neighbor, a river
    mouth naturally lands right on the coastline instead of running into open water.
- **Perf**: raised the sub-tile shading and extra draw calls per tile cost cold-chunk rasterization
  noticeably more, so the chunk-render-per-frame budget (`src/render/terrain.ts`) was lowered from
  8 to 4 new full-detail chunks/frame to keep any single frame's spike bounded. Re-ran the Large-map
  pan/zoom e2e perf test (mixes cold-chunk creation via camera jumps with steady-state panning)
  repeatedly: average render time landed consistently at 5.5–8.5ms, comfortably under the 16ms
  budget (previously ~2–4ms with the old cheaper renderer, so there's real headroom left).
- **Tests** (`tests/sim/map/flood.test.ts` new, `rivers.test.ts` rewritten, `generate.test.ts`
  updated for the new `{map, rivers, flood}` return shape): flood-fill correctness on a small
  hand-built "enclosed pit" grid (pit gets raised above its rim, parent chains reach water with no
  cycles, filled elevation strictly decreases toward the parent); across 15 seeds — every river
  tile's `riverNext` chain reaches water with no cycles within `width+height` steps; the *exact*
  `flood.filled` field used for routing is non-increasing along every river chain; non-river tiles
  have `riverNext === -1`; no water body smaller than 4 tiles other than the sea; every generated
  map places ≥ 4 rivers, each ≥ 12 tiles long. All 18 unit tests pass (was 12 before this phase).
- **Screenshots — actually looked at them** (per the updated CLAUDE.md workflow rule):
  regenerated `docs/screenshots/phase-1-zoom-{1,0.5,0.25}.png` (seed 12345, same as Phase 1) and
  added `docs/screenshots/phase-1.1-closeup-zoom2.png` (new e2e test using a new debug helper,
  `window.__game.findRiverMouth()`, which scans the map for a river tile whose `riverNext` is a
  water tile and returns the world-space midpoint between them, so the closeup test doesn't have to
  guess coordinates). What they show:
  - The closeup: a single smooth blue curve running through light-green ground dotted with
    individual dark-green tree-canopy circles, bending once, and ending cleanly at a soft-edged
    coastline — no triangles, no stray stubs, no mesh. This is the headline fix.
  - zoom 1/0.5: forests read as clusters of distinct trees, not a flat dark blob; visible soft
    mottling at forest/plain and plain/desert borders instead of hard squares; a river bends
    naturally along the terrain into a small lake.
  - A separate manual check on a `mountainous`-roughness map (not committed, reviewed and discarded)
    confirmed mountain tiles show grey/tan peak triangles with a lighter NW face, small white
    snowcap triangles only at elevation 9 (not full white tiles), and hills show soft directional
    bump shading.
  - Overview style (zoom 0.25) is unchanged from Phase 1 (flat-filled, no rivers drawn) — out of
    scope for this fix, called out already as correct-for-now in the Phase 1 entry.
- Known issues / carry-over: hillshading is visibly stronger and continuous now, but on mostly-flat
  `normal`/`flat` roughness maps the effect is subtle simply because there isn't much slope to shade
  — this reads as correct, not a bug. The coastline "marching squares" ask was implemented as a
  simplified per-corner radial blend (handles the common diagonal-corner case) rather than a full
  marching-squares contour; revisit if coastlines still look too blocky once cities/track are on
  screen and there's more to compare against. Overview-zoom rivers still not drawn (see above).
- Next: **Phase 2 — Android shell & APK pipeline**.

## 2026-09-24 — Carry-over fix: chunk-corner terrain artifact (review of Phase 1.1)
- **Root cause found**: `TerrainRenderer.drawCornerBlend` (`src/render/terrain.ts`) drew its
  coastline diagonal-corner blend gradient at `(corner.cx, corner.cy)` — `0` or `size` — without
  adding the tile's own pixel offset (`px, py`) within the chunk canvas. Since every tile in a
  chunk shares the same `size`, every tile whose diagonal-corner condition fired (i.e. every real
  coastline corner anywhere in that 16×16 chunk) had its blend blob drawn at one of only 4 fixed
  absolute positions — always right next to the chunk canvas's own `(0,0)` corner — instead of at
  that tile's actual position. That's exactly the "faint blue fragments at a grid every 16 tiles"
  the review flagged: real coastline corners scattered throughout each chunk all got misdrawn onto
  that chunk's own top-left tiles, regardless of what terrain was actually there (confirmed by
  dumping the seed-12345 map's terrain around one flagged screen position — pure `plain` for 2+
  tiles in every direction, with the nearest real water 3+ tiles away and inside the same chunk).
- **Fix**: offset the gradient/arc center by the tile's own `(px, py)` (one-line change × 2 call
  sites inside the function). No other logic changed.
- **Verified**: regenerated `docs/screenshots/phase-1-zoom-{1,0.5,0.25}.png` and
  `phase-1.1-closeup-zoom2.png` (same seed 12345) and looked at them — the periodic dot grid is
  gone; also wrote a throwaway Python connected-components scan over the pixels to confirm no more
  small isolated blue clusters at the old periodic (256px-at-zoom-0.5 = 16-tile) spacing. `npm run
  check` and `npm run e2e` still pass (this is a render-only fix; no sim tests touch it).

## 2026-09-24 — Phase 2: Android shell & APK pipeline
- **Capacitor**: added `@capacitor/core`, `@capacitor/android`, `@capacitor/app` (regular deps) and
  `@capacitor/cli` (dev dep) per PLAN — no other runtime dependency added. `capacitor.config.ts`
  (appId `com.railroads.game`, appName "Railroads", `webDir: "dist"`). Ran `npm run build` then
  `npx cap add android` to generate `android/`; its own nested `.gitignore` (from the Capacitor CLI)
  already excludes the synced web assets, generated `capacitor.config.json`/`capacitor.plugins.json`
  and `res/xml/config.xml`, so those aren't committed — only the actual native project source is.
  Deleted the default template's `ExampleInstrumentedTest.java`/`ExampleUnitTest.java` (wrong
  package `com.getcapacitor.myapp`, asserted a package name that isn't ours; dead weight, not part
  of our app).
- **Landscape lock**: `android:screenOrientation="landscape"` on `MainActivity` in
  `AndroidManifest.xml` (native-level lock, no extra plugin needed).
- **Fullscreen/immersive + keep screen on**: `MainActivity.java` now hides the system bars
  (`WindowCompat`/`WindowInsetsControllerCompat`, swipe-to-reveal behavior) and sets
  `FLAG_KEEP_SCREEN_ON`, both via plain AndroidX APIs already pulled in by Capacitor — no new
  dependency, so "keep screen on" wasn't worth skipping like PLAN allowed.
- **Safe-area insets**: `viewport-fit=cover` added to the viewport meta tag; `#ui` gets
  `padding: env(safe-area-inset-*)` (SPEC §10) so panels built in later phases automatically clear
  notches/cutouts/gesture-nav areas without each one handling it individually.
- **Android back button**: `src/ui/backButton.ts` — `App.addListener("backButton", ...)` with a
  small push/pop handler stack. Empty stack (true today, since no panels exist yet) →
  `window.confirm(strings.app.exitGameConfirm)` ("Exit game?") → `App.exitApp()` if confirmed.
  Later phases' panels (Station, Train, City, ...) call `pushBackHandler(closeThisPanel)` on open
  and invoke the returned unregister function on close — the back button then closes the top panel
  instead of prompting to exit, per SPEC. Wired up once in `main.ts` (`initBackButton()`), works
  as a no-op on plain web (Capacitor's web shim for `@capacitor/app` just never fires
  `backButton`), so it doesn't affect desktop/e2e behavior.
- **App icon**: `tools/icon/generate.mjs` — a Node script that draws a simple locomotive silhouette
  (boiler, cab, smokestack, headlamp, cowcatcher, three wheels; dark steel-blue background `#1E2A38`,
  gold `#F2B544`/`#C8912A` per SPEC's `ui-accent`) with Canvas 2D inside the pre-installed headless
  Chromium (via `@playwright/test`'s `chromium` launcher — already a dev dependency, so no new one
  needed for image generation) and writes `ic_launcher{,_round}.png` at all 5 legacy mipmap
  densities plus `ic_launcher_foreground.png` at the larger adaptive-icon safe-zone sizes, straight
  into `android/app/src/main/res/mipmap-*/`. Looked at the generated icon (both square and the
  round variant) at 3× — reads clearly as a locomotive down to 48×48. Re-run any time with
  `node tools/icon/generate.mjs`.
- **Splash**: replaced the default Capacitor-logo `splash.png` assets (which `cap add` generates
  pointing at Capacitor's own blue-X branding) with a solid color instead — deleted all the
  generated `splash.png` files and pointed `AppTheme.NoActionBarLaunch`'s background at a new
  `@color/splashBackground` (`android/app/src/main/res/values/colors.xml`, same `#1E2A38` as the
  icon background) rather than committing an image asset for this.
- **`android.yml`** (GitHub Actions): triggers on push to any branch + `workflow_dispatch`.
  `setup-node` (22, matching `ci.yml`) → `setup-java` (Temurin **21**, `cache: gradle` — see below
  for why 21 and not the originally-requested 17) → `npm ci` → `npm run build` → `npx cap sync
  android` → `chmod +x android/gradlew` → `./gradlew assembleDebug --stacktrace` (working directory
  `android`) → `actions/upload-artifact@v4` uploading `android/app/build/outputs/apk/debug/app-debug.apk`
  as `app-debug`, 14-day retention.
- **This session has GitHub API access (unusual for this kind of task — the original instructions
  assumed it wouldn't), so the Actions run was actually watched and iterated on instead of just
  described** — two real failures found and fixed this way, each confirmed from the actual job log
  rather than guessed:
  1. **`android-actions/setup-android@v3` is broken.** First run failed in ~25s, before `npm ci`
     even started: the action ran `sdkmanager tools`, which errored `Failed to find package 'tools'`
     (exit code 1) and hard-failed. That package was removed from the SDK repository years ago;
     the action is unmaintained and still tries to install it. Checked GitHub's own
     `actions/runner-images` docs for `ubuntu-latest`: it already ships `ANDROID_HOME`/
     `ANDROID_SDK_ROOT` pre-set with build-tools 34.0.0–37.0.0 and platforms 34–37 preinstalled —
     already covers this project's `compileSdkVersion`/`targetSdkVersion` 36 with nothing extra to
     install. Fix: deleted the `setup-android` step entirely (added a cheap
     `ls "$ANDROID_HOME"/{platforms,build-tools}` diagnostic step in its place, so a future
     SDK-related failure is easy to read from the log instead of a mystery).
  2. **JDK 17 (as originally specified) can't compile this project.** Second run got past SDK setup
     and `cap sync`, then failed inside `./gradlew assembleDebug` itself: `error: invalid source
     release: 21`. `android/app/capacitor.build.gradle` — auto-generated by `@capacitor/android`
     8.5.2 on `cap sync`/`cap update`, "DO NOT EDIT" — pins `sourceCompatibility`/
     `targetCompatibility` to `JavaVersion.VERSION_21`, which a JDK 17 `javac` simply can't target
     (you need a compiler at least as new as the release you're compiling to). Since that file
     regenerates on every sync, patching it directly wouldn't stick; the actual fix is the
     workflow's JDK version. Bumped `setup-java` from 17 to 21 — a deliberate, confirmed-necessary
     deviation from CLAUDE.md's session instructions (which said 17), since 17 doesn't work with
     this Capacitor version's generated build config.
  3. **Confirmed green with a real artifact**, not just "workflow file is valid": after the JDK 21
     fix, `android.yml` run [#3](https://github.com/DavidCufer/railroads/actions/runs/36029558358)
     completed with `conclusion: success` and produced an `app-debug` artifact — a real
     3,677,931-byte APK (checked via the Actions API's artifact listing, not assumed). `ci.yml` is
     green on this same final commit too. So unlike the usual "can't verify from this session"
     situation, Phase 2's APK pipeline is confirmed actually working end-to-end, not just
     plausible-looking YAML.
- `npm run check` and `npm run e2e` both green (web app itself is unchanged by this phase besides
  the safe-area CSS, the back-button wiring, and the Phase-1.1-carry-over terrain fix above — no
  screenshot changes from Phase 2 itself; the four screenshot diffs in this commit are only from
  the carry-over fix).
- Known issues / carry-over: adaptive-icon foreground safe-zone padding is approximate (scaled by
  eye, not to the exact 66/108 Android spec), fine for a placeholder icon but worth revisiting if
  it ever looks clipped on a real device/launcher. No Android emulator available anywhere in this
  environment, so the landscape lock, immersive mode, keep-screen-on, back button, and the icon/
  splash as they actually render on-device are all unverified beyond code review — worth an actual
  phone/emulator check whenever one's available. `@capacitor/splash-screen` (a proper native splash
  plugin with a controllable duration/fade) was deliberately not added since it's not in PLAN's
  named dependency list; the current "splash" is just the instant static pre-WebView background
  color standard to any Android launch theme.
- Next: **Phase 3 — Cities and industries on the map**.

## 2026-09-24 — Phase 3: Cities and industries on the map
- **Data tables** (`src/data/`): `cargo.ts` (13 cargo types, SPEC §8.1: base rate, decayDays,
  color, car type/cost, era), `industries.ts` (12 industry types, SPEC §8.2: placement rule,
  produces/consumes, acceptance points, era), `cities.ts` (4 tiers' tile/population ranges, min
  spacing, city-count/resource-density tables, name-generator syllable lists), `finance.ts`
  (starting cash + difficulty multipliers, SPEC §9.1/§9.6 — used for the top bar's cash
  placeholder, not wired to a real ledger yet).
- **Calendar** (`src/sim/time.ts`): simplified 12×30-day year (see Deviations), `calendarFromTicks`
  derives year/month/day/hour from `GameState.ticks`. `GameState` gained `ticks`, `startYear`,
  `cities`, `industries`.
- **Sim tick rate** (`src/render/loop.ts`): was a fixed 20 Hz regardless of game speed; now
  `GameLoop` has a real speed control (`GameSpeed` = 0/1/2/4/8) and ticks at `24 × speed` Hz per
  SPEC §3 ("1 in-game day ≈ 1 s at 1×" = 24 ticks/s, since 1 tick = 1 hour). Pausing drops the
  accumulator so unpausing doesn't burst-catch-up; the per-frame tick cap halves after a frame ran
  over the 12 ms budget (§3's "drop to fewer if frame time > 12 ms").
- **City placement** (`src/sim/economy/cities.ts`, `names.ts`): scores candidate sites (flat
  terrain, near river/coast) over a 4×4-block grid for performance, greedily selects sites ≥
  `CITY_MIN_SPACING` (8 tiles) apart, assigns tiers by rank (1–2 "city", ~20% "town", rest
  "village" — SPEC §4.2 step 4), grows each footprint outward from its anchor tile to a random
  tile-count within its tier's range, and names each with a syllable-table generator
  (`generateCityNames`, dedupes). `GameMap` gained `cityId`/`industryId: Int16Array` (-1 = none).
- **Industry placement** (`src/sim/economy/industries.ts`): raw producers (coal/iron mine, logging
  camp, farm, ranch, oil well) placed on their allowed terrain with same-type spacing; processors
  (steel mill, sawmill, food plant, factory, refinery) placed within a radius of cities, with a
  per-tier slot count (village 0 → metropolis 4); ports placed on the coastline of coastal
  town-tier-or-above cities. Everything is gated by `era <= startYear` at generation time (an
  industry whose era is later just isn't placed yet — actual year-gated *appearance* over time is
  Phase 8's job). Industry `id`s are assigned in placement order so they always match their index
  in the returned/stored array (`map.industryId[tile] === industries[id].id === id`).
- **Playability check** (`src/sim/economy/playability.ts`, wired into `generateMap`): flood-fills
  land into connected components and counts town/city pairs within 15–30 tiles on the same
  landmass (SPEC §4.2 step 6); if fewer than 3, one deterministic retry with a bumped city-count
  target (same RNG stream, so still fully seed-deterministic).
- **Rendering**:
  - `src/render/cities.ts`: roof-cluster decoration baked into the terrain chunk cache (like the
    existing forest/hill/mountain decorations) — 3–6 roofs per city tile depending on tier, red/
    brown/grey cycling, drop shadows, occasional taller "block" with a lit wall face for city/
    metropolis tiers.
  - `src/render/industries.ts`: one hand-drawn icon function per industry type (headframe for
    mines, trees + circular saw for logging, silo + field rows for farms, a fenced corral for
    ranches, a nodding-donkey pumpjack for oil wells, chimneyed buildings with smoke for steel
    mill/factory, a saw-bladed building for sawmill, tanks for food plant, linked tanks + flare
    stack for refinery, a pier + crane for ports) — all baked into the terrain chunk cache the same
    way.
  - `src/render/labels.ts`: city name labels drawn dynamically every frame (not baked into the
    zoom-bucketed chunk cache, so text stays crisp at any zoom instead of a fixed-resolution
    bitmap), dark-halo stroke + light fill, font size/weight scaled by tier. At overview zoom
    (< 0.5×, where terrain chunks are a flat fill with no decoration baked in) cities also get a
    small tier-colored dot marker and village labels are hidden to reduce clutter (SPEC §4.1:
    "cities as dots with names" at low zoom).
  - `TerrainRenderer` now takes `cities`/`industries` alongside the map and checks
    `map.cityId`/`map.industryId` per tile before falling back to the old forest/hill/etc.
    decoration.
- **UI framework** (`src/ui/`): `h.ts` (tiny DOM-builder per SPEC §1), `panel.ts` (slide-in-from-
  right panel, ≤ 45% width via CSS `min(45%, 420px)`, registers/unregisters with the Android back
  button on open/close), `toast.ts` (top-center, non-blocking, auto-dismiss — not used by any
  event yet, wired up for Phase 8's news system), `toolbar.ts` (left build toolbar per SPEC §10.1;
  only "Info" is enabled this phase, the rest render disabled so the layout matches the final SPEC
  even though Track/Station/etc. don't exist until Phase 4/5), `topBar.ts` (cash placeholder, live
  date from the calendar, ⏸/1×/2×/4×/8× speed buttons wired straight to `GameLoop.setSpeed`, a
  menu button that's currently inert — Phase 10/11 give it somewhere to go), `infoPanels.ts` (city
  panel: tier/population/supplies/accepts as cargo-colored chips computed from the SPEC §8.3
  formulas — no station coverage exists yet so these are "at full coverage" numbers, not live
  stats; industry panel: produces/consumes chips), `format.ts` (money/date/population formatting).
  All new strings added to `strings.ts` per CLAUDE.md.
- **Tap detection** (`src/ui/cameraInput.ts`): a pointer sequence that never moves more than 8px
  and resolves within 500ms now fires `onTap(x, y)` in addition to the existing pan/pinch/wheel
  handling; `main.ts` converts the tap to a tile via `camera.screenToWorld` and opens the city or
  industry panel if that tile has one.
- **Tests**: `tests/sim/economy/cities.test.ts` (min spacing across 5 seeds, unique names/ids,
  footprint within tier's max tile count, determinism, `map.cityId` agreement) and
  `industries.test.ts` (raw producers only on allowed terrain across 5 seeds, never on a city tile,
  era gating — confirmed oil/refinery absent when `startYear` is 1850 — id/index agreement,
  determinism). 9 new unit tests; 27 total, all passing.
- **E2E** (`e2e/cities.spec.ts`): tap a city → panel title equals its name (+ screenshot); tap an
  industry → panel visible (+ screenshot); speed buttons actually change `GameLoop`'s speed and the
  calendar advances at 8× but not while paused; an overview (zoom 0.25) and a city-closeup (zoom 2)
  screenshot for visual review. Extracted the `window.__game` debug-hook typing shared by
  `map.spec.ts` and the new file into `e2e/gameWindow.ts` (two separate `declare global` blocks for
  the same `Window.__game` property don't typecheck together).
- **Screenshots — looked at them**: `phase-3-overview.png` (zoom 0.25) shows small tier-colored
  dots with readable dark-halo labels for towns/cities (villages correctly hidden at this zoom),
  smooth coastlines, no rendering artifacts. `phase-3-city-closeup.png` (zoom 2, on "Summerfordside")
  shows a dense, organic-looking cluster of red/brown/grey roofs with drop shadows around the city
  label, a mine headframe and a chimneyed steel-mill-style building nearby, and a small pier
  reaching into the water on the coastline — reads clearly as a town from top-down, not colored
  squares. `phase-3-city-panel.png`/`phase-3-industry-panel.png` show the slide-in panel with
  readable cargo chips (added a luminance-based black/white text-color pick per chip so light cargo
  colors like Passengers' white don't get white-on-white text). Also spot-checked every industry
  icon type individually (throwaway script, not committed): the original oil-well icon (a plain
  derrick, too similar to the mine headframe) was redrawn as a nodding-donkey pumpjack (A-frame +
  tilted beam + counterweight + horsehead + wellhead) before finishing — now visually distinct.
  Also re-looked at `phase-0-smoke.png` and `phase-1-*.png`/`phase-1.1-closeup-zoom2.png`: the same
  e2e specs that own them regenerate them against the unchanged default seed, and since that map
  now legitimately has cities/industries and a top bar/toolbar (this phase's actual output), those
  screenshots changed too — kept the regenerated versions rather than reverting, since the diff
  reflects real new behavior, not incidental churn.
- Known issues / carry-over: cities/industries are placement + info-only, as scoped — no economy
  simulation reads `produces`/`consumes`/`acceptancePoints` yet (Phase 7). The Civic Investment
  lever, city growth, and industry dynamics (SPEC §8.2/§8.3) are Phase 9. The ☰ menu button and
  disabled toolbar buttons are inert placeholders matching the SPEC §10.1 layout ahead of the
  phases that implement them. City-count/resource-density generator options aren't exposed in the
  debug UI yet (noted in Deviations) — Phase 10's new-game screen is the intended home. Toasts are
  wired up but nothing triggers one yet (first real use is Phase 4+ build validation / Phase 8
  news).

## 2026-09-24 — Phase 4: Track building

- **Track graph** (`src/sim/track/graph.ts`, `types.ts`): `TrackGraph` — a `Map<edgeKey, TrackEdge>`
  plus a `Map<tile, Set<neighborTile>>` adjacency index, giving O(1) `hasEdge`/`getEdge` and O(1)
  (amortized) `addEdge`/`removeEdge`. `edgeKey(a,b)` canonicalizes on `a < b` so either argument
  order finds the same edge. `directionIndex`/`directionSteps` convert a grid step to a `DIRS8`
  index and measure angular distance between two of them in 45° units.
- **Bridge model (SPEC deviation, read carefully)**: §5.1 describes edges as connecting *adjacent*
  tile centers, but §5.3's bridge pricing ("per water tile, max 3/8 tiles") only makes sense for a
  single structure spanning several tiles at once. I implemented bridges as a documented exception:
  a bridge edge connects the land tile on each side of a river/water obstacle *directly* (Chebyshev
  distance > 1, but still one of the 8 compass directions), and the water/river tiles it passes
  over (`edge.bridgeSpan`) are never graph nodes themselves. This matches the per-tile pricing
  exactly, keeps the pathfinder's state space to land tiles only, and lets one continuous visual
  structure be drawn and bulldozed as a unit — trying to model a bridge as a chain of tile-by-tile
  edges through non-buildable water/river nodes didn't fit any of those. A river is generated one
  tile wide, so a "single-tile river crossing" bridge is just the span-1 case of the same mechanism
  as a multi-tile water bridge, priced from the flat `riverCost` instead of `waterCostPerTile × N`.
- **Cost calculator** (`src/sim/track/cost.ts`; balance numbers in `src/data/track.ts`):
  `normalEdgeCost` = base × max(terrain multiplier of the two tiles) × diagonal factor (1.41) +
  grade surcharge (flat, not terrain/diagonal-scaled) — all × era inflation × difficulty
  build-cost multiplier. `eraInflation(year)` moved to `src/data/finance.ts` (§9.5) since Phase 4
  needed it too. `bridgeCost`/`validBridgeTypes`/`cheapestBridgeType` implement the era-gated,
  span-capped bridge table; `evaluatePath` walks a node path and, for every non-adjacent
  ("bridge") step, classifies it river-vs-water from the spanned tiles' terrain and prices it,
  auto-picking the cheapest legal type unless a `preferredBridgeType` (the confirm bar's
  tap-to-cycle) is itself legal for that specific crossing. Double-track upgrade cost is derived
  from the *fresh-build* multiplier rather than hand-picked: 1.6× total → 0.6× upgrade delta for
  plain track, 1.8× total → 0.8× delta over a bridge (§5.3 states both fresh-build multipliers;
  the delta is computed off them, not restated separately) — and it's charged as a fraction of the
  edge's *originally recorded* build cost, not recomputed at the current (possibly later, more
  inflated) year, since re-pricing terrain/grade at upgrade time isn't specified and the simpler
  reading avoids surprise price hikes on old track.
- **A\* pathfinder** (`src/sim/track/pathfind.ts`): search state is `(tile, incoming direction)`,
  not just `tile`, so a turn penalty (2,500 × 45°-steps, comparable to the cheapest per-tile track
  cost) can bias the search toward straight runs without blocking a turn that's actually the only
  way through (SPEC §5.2: "prefer straight lines and cheaper terrain, with a penalty for direction
  changes"). Neighbor generation scans past water/river tiles in a straight compass direction (up
  to 8, steel's max span) looking for a landing tile, so a bridge is just another kind of edge to
  the search. Bounded to a padded bounding box around start/goal and capped at 20k expansions so a
  drag toward an unreachable corner can't hang a frame. Double mode reuses the same search with an
  `existingTrackOnly` option that restricts neighbors to the graph's existing non-double edges,
  so it "follows the rails" instead of inventing new ones. Bulldoze mode doesn't pathfind at all —
  it just traces the raw tiles the finger passed over (`main.ts`'s `bresenhamTiles`), since you're
  erasing what's already there, not routing.
- **Turn rule** (`src/sim/track/turn.ts`): `turnAllowed(dirIn, dirOut)` is the core ≤45° check;
  `canTraverse` applies it to three tile positions; `hasSharpJunction(graph, tile)` checks every
  pair of a node's edges and flags the node if any pair meets at >45° (steps ≤ 2) — used by the
  renderer for the small red marker SPEC §5.1 calls for ("allowed to exist... shown with a small
  red marker in the build preview"), and separately by the ghost-path renderer for sharp turns in
  the *drag* itself before anything is built.
- **`src/sim/commands.ts`** (didn't exist before this phase): `buildTrack`, `upgradeTrack`,
  `bulldoze`, each validating and returning `{ok:true, cost} | {ok:false, reason}`. `reason` is a
  code (`"cant-afford"`, `"blocked"`, ...), not a string — `eslint.config.js` already forbids
  `src/sim/**` from importing `src/ui/**` (kept a real ESLint error, not just a style nit), so the
  UI maps the code to a string via a new `strings.build.reasons` table. Re-dragging over track that
  already exists is free, not an error (`toBuild` filters out edges `hasEdge` already returns true
  for), which makes the drag UX forgiving. Bulldoze collects every edge incident to *any* tile the
  drag passed over (not just edges between literally-consecutive dragged tiles), because a bridge's
  endpoints are graph nodes but its spanned tiles aren't — a raw tile trace across a bridge would
  otherwise never match the actual (non-adjacent) edge. Exported `compute*Plan` pure/non-mutating
  twins of each command so the UI can price the live drag preview without a mutate-then-undo dance.
- **`GameState`** gained `cash` (seeded from `DIFFICULTY[difficulty].startingCash`, §9.1),
  `difficulty` (defaults `"normal"`, no picker yet — Phase 10/11), and `trackGraph`. This phase
  only needed a running balance, not the full per-category ledger (§9.2) — that's explicitly
  Phase 7's job.
- **Track rendering** (`src/render/track.ts`): `TrackRenderer`, cached per (chunk, zoom-bucket)
  canvas exactly like `TerrainRenderer`, redrawn only when `invalidateTiles` is called after a
  build/upgrade/bulldoze (chunk cache keys for every bucket touching the changed tiles are simply
  dropped). Ties + double rails only at the zoom-1 bucket; a single line at 0.5/0.25. Bridges are
  drawn as one continuous deck + cross-tie trestle marks in the type's color (wood trestle brown,
  stone arches grey, steel truss dark blue-grey, per §10.3) directly between the two shore tiles'
  centers, regardless of the water/river tiles' own rendering underneath. A small dark dot marks
  any node with ≥3 edges (a junction); a small red dot (reusing `hasSharpJunction`) marks one where
  a through-route isn't possible.
- **Build preview** (`src/render/buildPreview.ts`): draws the live drag path green (buildable and
  affordable) or red (blocked or over budget — SPEC groups both under "red"), plus small red dots
  at any vertex where the *drag path itself* turns sharper than 45°, independent of the
  already-built graph's own junction markers.
- **Build HUD** (`src/ui/buildHud.ts`): a floating cost-label `<div>` that follows the drag,
  offset up and away from the touch point (clamped to stay on-screen and below the top bar) so a
  thumb never covers the number it's reading; a confirm bar (`✓ Build($X)` / `✕`) on release
  unless Quick build is on, with a bridge-type chip that's tappable to cycle
  `validBridgeTypes` for that crossing (re-prices live).
- **Touch/mouse input** (`src/ui/cameraInput.ts`): added a `setBuildMode(active, handlers)` mode —
  in a build mode, one finger (or, on desktop, a *left*-button drag; right/middle still pans,
  per §5.2) drives `onStart`/`onMove`/`onEnd(committed)` instead of panning, and a second finger
  arriving mid-drag cancels the build (`onEnd(false)`) and falls back to two-finger pinch/pan.
  Two-finger *pan* (translate, not just the existing pinch-zoom) is new and only active in a build
  mode, matching §5.2 exactly ("pan with one finger when not in a build mode; in a build mode, pan
  with two fingers. Pinch zooms in all modes").
- **Toolbar / modes** (`src/ui/toolbar.ts`, `main.ts`): Track/Double/Bulldoze/Info are live;
  Electrify (era-gated) and Station stay disabled (Phase 8/5). Quick build is a small standalone
  toggle bottom-right, not inside the vertical toolbar — with Track/Double/Bulldoze added, the
  toolbar is already close to filling a 360px-tall phone viewport's height (see Deviations), and a
  7th 44px item would overflow it. Persisted in `localStorage` per §13 even though the full
  Settings *screen* is Phase 11.
- **Tests** (`tests/sim/track/*.test.ts`, `tests/sim/commands.test.ts`, 51 + 11 new): table-driven
  `normalEdgeCost` over every terrain multiplier, diagonal factor, grade surcharge, era inflation,
  difficulty multiplier; bridge type/era/span-limit selection (`validBridgeTypes`); `evaluatePath`
  bridging, preferred-type fallback, and the "blocked, no legal bridge" case; `TrackGraph` add/
  remove/query; `directionIndex`/`directionSteps`; `turnAllowed`/`canTraverse`/`hasSharpJunction`
  (both the "valid" and "sharp" geometric cases); `findBuildPath` — straight path, river bridge
  jump, blocked/unblocked water span by era, prefers a cheap land detour over an expensive bridge,
  Double-mode restricted to existing single track (including "an already-double edge isn't
  offered again"); `buildTrack`/`upgradeTrack`/`bulldoze` round-trips (cash delta, edges
  added/removed/doubled), re-build-is-free, can't-afford, blocked-by-water-without-a-bridge, and
  bulldoze finding a bridge via its shore tiles rather than a literal consecutive-pair scan. Used
  a small synthetic-map helper (`tests/sim/track/helpers.ts`) instead of the random generator, for
  exact control over terrain/water layout.
- **E2E** (`e2e/track.spec.ts`, all screenshots at the 800×360 CSS px phone viewport per this
  session's brief): straight + diagonal + a 90°-branch junction (with its red sharp-turn marker)
  built by simulated drags, then the same run upgraded to double via Double mode; a live drag with
  the cost label visible mid-gesture; a water crossing where the confirm bar's auto-picked type is
  asserted (`stone`, the cheapest legal one for that span); all three bridge types built at the
  *same* river crossing in turn (cycling the confirm bar's bridge chip, bulldozing between each) to
  show wood/stone/steel side by side. Crossing tile coordinates for seed 12345 were found with a
  throwaway search script and *verified against the real `findBuildPath`* (not just "is there
  water in a line") — an earlier draft picked crossings the pathfinder just routed around via a
  cheaper diagonal land detour, which is correct pathfinding behavior but produced a screenshot
  with no bridge in it at all.
- **Screenshots — looked at them**: `phase-4-straight.png` and `phase-4-diagonal.png` show clean
  rails-with-ties on plain ground, ties evenly spaced along the diagonal too, no seams at the bend.
  `phase-4-junction.png` shows a clear red dot exactly at the T where a branch leaves the mainline
  at 90°. `phase-4-double-track.png` looked identical to single track at thumbnail size — cropped
  and 4×-zoomed it and confirmed two full parallel rail-and-tie sets with a visible gap, just subtle
  at this zoom, matching real double-track. `phase-4-drag-preview.png` shows the green ghost line
  with the cost pill offset above-left of the path, never under where a thumb would be.
  `phase-4-bridge-wood/stone/steel.png` show the same diagonal river crossing in brown-trestle,
  grey-arch, and dark-blue-grey-truss respectively — clearly distinct at a glance.
  `phase-4-water-bridge.png` shows a 3-tile stone bridge across a lake with the shimmer dots still
  visible on the water either side. First attempt at both bridge screenshots accidentally landed
  the crossing tiles inside an industry's footprint (the mine headframe icon was easy to mistake
  for the bridge itself in the thumbnail) — re-searched for crossings with no city/industry tile
  within 4 tiles before re-shooting.
- **Carry-overs from the Phase 3 review**:
  - Debug overlay/controls no longer overlap the top bar or a panel's close button. The `?debug=1`
    fps/tick text moved off the canvas onto a small DOM `#debug-overlay` (was drawn with
    `ctx.fillText` at a fixed canvas position, which is what let the toolbar visually sit on top of
    it) anchored bottom-left; the seed/size dev controls moved to `left:68px` (just past the
    toolbar's ~56px-wide column) so neither can overlap the toolbar *or* each other regardless of
    viewport height. Along the way, fixing the toolbar's own vertical centering (`top:50%` of the
    *full* viewport, which let a tall toolbar creep up under the 44px top bar on a short landscape
    phone) turned out to be necessary too — now centered within `top:44px; bottom:0` instead.
  - Cities: `TerrainRenderer` precomputes each city's footprint centroid once per `setMap` and
    passes a 0–1 "closeness to center" value into `drawCityRoofs`, which now interpolates roof
    count (and tall-block chance) between a sparse edge value and a dense core value per tier, and
    occasionally draws a short light street line on tiles away from the core. Re-shot
    `phase-3-city-closeup.png` (regenerated by Phase 3's own e2e spec, which this phase's toolbar/
    date changes also touch — see below) — now reads as a town with a denser middle and a couple
    of visible streets, not scattered dots. Footprint *tile counts* were already tier-ranged
    correctly (village 1–4 tiles) in Phase 3's generator; this was purely a rendering fix.
  - `DEFAULT_START_YEAR`: 1900 → 1830 (`src/data/mapGen.ts`), matching SPEC §4.4 (1830 listed
    first among the random-map year choices) and every real-world region's default start (§4.3).
- **Regenerated Phase 0/1/3 screenshots**: same as the precedent set in Phase 3's own entry —
  `phase-0-smoke.png`, `phase-1-*.png`, and all `phase-3-*.png` are regenerated by their owning
  e2e specs against the unchanged seed 12345, and now legitimately show this phase's toolbar
  (Track/Double/Bulldoze enabled), the 1830 default date, and the denser city rendering. Kept the
  regenerated versions rather than reverting, per CLAUDE.md's rule ("commit screenshot changes
  only for the phase that owns them") — the diffs reflect real new behavior these Phase 3 specs
  happen to also capture, not incidental churn.
- Known issues / deviations:
  - The bridge model (edges spanning multiple tiles) is a deliberate reading of an ambiguity
    between §5.1 and §5.3, documented above and in `src/data/track.ts`'s comments — flagging in
    case a future phase (trains routing over bridges, SPEC §7.4/§6) expected the literal
    tile-by-tile adjacency instead.
  - No wooden-bridge weight-class enforcement or washout-chance yet — both are explicitly listed
    against later phases (Phase 6 routing constraints, Phase 8 flood events) in `src/data/track.ts`.
  - Electrify mode and electrified-track rendering (catenary poles) aren't implemented — Phase 8
    per PLAN.md, not scoped to this phase's checklist.
  - Track monthly maintenance (`MAINTENANCE_*` constants) is defined in `src/data/track.ts` but
    nothing charges it yet — there's no monthly ledger tick until Phase 7.
  - Quick build's toggle button is a standalone control, not part of a Settings screen (Phase 11).
- Next: **Phase 5 — Stations**.

## 2026-09-24 — Phase 5: Stations

- **Data** (`src/data/stations.ts`): `STATION_TYPE_DEFS` for Depot/Station/Terminal — catchment
  radius, max train length, storage/cargo, cost, monthly maintenance — straight from SPEC §6.1's
  table. `STATION_ACCEPTANCE_THRESHOLD = 8` (SPEC §6.3, "like RRT").
- **Placement** (`src/sim/stations/placement.ts`): `canPlaceStationAt` allows exactly a dead end
  (1 track edge) or a straight/diagonal through-run (2 edges exactly opposite in the 8-direction
  wheel) — a junction (3+ edges) or a bend (2 edges not opposite) can't take a station, matching
  SPEC §6.1 literally. `stationCatchmentTiles` returns the Chebyshev-radius square (3×3/5×5/7×7),
  clipped to the map.
- **Cost** (`src/sim/stations/cost.ts`): same era-inflation × difficulty-multiplier scaling as
  track (`src/sim/track/cost.ts`'s `CostContext`, reused directly). Upgrade cost is the difference
  between the two tiers' *currently* scaled costs (not a price locked in at original build time —
  SPEC's "paying the difference" doesn't specify which, and this reads more naturally: upgrading
  later costs the era-adjusted difference, same as buying a bigger station outright would).
- **Naming** (`src/sim/stations/naming.ts`, `defaultStationName`): SPEC §6.1's example is "Harlow
  Coal Mine" — nearest-city name, plus a suffix when the station isn't itself on a city tile.
  Implemented as: city name alone if `map.cityId[tile] >= 0`; else nearest city's name + the
  nearest industry's name if one is inside the *chosen type's* catchment (e.g. "Harlow Coal
  Mine"); else + "Junction" if a neighboring tile carries a 3+-edge junction (a station tile
  itself can never literally *be* a junction, since `canPlaceStationAt` only allows a dead end or
  a straight run — so "Junction" means "sits right next to one", which is what the word means in
  real railroading anyway); else + "Crossing" as the generic fallback. Duplicate default names get
  a trailing " 2", " 3", etc. No cities at all on the map falls back to the type's own name
  ("Depot").
- **Economy** (`src/sim/stations/economy.ts`, `computeStationEconomies`): acceptance is purely
  per-station — sum of acceptance points (industry `acceptancePoints`, or a city tile's points via
  a new `cityTileAcceptance` factored out of Phase 3's `cityAcceptance`) over the station's own
  catchment tiles, thresholded at 8. Supply is shared: each producer tile (an industry, or a city
  tile's population-proportional passenger/mail share via the new `cityTileSupply`) splits its
  output evenly across every station whose catchment covers that tile (SPEC §6.1: "overlapping
  supply is split evenly"). `previewStationEconomy` runs the same calculation with a not-yet-built
  station spliced in, so the placement panel's live preview already accounts for overlap with
  stations that exist. The whole thing is a pure recompute (cheap at realistic station counts, no
  incremental cache logic) — `GameState.stationEconomy` is just the last recompute's result,
  refreshed by `refreshStationEconomy` at the end of `buildStation`/`upgradeStation` (`src/sim/
  commands.ts`), which is what PLAN's "cached; invalidated when stations/cities/industries change"
  means in practice here. Cities/industries never change after generation in Phase 5 (that's Phase
  8's industry dynamics), so a station build/upgrade is the only invalidation trigger there is yet.
- **Commands** (`src/sim/commands.ts`): `buildStation` (validates track shape, tile not already
  occupied, affordability; the very first station built in the game — `state.stations.length ===
  0` at build time — gets `hasEngineShed: true`, a flag only, per PLAN), `upgradeStation` (must be
  a strict Depot→Station→Terminal step forward), `renameStation` (free, rejects an empty/
  whitespace-only name). All the usual `{ok}` / `{ok:false, reason}` shape; new reason codes
  (`station-no-track`, `station-occupied`, `invalid-station-upgrade`, `invalid-station-name`) added
  to `strings.build.reasons` alongside the existing track ones.
- **Station mode UX** (`src/main.ts`, `src/ui/stationPanels.ts`): unlike Track/Double/Bulldoze,
  Station mode is a *tap*, not a drag — `CameraInput.setBuildMode` is only engaged for the three
  drag modes now; Station (like Info) uses the plain one-finger-pans/tap-to-act path. Tapping a
  valid track tile opens a "New Station" panel (`openStationPlacementPanel`): a type picker
  (Depot/Station/Terminal, live cost), stats, and a live supplies/accepts preview (cargo-colored
  chips, reusing Phase 3's `cargoChip`/`chipTextColor` from `ui/infoPanels.ts`, now exported) that
  all update in place — no panel re-open/flash — as the player taps between types, driven by a
  single `update()` closure rather than three separate mutable pieces of state. The map itself
  shows a tinted catchment overlay (`render/stationPreview.ts`) that grows/shrinks live with the
  selected type, plus a ring marker on the station tile. Confirm/Cancel live inside the panel body
  (Station mode has no drag, so there's no floating confirm bar to reuse). Tapping an *existing*
  station — in either Info or Station mode — opens its management panel (`openStationPanel`): name
  + rename (a text input, committed on blur/Enter via the `change` event), type + an upgrade
  button (only shown if not already a Terminal), the same supplies/accepts chips read live from
  `state.stationEconomy`, a "⚙ Free Engine Shed" note when set, and a static waiting-cargo
  placeholder line (SPEC's real cargo piles are Phase 7).
- **Rendering** (`src/render/stations.ts`): stations are drawn directly every frame (not baked
  into an offscreen chunk cache like terrain/track) — there are only ever a few dozen of them in a
  session, nowhere near enough to need the caching+invalidation machinery track/terrain use, and
  skipping it means no `invalidateTiles`-equivalent to remember to call on build/upgrade. Each
  type draws a platform strip plus a peaked-roof building block, scaled up per type (Depot smallest
  single small building; Terminal noticeably bigger with *two* building blocks side by side) so
  the three are distinguishable at a glance, matching SPEC §6.1's "platform + building, bigger for
  terminals". Labels reuse the city-label look (dark-halo text) under the icon.
- **Tests** (`tests/sim/stations/*.test.ts`, 36 new): `canPlaceStationAt` over dead-end/straight/
  diagonal/junction/bend cases; `stationCatchmentTiles` radius-to-footprint math (3×3/5×5/7×7) and
  edge clipping; `stationCost`/`stationUpgradeCost` era/difficulty scaling; `defaultStationName`
  for all four naming branches plus duplicate disambiguation and the no-cities fallback;
  `computeStationEconomies` for the acceptance threshold (both sides of it), catchment-radius
  gating, a lone station getting a producer's full output, two stations splitting an overlapping
  producer evenly, and a city's supply splitting by tile-coverage fraction; `previewStationEconomy`
  accounting for an already-built station's share; and `buildStation`/`upgradeStation`/
  `renameStation` round-trips including the free-Engine-Shed-only-on-the-first-station case and
  every failure reason. `tests/sim/track/helpers.ts`'s `makeTestState` got the three new
  `GameState` fields (`stations`, `nextStationId`, `stationEconomy`) as defaults.
- **E2E** (`e2e/stations.spec.ts`, all screenshots at the 800×360 CSS px phone viewport): built a
  long flat track run through the town of Ashtown for seed 12345 (found with a throwaway search
  script — the same "flat row near map center" idea Phase 4 used, now also confirming it runs
  straight through Ashtown's own footprint, the same town `phase-4-junction.png` shows). One test
  taps a track tile inside Ashtown's footprint, checks the panel/type-picker/overlay, switches the
  type live, and cancels; a second builds one of each type and screenshots each on the map at zoom
  1.5; a third builds, opens the management panel, renames, and upgrades it, asserting the panel's
  content and `getStationEconomy()` (a new `?debug=1` hook, alongside `getStations()`) throughout.
- **Screenshots — looked at them**:
  - `phase-5-station-placement.png`: "New Station" panel open over an amber-tinted 3×3 catchment
    square with a ring on the tapped tile; Depot/Station/Terminal buttons with costs; stats;
    Supplies shows "Passengers 14.9/mo" and "Mail 4.7/mo"; Accepts shows Passengers/Mail/Goods/Food
    as full-opacity chips and a dimmed "Lumber 4" (below the 8-point threshold) — the dimming is
    visibly distinct at this size. First attempt at this screenshot came back with the panel
    sliced down to ~150px of its real 360px width and the confirm/cancel row unclickable in an
    actual (non-screenshot) run — a genuine bug (see Carry-overs below), not a screenshot fluke.
  - `phase-5-depot.png` / `phase-5-station-type.png` / `phase-5-terminal.png`: Depot is one small
    building with a short platform; the Station-type one (named "Ashtown", sitting on the city
    tile) is visibly bigger; the Terminal (further down the line, alone in frame) is clearly the
    biggest — two building blocks side by side over a long platform, unmistakably a bigger
    structure than the other two even at a glance.
  - `phase-5-station-panel.png`: title "Ashtown", an editable name field pre-filled "Ashtown",
    "Type: Depot", stats, "⚙ Free Engine Shed", and a blue "Upgrade to Station ($25k)" button —
    all readable, nothing clipped or overlapping.
  - Also regenerated (same reasoning as every prior phase's carry-over fixes): `phase-4-*.png`
    (the double-track gap fix — see below — and Station now enabled in the toolbar) and
    `phase-3-city-*.png`/`phase-0-smoke.png`/`phase-1-*.png` (the city-density rewrite, also below,
    plus the toolbar change). Kept the regenerated versions per CLAUDE.md's rule, same as Phase 3
    and Phase 4's own entries.
- **Carry-overs from the Phase 4 review**:
  - Double track vs. single track at zoom 1–1.5: `render/track.ts`'s cached "tiesStyle" raster
    (used at zoom ≥ 0.75, i.e. exactly the 1–1.5 range called out) offset the two parallel tracks
    by only 3px-at-scale-1, and each track's own two rails sat 2.2px-at-scale-1 off *that* —
    leaving the two tracks' inner rails only ~1.6px apart, nearly touching. Widened the offset to
    5px-at-scale-1 (a ~67% wider gap since it's baked into the raster at a fixed tile resolution
    and then scaled by zoom, this widens it proportionally at every zoom in that bucket) — cropped
    `phase-4-double-track.png` 3× and confirmed two clearly separate rail-and-tie sets with a real
    gap between them, not a thick single line.
  - City density: `render/cities.ts`'s `drawCityRoofs` drew every roof at a random position/size
    within the tile regardless of density, so even the "dense" core end of the interpolation just
    meant *more* randomly-scattered small rectangles — which is exactly what a Phase 3 review
    already flagged once, and the reviewer's note that `phase-4-junction.png`'s Ashtown still
    looked sparse/scattered confirms the earlier fix didn't go far enough. Replaced it with two
    genuinely different layouts picked by a per-tier `blockAt` closeness threshold: below it,
    the original scattered-small-houses look (kept, unchanged, for the outskirts); at or above it,
    a new `drawDenseBlock` that lays out 2–3 rows of buildings spanning the *full* tile width,
    widths randomized but summing edge-to-edge (touching, no gaps) within each row, with a street
    line at each row boundary. Villages never cross their `blockAt` (set > 1, unreachable) since a
    village has no real downtown to speak of. Looked at the regenerated `phase-3-city-closeup.png`
    (zoom 2) and `phase-4-junction.png`/`phase-0-smoke.png` (zoom 1.5/1): both towns now show a
    visibly solid built-up core — roofs genuinely touching in rows along a street line — fading to
    individual scattered houses at the footprint's edge, not a uniform cloud of dots at any zoom.
  - A third, smaller bug found while building this phase's own placement panel: `.panel`
    (`index.html`) had no explicit `z-index`, and the bottom-right `.quick-build-toggle` does
    (`z-index: 6`) — on the 800×360 viewport, a panel whose content reaches near the screen bottom
    (Station mode's in-panel Build/Cancel row, unlike any Phase 1–4 panel) had its own
    bottom-right corner covered by the toggle, which *visually* sat on top despite being earlier
    in the DOM, making Confirm/Cancel unclickable there. Gave `.panel` `z-index: 10` (above the
    toggle, below the transient confirm-bar/toast overlays that already had higher values) — this
    is a general panel-vs-toggle stacking fix, not Station-specific, so it'll matter for any future
    panel whose content runs long on a short viewport too.
- Known issues / deviations:
  - Station bulldoze/removal isn't implemented — not in this phase's checklist (`buildStation`,
    `upgradeStation` only). Track under a station can still be bulldozed by an existing Bulldoze
    drag without removing the station on top of it; that's an edge case this phase doesn't need to
    resolve (no phase before Trains cares whether a station's track is intact) but is worth a look
    whenever station removal is actually implemented.
  - Station improvements from SPEC §6.2 (Water Tower, Post Office, Hotel, Warehouse, Cold Storage,
    Freight Yard, Livestock Pens) aren't buildable yet — only the free Engine Shed *flag* PLAN asks
    for this phase exists. None of them do anything yet regardless (they all affect cargo flow/
    revenue/breakdowns, none of which exist before Phase 6/7).
  - `STATION_TYPE_DEFS`'s `maxTrainLength`/`storagePerCargo` are recorded and shown in the panel
    but nothing reads them yet (train length enforcement is Phase 6, storage caps are Phase 7).
  - Upgrade cost is the *current* era-adjusted price difference between tiers, not a price locked
    in at original build time (see Cost above) — flagging in case a future balance pass expected
    the other reading.
  - Station supply/accept numbers shown are the SPEC §6.3 calculation as specified (nominal
    monthly producer output and city population share), not gated by whether a processor's own
    inputs are actually being delivered — there's no cargo flow yet to gate on (Phase 7), so a
    processor's "Supplies" preview is its full nameplate output, same convention Phase 3's
    industry info panel already uses.
- Next: **Phase 6 — Trains: buying, orders, movement, blocks**.

## 2026-09-24 — Review of Phase 5 (Opus)
- Accepted (125 unit / 15 e2e green). Revised SPEC §7.4 movement scale + §8.1 revenue expected time (see Deviations) before Phase 6.
- Carry-overs into Phase 6: station build panel overflows an 800×360 viewport (confirm button cut off); station label overlaps city label when a station sits in a city; terminal building looks as small as a depot.

## 2026-09-24 — Phase 6: Trains (buying, orders, movement, blocks)

- **Data** (`src/data/trains.ts`): the full SPEC §7.7 locomotive roster (22 models, steam/diesel/
  electric) as a flat array with `locomotivesAvailableIn(year)`/`locomotiveById`. Movement-scale
  constants (`KMH_PER_TILE_PER_DAY = 30`, `TICKS_PER_TILE_DIVISOR = 720`) live here per the Phase 5
  review's SPEC §7.4 revision. Speed-model constants (grade/curve factors, load weights), block/
  deadlock timing (`MIN_SPACING_TILES_DOUBLE_TRACK`, `DEADLOCK_REROUTE_DAYS` = 5,
  `DEADLOCK_STUCK_DAYS` = 10, `DEADLOCK_BLOCK_PENALTY`, `DEAD_END_REVERSE_HOURS` = 6), the
  placeholder `TRAIN_LOADING_TICKS = 12`, and car/loco render lengths. Added `trainCapacity` to
  `STATION_TYPE_DEFS` (Depot 1 / Station 2 / Terminal 4, SPEC §7.5) alongside the existing per-type
  numbers rather than a separate table, per CLAUDE.md's "balance numbers live in one place".
- **Routing** (`src/sim/trains/route.ts`, `findTrainRoute`): A* whose search state is
  `(node, incomingDirection)`, not just `node` — the same node can be legally entered from one
  direction and not another, so a plain visited-set (like the Track-mode build pathfinder uses)
  would under- or over-constrain the search. Turn rule = `turnAllowed` (≤45°) OR (at a station tile
  AND a full 180° reversal) — stations only ever have 1 or 2 opposite edges (`canPlaceStationAt`
  guarantees this), so that reversal exception can never accidentally legalize some other sharp
  turn through one. A fresh route from a station passes `incomingDirection: -1` (unconstrained
  first move); a mid-journey reroute passes the train's actual current heading, so it still can't
  reverse away from a plain node. Wooden-bridge weight limit and per-edge electrification are plain
  neighbor-feasibility filters. Heuristic is straight octile tile-distance (admissible against the
  tile-length + optional block-penalty edge cost); a deadlock reroute biases the search away from a
  specific block via `blockPenalties: Map<blockId, number>` rather than re-deriving a whole new
  cost model.
- **Blocks** (`src/sim/trains/blocks.ts`, `computeBlocks`): pure function of the track graph +
  station tiles — boundaries are stations, degree-≠2 nodes (junctions and dead ends), matching SPEC
  §7.5 exactly (a *station* is a boundary regardless of its own degree, since `canPlaceStationAt`
  only ever allows degree 1 or 2 there). Walks each unvisited edge outward in both directions until
  it hits a boundary (or a closed loop with no boundary anywhere, an edge case handled by stopping
  when the walk revisits an already-claimed edge — the whole loop becomes one block with both
  "ends" coincident at an arbitrary node on it). A block is `double` only if every edge in it is.
  Recomputed lazily by `src/sim/trains/index.ts`'s `getTrainRuntime`, cached in a `WeakMap<GameState,
  …>` keyed off `state.trackVersion` — a new counter on `GameState`, bumped by every track command
  (`buildTrack`/`upgradeTrack`/`bulldoze`) *and* by `buildStation` (a station is a boundary, so
  building one can split an existing block even though the graph's edges didn't change).
- **Movement** (`src/sim/trains/movement.ts`, `stepTrain` — called once per train per tick by
  `src/sim/trains/index.ts`'s `stepTrains`, wired into `main.ts`'s game-loop tick handler and the
  `runDays` debug hook):
  - Speed model is SPEC §7.4 literally: `effort = load × (1 + 0.6×grade)`,
    `speedFactor = clamp(power/effort, 0.15, 1)`, curve factor 0.7 at a 45° node, both applied to
    `maxSpeedKmh`. Acceleration/deceleration rate = the loco's own `maxSpeedKmh` per tick, i.e. it
    reaches any target speed within one tick — a literal reading of "reach max in ~1 in-game hour"
    given 1 tick *is* 1 in-game hour; braking is the SPEC-endorsed "stop at boundary" simplification
    (target speed snaps to 0 while a train is `waitingForBlock`/`waitingForStation`, so it coasts
    down over however many ticks it has left before the boundary, however many that turns out to
    be). Cars are always "empty" weight (0.4/car) — no cargo loading yet (Phase 7).
  - Per tick, a train converts `speed / 720` tiles of budget into `edgeProgress`, crossing zero or
    more graph nodes in a bounded loop (fast locos never cross more than one edge boundary per tick
    at any speed in the roster, but the loop tolerates a few for safety). At every node boundary it
    doesn't already hold the next block for, it attempts `tryEnterBlock`: single-track blocks are
    exclusive; double-track blocks require ≥`MIN_SPACING_TILES_DOUBLE_TRACK` (2) tiles from the
    nearest *same-direction* occupant (opposing-direction trains never conflict, since SPEC treats
    them as separate lanes) — direction and distance-into-block are read off every train's
    `heldBlocks` (at most 2 entries: the block a train's head is in, plus the previous one kept an
    extra tick as the documented "head-based release + one-block lag" simplification for tail
    clearance, SPEC §7.5). Entering the block that ends exactly at the current order's target
    station additionally requires a free `stationOccupancy` slot (SPEC: "reserve station slot
    together with the final block") — occupancy counts trains already docked (`loading`) there
    *and* trains already committed to the final block inbound to it, so two blocks converging on
    one station can't both admit a train past its capacity in the same tick.
  - Deadlock handling matches SPEC §7.5's timeouts (5/10 in-game days) with one real bug found and
    fixed while writing the "4 trains congested on one line" test: the reroute-with-penalty attempt
    at day 5 must **not** go through the same "always resolves to `moving`/`noRoute`" helper used
    for a fresh route — if the alternate route it finds is immediately blocked too, that helper
    would still flip status to `moving` and reset `waitTicks`, so a train stuck behind real,
    persistent traffic would retry every 5 days *forever* and never reach the 10-day `stuck`
    threshold. Fixed by having the deadlock-timeout path call `tryEnterBlock` itself and only
    change status on an actual grant — a failed retry leaves the status string unchanged, so the
    wait-tick counter (which only resets on a genuine status change) keeps counting toward `stuck`.
  - Dead-end recovery (SPEC §7.3, "mainly for recovery"): a train idle at a non-target dead end for
    `DEAD_END_REVERSE_HOURS` (6 ticks) gets a synthetic one-edge route back the way it came; reaching
    the end of any route that isn't the actual target (this recovery hop included) just forces a
    fresh route search from wherever it ends up, rather than treating it as "arrived".
  - Rendering interpolation support: `renderFromX/Y` (start of tick) / `renderToX/Y` (end of tick)
    fractional tile coordinates, refreshed every tick regardless of status, for the renderer to lerp
    with the frame's accumulator alpha.
- **Commands** (`src/sim/commands.ts`): `buyTrain` (station must have `hasEngineShed`; validates
  era availability, max cars, and the High-Speed Trainset's passenger/mail-only restriction; era-
  inflation-scaled cost like every other purchase), `setOrders` (2–8 valid station ids, resets to
  the top of the list), `sellTrain` (50% refund of the *current* era-adjusted loco+cars value, same
  "not locked in at purchase time" convention Phase 5 set for station upgrades).
- **Rendering** (`src/render/trains.ts`): drawn directly every frame (a handful of trains, same
  reasoning as station rendering — no chunk cache needed). Loco head lerps between
  `renderFromX/Y`→`renderToX/Y` with the loop's alpha; cars are placed by walking backward along
  `route`/`edgeProgress` by `LOCO_LENGTH_TILES/2 + (i+0.5)×CAR_LENGTH_TILES` tiles per car (clamped
  at the start of the known route — a train that just left a station doesn't have enough route
  history yet, so its cars bunch toward the head; a cosmetic simplification, not a physics one).
  Steam locos get a dark boiler/body/chimney plus two soft smoke puffs cycling on wall-clock time
  (independent of sim tick rate, so they animate smoothly even paused); diesel gets a colored hood
  and window; electric gets a boxy body, window, and a small zig-zag pantograph. A small red dot
  above a `waitingForBlock`/`waitingForStation` train is the "signal" SPEC §7.5 asks for; `⚠` marks
  `stuck`/`noRoute`.
- **UI** (`src/ui/trainPanels.ts`): Buy Train dialog (loco list with stats, a car picker built from
  `CARGO_TYPES` filtered by era and the selected loco's passenger/mail-only flag, and an orders
  editor where "+ Add stop" arms a one-shot "tap a station on the map" mode — main.ts intercepts the
  next station tap via a `stationPickHandler` instead of opening that station's own panel, then
  disarms itself); Train panel (status/locomotive/speed/consist/orders, Sell); Train list (tap a row
  to jump the camera to that train and open its panel). A "🚆 Trains" button floats above the
  existing quick-build toggle (the corner toolbar.ts's own comment had earmarked for it). Tapping a
  train icon anywhere on the map (small screen-space hit-radius against every train's current head
  position, checked before the tile-based station/city/industry taps) opens its panel too.
  "Buy Train" itself is a button in the existing station panel, shown only when `hasEngineShed`.
- **Debug hooks** (`main.ts`'s `window.__game`, `?debug=1`): `runDays(n)` (shares the exact tick
  body — `tickOnce` — the real-time game loop uses, so debug-hook time and wall-clock time are the
  same simulation, just batched), `buildTrackPath`, `buildStation`, `buyTrain`, `setOrders`,
  `sellTrain`, `getTrains`.
- **Carry-overs from the Phase 5 review, fixed**:
  - Panel overflow: `.panel-actions` is now `position: sticky; bottom: 0` inside `.panel` (the
    actual scroll container — same trick `.panel-header`'s `sticky; top: 0` already used), with
    `.panel-body` given a 64px bottom-padding buffer. That buffer turned out to matter, not just be
    defensive: without it, a panel whose content is only *barely* taller than the 316px body (e.g.
    the Train panel with 2 orders) could have the sticky bar's clamped position land right on top of
    the last content row instead of below it (sticky positioning reserves the element's normal-flow
    space but can visually render it elsewhere) — found via the Train panel screenshot showing one
    order missing, chased down by dumping the panel's actual DOM (both rows were always there) and
    confirmed fixed by inspecting the scrolled-to-bottom state, not just the default scroll-to-top
    view a first screenshot happens to capture.
  - Station-vs-city label collision: `drawStationLabels` (`render/stations.ts`) now takes the
    city list and a `cityId` lookup; for a station inside a city's footprint, it computes that
    city's own label screen position the same way `drawCityLabels` does and, if they'd overlap
    (horizontally close and vertically within the city label's estimated line height), pushes the
    station's label down to sit just below the city's instead.
  - Terminal vs. Depot size: bumped the terminal's building scale from 0.5× to 0.58× a tile (Depot
    stayed at ~0.3×, slightly *down* from 0.34× to widen the gap further) — Terminal is now visibly
    ~1.9× Depot's linear building size plus its existing second roof block, not ~1.5×.
- Screenshots (all in `docs/screenshots/`, looked at each one before calling this done):
  - `phase-6-train-moving-zoom1.5.png` / `-zoom2.png`: a steam loco (dark boiler/chimney silhouette)
    partway along a single-track line, camera re-centered on the train's *actual* position each
    time rather than a fixed midpoint — a fixed camera at zoom 1.5 with the train still near its
    departure station put it directly under the left toolbar overlay, invisible in the first attempt.
  - `phase-6-train-waiting-signal.png`: two locos parked nose-to-tail near a station, the rear one
    showing the small red signal dot (`waitingForBlock`).
  - `phase-6-double-track-passing.png`: two locos on a double-track line, camera centered on their
    midpoint at the moment they're closest while moving in opposite directions.
  - `phase-6-buy-train-dialog.png`: the Buy Train dialog — locomotive list, in-progress car
    selection, a 2-stop orders list built by tapping stations on the map, the pinned Buy button.
  - `phase-6-train-panel.png`: the bought train's management panel, scrolled to the bottom so both
    order rows and the pinned Sell button are all visible at once (this panel's content is just
    over the 316px body height).
- Known issues / deviations:
  - No double-heading (SPEC §7.1, two locos from 1850) — a train is always exactly one locomotive
    this phase; not required by PLAN's checklist and cargo/revenue (where it'd actually matter)
    doesn't exist yet either.
  - Train priority (Normal/Express, SPEC §7.2) isn't implemented — orders store a loading `rule`
    but no priority field, and block admission has no priority tie-breaking. Nothing before Phase 8
    needs it.
  - "Camera follow toggle" (PLAN's wording) is a one-shot jump-to-train from the Train list, not a
    continuously-locked-on camera; re-tap the list to re-center if the train has moved since.
  - `maxTrainLength` (SPEC §6.1, already recorded per station type since Phase 5) still isn't
    enforced against a train's actual car count — noted then as a Phase 6 gap, still not needed by
    any test here; worth a look whenever it becomes a real constraint on car-buying.
  - A block reservation is granted or denied for the *whole* remaining journey through it in one
    shot (SPEC's simplification), and released on a one-tick lag after the head leaves rather than
    true tail-clearance (`train.length = cars×0.25 + 0.5` tiles) — both explicitly SPEC-endorsed
    simplifications, flagged here since a future tighter-packing pass on very short blocks would
    need to revisit them.
  - Station "Pass through (non-stop)" and other loading rules are stored (`TrainOrder.rule`) and
    round-trip through Buy/setOrders/the train panel, but every stop currently dwells for the same
    fixed `TRAIN_LOADING_TICKS` regardless of rule — real per-rule behavior (and cargo loading
    itself) is Phase 7.
  - A track edit that destroys the exact edge a train is mid-transit on (rare: requires bulldozing
    directly under a moving train) snaps that train back to the node it last fully held and forces
    a reroute from there next tick, rather than anything more sophisticated — not a "teleport" in
    the gameplay sense (it only ever moves backward to a point it already legitimately occupied)
    but flagging the simplification since it's the one place movement.ts deals with a route whose
    next edge has simply ceased to exist mid-tick.
- Tests: 30 new unit tests (`tests/sim/trains/{route,blocks,movement}.test.ts` — 175 total, all
  green) covering the 45° rule + reversal-only-at-stations, wooden-bridge weight limit,
  electrification, a 60-day single-track shuttle (block never double-booked, neither train stuck),
  60-day double-track opposing traffic, a 4-train congested-line scenario (never double-books a
  block; the deadlock clock is bounded exactly at `DEADLOCK_STUCK_DAYS`, which is what caught the
  reroute-reset bug above), grade-vs-flat speed, and a 90-day determinism check (same commands from
  the same seed → byte-identical route/position/status). Plus 4 new e2e specs
  (`e2e/trains.spec.ts`) exercising the debug hooks end to end and the real Buy Train dialog/train
  panel UI. `npm run check` and `npm run e2e` both green (19/19 e2e specs, 145/145 unit tests).
- Next: **Phase 7 — Cargo flow and economy**.

## 2026-09-24 — Phase 7: Cargo flow and economy

- **Data** (`src/data/cargo.ts`, `src/data/finance.ts`, `src/data/industries.ts`,
  `src/data/stations.ts`, `src/data/trains.ts`): added `urgency` per cargo (SPEC §8.1's revenue
  `expected` formula), `CARLOAD_UNITS = 20`, `MIN_REVENUE_DISTANCE_TILES = 3`,
  `waitingDecayThresholdDays(cargo)` (30 general / 10 passengers / 15 mail, SPEC §6.3) and
  `WAITING_DECAY_RATE_PER_DAY = 0.05`; `recipeMode: "all" | "any"` per industry (steel mill needs
  *both* coal and ore, food plant/factory/sawmill/refinery take *either* listed input) plus
  `INDUSTRY_INPUT_STORAGE_CAP = 240`; `loadSpeedMult` per station type and
  `TICKS_PER_CAR_HANDLED`/`MIN_LOADING_TICKS`/`OVERLENGTH_SLOWDOWN_MULT`/
  `DEFAULT_FULL_LOAD_MAX_WAIT_DAYS` replacing the old placeholder `TRAIN_LOADING_TICKS`; the full
  SPEC §9 ledger shape (`LedgerPeriod`) and loan/net-worth constants.
- **Cargo accrual & decay** (`src/sim/economy/cargoFlow.ts`, `accrueDailyCargo`, called once per
  in-game day from `src/sim/tick.ts`): each station's waiting pile per cargo grows by
  `stationEconomy.supply[cargo] / 30` (the existing monthly "capacity" figure from Phase 5,
  unchanged), capped at that station type's `storagePerCargo`; a pile decays 5%/day once its
  `waitingDays` (consecutive days without any of it being *picked up*, not a true per-unit FIFO
  age — SPEC's "cargo older than 30 days" is a bulk-pile concept anyway) exceeds its threshold.
  `state.stationCargo: Map<stationId, Partial<Record<CargoType, {amount, waitingDays}>>>` is new
  `GameState`.
- **Processing chains** (`src/sim/economy/processing.ts`): `computeStationEconomies`
  (`src/sim/stations/economy.ts`, Phase 5) now takes an optional `industryEconomy` map and uses
  each industry's dynamic `monthlyOutput` instead of the static `produces` table when present — raw
  producers' `monthlyOutput` is always `produces` (set at creation); a processor's is recomputed
  every month from its accumulated `inputStock` via `processIndustryMonth` (the `recipeMode`
  interpreter) and starts at `{}` until its first month of real deliveries, matching SPEC §8.2's
  "appears... the following month". Delivered cargo credits every consuming industry in the
  *unloading* station's catchment by a full carload (`src/sim/trains/loading.ts`'s `applyUnload`),
  on top of the revenue that delivery always earns — a station doesn't need to "be" an industry to
  earn money for hauling its inputs there.
- **Loading/unloading & revenue** (`src/sim/trains/loading.ts`, `stepLoading` — called every tick a
  train's status is `loading`, replacing Phase 6's fixed-tick placeholder in
  `src/sim/trains/movement.ts`): dwell time is computed lazily on arrival from how many cars
  actually need handling (`TICKS_PER_CAR_HANDLED × station's loadSpeedMult × 2 if overlength`,
  floored at `MIN_LOADING_TICKS`), not a flat constant. `"passThrough"` departs immediately.
  `"auto"`/`"fullLoad"` unload any loaded car whose cargo the station accepts (SPEC §6.3: cargo the
  station doesn't accept just stays on the train) and load any empty car whose cargo is both
  available in the station's waiting pile (≥1 carload) *and* accepted at some **other** stop in the
  train's order list — a car never picks up something it can't ever deliver. `"unloadOnly"` skips
  the load half. `"fullLoad"` re-checks once a day (supply keeps accruing) until every car is full or
  `maxWaitDays`/the 14-day default is hit, then departs with whatever it has. Revenue
  (`computeRevenue`) is SPEC §8.1's formula exactly — `expected = distanceTiles/2 × urgency + 2`,
  the two-piece `timeFactor`, era inflation, difficulty multiplier — with distance the Euclidean
  tile distance between the car's `loadedTile` and the unloading station; under 3 tiles pays $0 but
  still unloads. Each delivery pushes a `{stationId, cargoType, revenue}` onto
  `state.pendingDeliveries` for the UI to drain into a floating label, and calls
  `addRevenue`/`state.cash +=` directly. Movement's speed model now uses each car's real weight
  (`CAR_WEIGHT_LOADED` vs `CAR_WEIGHT_EMPTY`, both already defined in Phase 6 but unused until a car
  could actually be loaded) instead of always-empty.
- **Finance** (`src/sim/finance/`): `ledger.ts`'s `monthlyFinanceStep` (called at each month
  boundary from `src/sim/tick.ts`) charges track/station/train maintenance (era-inflated, summed
  from every edge/station/train currently on the map — no more hardcoded placeholder) and monthly
  loan interest, then runs SPEC §9.4 bankruptcy: a forced loan up to the credit limit if cash is
  negative at month-end, 3 consecutive still-negative months (Normal/Hard only — Easy never sets
  `bankrupt`) trips `state.finance.bankrupt`. `netWorth` is cash − loans + 50% of cumulative
  `capitalInvested` (tracked in `commands.ts`: added on every track/station build or upgrade,
  subtracted by the *original* cost — not just the 25% refund — on bulldoze) + every train's
  `purchasePrice` depreciated 5%/year from its own `purchaseTick`, floored at 10%. `takeLoan`/
  `repayLoan` (new commands) move cash in $100k increments, gated by `computeCreditLimit` (50% of
  net worth, min $500k). A capped (`NET_WORTH_HISTORY_MAX_SAMPLES = 480`, 40 years) monthly
  `{tick, cash, netWorth}` sample feeds the finance panel's chart.
- **UI**:
  - Floating `+$` labels (`src/render/deliveryLabels.ts`): `src/main.ts`'s `tickOnce` drains
    `pendingDeliveries` into a short-lived `FloatingLabel[]` stamped with a real (`performance.now()`)
    start time — kept out of `src/sim` entirely, matching CLAUDE.md's "renderers never mutate state,
    sim stays pure" split the other way round (a render-only concern reading sim output, not the sim
    depending on wall-clock time). Rises/fades over 1.4 real seconds, cargo-colored with a dark
    stroke for legibility against any terrain. **Pitfall hit**: the label is drawn correctly on the
    first attempt but is easy to accidentally bury — placing a test's coal mine/steel mill directly
    *above* the station (the natural "adjacent tile" choice for a depot's 3×3 catchment) put the
    industry's own dark icon exactly where the label rises through, and its `#2A2A2A` (coal) color
    nearly matches the industry's dark palette. Fixed by offsetting industries diagonally instead of
    straight up in the e2e scenarios; added a `getFloatingLabels()` debug hook (used to confirm the
    label array itself was correct throughout, ruling out a real rendering bug) that's also just a
    generically useful test hook going forward.
  - Station panel (`src/ui/stationPanels.ts`): the Phase 5 "waiting cargo" placeholder is now real
    bars (`cargo-bar-row`/`-track`/`-fill`/`-value`, cargo-colored fill, `amount/cap` label) fed by
    `state.stationCargo`. Train panel (`src/ui/trainPanels.ts`): each consist chip now shows
    `Empty (Coal)` dimmed vs. solid `Coal` per car's `loaded` flag.
  - Finance panel (`src/ui/financePanel.ts`, new, opened by tapping the top bar's cash figure):
    cash/net worth/loans/credit limit, Borrow/Repay $100k buttons, a small canvas line chart (cash
    in green, net worth in gold, plain min/max-scaled polylines — no chart library, matches the
    project's "no extra runtime deps" rule) fed by `netWorthHistory`, and this-year/last-year ledger
    tables reusing the same row layout. A "Yearly Report" button opens the dialog on demand.
  - Yearly report (`src/ui/yearlyReport.ts`, new): opens automatically at the year boundary
    (`src/main.ts`'s `tickOnce`, only if no other panel is already open, so it never steals focus
    mid-interaction) showing the *just-completed* year's net profit headline (green/red) and full
    ledger breakdown, `finance.lastYear` — the rollover in `yearlyFinanceRollover` happens before
    this check in the same tick, so `lastYear` is already the right period and the *current*
    calendar year is one past it.
- **Carry-overs from the Phase 6 review, fixed**:
  - Train visuals (`src/render/trains.ts`, `src/render/palette.ts`): steam locos are now a proper
    small assembly — boiler cylinder (with 3 lighter bands) between a smokebox nose/chimney at the
    *front* (direction of travel) and a boxier cab + tender at the *rear* (the Phase 6 code had
    these reversed: chimney toward the back, cab toward the front, which combined with an
    all-dark-toned palette read as "one plain black rectangle" at zoom 2 exactly as the review
    flagged). Diesel/electric got rounded-rect bodies, a stripe/roof-band accent, and a brighter
    pantograph color for visibility. Cars are rounded rectangles, cargo-colored when `loaded`, a
    neutral grey (`CAR_EMPTY_COLOR`) when not — real information now that cars can actually be
    empty or full, not just a car-type color regardless of load.
  - Car bunching right after departure (`src/sim/trains/movement.ts`/`types.ts`): a new
    `Train.lastApproachNode` records the node a train arrived at a station *from*; `tryRoute`
    prepends it to a fresh post-departure route (only when `route` is literally `[start]`, i.e. a
    genuine station departure — never for a mid-journey reroute, which already has real history)
    and sets `routeIndex = 1` instead of `0`. This gives `render/trains.ts`'s existing
    walk-backward-along-route car-layout logic one real tile of "behind the station" track to use
    immediately, instead of clamping at the station tile until the train has physically covered
    enough distance itself. Verified with a screenshot taken at the exact tick of a *second*
    departure (found by polling train status transitions) showing 4 cars laid out properly along
    the approach track rather than bunched at the loco.
  - Buy Train dialog padding (`index.html`): `.panel-body`'s reserved bottom padding and
    `.panel-actions`' matching negative margin were both `64px`, but the footer's actual rendered
    height (measured via a throwaway Playwright script: `.panel-actions`' bounding box) is `66px` —
    a real, if small, miscalibration that meant the last two pixels of a fully-scrolled panel's
    content could sit under the pinned button. Fixed to `66px` on both. Separately, `.train-car-picker`
    (13 possible cargo chips) had no `max-height`/`overflow-y` of its own unlike the loco/orders
    lists right next to it in the same dialog — that inconsistency, not the 2px footer mismatch, was
    the real cause of the reviewer's screenshot showing cars cut off behind the Buy button (the whole
    dialog's content was simply taller than 316px with an uncapped 4-row chip block in the middle of
    it). Capped it the same way (`max-height: 84px; overflow-y: auto`).
- **Balance** (`tests/sim/balance.test.ts`, hand-built synthetic maps, Normal difficulty, 1848 start,
  `american-4-4-0` loco throughout — cheap and available from turn one):

  | Route | Capital | Rev/yr (yr 2) | Costs/yr (yr 2) | Profit/yr (yr 2) | 2-yr net |
  |---|---|---|---|---|---|
  | Coal mine → Steel mill (12 tiles, 4 coal cars) | $64.4k | $71.7k | $9.6k | ~$62k | **+$55.0k** |
  | Two-city passenger shuttle (12 tiles, 2× 40k-pop cities, 4 pax cars) | $74.2k | $519.0k | $14.1k | ~$505k | **+$907.8k** |

  Both clear "profitable within 2 in-game years" with real margin (coal ~86% ROI on capital over 2
  years; the passenger route is dramatically more profitable per train because it's the SPEC-
  correct combination of a higher `baseRate`, urgency-1.0 short `expected` time, *and* genuinely
  bidirectional carriage — both cities supply **and** accept passengers, so every round trip is
  paid in both directions, unlike the coal route's empty return leg). No data-table tuning was
  needed — both formulas as specified in SPEC §8.1 produced healthy, not razor-thin, margins on the
  first real run.
  **Upper-bound sanity** (also in `balance.test.ts`): 2 coal trains sharing one mine's limited
  supply, and 3 passenger trains sharing one 2-city route's limited supply, both stay *under*
  starting cash (`$1M` for the 2-coal-train case) or well under 10× it — adding more trains than a
  route's actual cargo supply can feed doesn't scale revenue, it just adds maintenance cost per
  idle/lightly-loaded train (the 3-passenger-train run actually nets slightly *negative* over 2
  years vs. one train's `+$907.8k`, since three trains compete for the same fixed daily passenger
  supply while each still pays full purchase + upkeep) — confirms the economy is self-limiting
  rather than a money-printer that rewards blindly stacking trains on one route.
- Screenshots (all in `docs/screenshots/`, looked at each one):
  - `phase-7-coal-train-zoom2.png`: 4 coal cars trailing a steam loco at zoom 2 — the redesigned
    loco (boiler bands, cab, chimney) clearly distinct from the Phase 6 "black rectangle".
  - `phase-7-passenger-train-zoom1.5.png`: a 4-car passenger train (light/white cars, high contrast)
    approaching a city, with a `+$5k` floating label caught mid-fade right next to it.
  - `phase-7-delivery-label.png`: a coal delivery's `+$2k` label clearly on-screen above the
    receiving station (industries placed diagonally off the station specifically so the label
    doesn't render over their own dark icon — see the "pitfall hit" note above).
  - `phase-7-station-waiting-cargo.png`: the station panel's waiting-cargo section, scrolled into
    view, showing `Coal 20/40` with a half-filled bar.
  - `phase-7-finance-panel.png`: cash/net worth/loans/credit-limit rows, Borrow/Repay buttons, and
    the (still mostly flat, this early in a fresh game) cash/net-worth chart with its legend.
  - `phase-7-yearly-report.png`: "1848 Year in Review" with a red `Net profit: -$90k` headline (an
    idle track+station network with no trains bought, so pure maintenance cost — a believable,
    correctly-computed number, not a bug) and the full revenue/expense breakdown.
  - Also regenerated (train rendering changed everywhere trains appear, and one Phase 5/6 panel's
    content genuinely changed): `phase-6-train-moving-zoom1.5/2.png`, `phase-6-double-track-
    passing.png`, `phase-6-train-waiting-signal.png`, `phase-6-train-panel.png` (now shows an
    `Empty (Coal)` chip), `phase-6-buy-train-dialog.png` (car-picker scroll fix); `phase-5-station-
    panel.png` (now shows "Nothing waiting." instead of the old placeholder sentence). All other
    phases' screenshots were reverted (`git checkout -- docs/screenshots/phase-{0,1,1.1,3,4}-*` plus
    three untouched Phase 5 ones) after a full `npm run e2e` run regenerated them with only
    incidental animation-timing noise, no real content change.
- Known issues / deviations: see `docs/SPEC.md`'s Deviations section (car-type-per-cargo carried
  forward from Phase 6, 3-bucket ledger instead of per-cargo-type, station loading-speed/full-load-
  wait defaults not specified by SPEC, station improvements still inert pending Phase 9, net worth's
  rolling-stock value keyed to each train's own purchase price rather than current catalog price).
  Also: waiting-cargo bars and current-load chips are a snapshot from when the panel was opened —
  like every other panel in the game so far, they don't live-refresh while left open during active
  play; re-open to see current numbers.
- Tests: 42 new unit tests — `tests/sim/economy/{cargoFlow,processing}.test.ts` (accrual/decay/caps;
  steel mill's both-inputs recipe vs. food plant/factory's either-input recipe, output capped at
  monthly capacity, leftover stock carries over), `tests/sim/trains/loading.test.ts` (the revenue
  formula table-driven against hand-computed expected values, all four loading rules, the
  under-minimum-distance $0 case, cargo-not-accepted stays on the train), `tests/sim/finance/
  ledger.test.ts` (maintenance charges, interest, the forced-loan-then-bankruptcy sequence, Easy's
  bankruptcy immunity, net worth's construction term and rolling-stock depreciation),
  `tests/sim/commands.test.ts` additions (loan increment/limit validation), `tests/sim/tick.test.ts`
  (a full year, same seed + command log → byte-identical cash/finance/train state, via the new
  shared `advanceOneHour` tick entrypoint both `main.ts` and tests now call instead of duplicating
  the day/month/year boundary logic), and `tests/sim/balance.test.ts` (the PLAN-mandated acceptance
  test — both routes profitable within 2 years, plus the upper-bound sanity check). 187 unit tests
  total (145 → 187), all green. 7 new e2e specs (`e2e/economy.spec.ts`, 26 total) covering all of
  the above end-to-end through the real UI, plus 3 new debug hooks (`debugPlaceIndustry`/
  `debugPlaceCity` to build deterministic economy scenarios on any seed without hunting for real
  map-gen placements; `getFloatingLabels`/`getTrainCars`/`getStationCargo`/`getFinance`/`takeLoan`/
  `repayLoan` for inspection and control). `npm run check` and `npm run e2e` both green.
- Next: **Phase 8 — Eras and technology**.

## 2026-09-25 — Phase 7.1: Balance and UI fixes (review findings on Phase 7)

- **Balance retune** (`src/data/cargo.ts`, `src/data/cities.ts`, `src/data/industries.ts`;
  formulas unchanged, only table numbers — see `docs/SPEC.md`'s Deviations for the full list):
  passengers `baseRate` 3000 → 1400; new tunable `CITY_PASSENGER_SUPPLY_DIVISOR = 650` /
  `CITY_MAIL_SUPPLY_DIVISOR = 1400` (`src/data/cities.ts`, replacing SPEC §8.3's literal
  pop/250 and pop/800 hardcoded in `src/sim/economy/cityStats.ts`); `ironMine.produces.ironOre`
  50 → 60/month (matches `coalMine` so a steel mill isn't ore-starved relative to its coal
  supply); steel `baseRate` 1800 → 2000, goods `baseRate` 2600 → 2900 (so a full processing chain
  clears a passenger shuttle's profit per train, per this phase's target).
- **Balance table** (`tests/sim/balance.test.ts`, hand-built synthetic maps, Normal difficulty,
  1848 start, `american-4-4-0` loco, measured via `finance.lastYear`'s ledger after 2 full
  in-game years — this excludes the initial train-purchase cost, which lands in year 1's ledger):

  | Route | Yr-2 profit/train | Target | In range? |
  |---|---|---|---|
  | Coal mine → Steel mill (16 tiles, 4 coal cars) | $79.7k/yr | $40k–$120k | ✅ |
  | Two-city passenger shuttle (16 tiles, 2× 40k-pop cities, 4 pax cars) | $113.9k/yr | $80k–$200k | ✅ |
  | Passenger/freight ratio (both @ 16 tiles) | 1.43× | 1×–2.5× | ✅ |
  | Coal+ore→steel→factory→goods chain (12-tile legs, 3 trains) | $127.5k/yr/train | > passenger shuttle ($115.7k @ 12 tiles) | ✅ (+10%) |
  | Diversified 5-train network (3 coal + 2 passenger trains), cumulative profit | Yr1 $216k, Yr5 $1.18M | Yr1 < 50% of $1M starting cash; Yr5 within [50%, 200%] of it | ✅ |

  At the wider end of the "12–20 tile" range (20 tiles) the passenger/freight ratio dips to
  ~0.94× (freight very slightly ahead of passenger there — both routes are still individually
  well inside their own $ ranges) since coal's higher `urgency`/shorter effective `expected`
  transit time scales a little better with distance than passengers' does; not worth chasing
  further tuning for, noted here rather than silently ignored. The old numbers (Phase 7, before
  this pass): coal $62k/yr, passengers $519k/yr, ratio ~8.4×.
- **Balance tests** (`tests/sim/balance.test.ts`): replaced the old "any profit at all within
  2 years" checks with the precise ranges above (encoded as real assertions, not just printed),
  added the passenger/freight ratio test, a new `buildChain` helper (4 industries, 4 stations, 3
  trains: mine hub → mill → factory → city) for the chain-profitability test, and a new
  `addNetworkCoalRoute`/`addNetworkPassengerRoute` pair of helpers that add independent routes
  (no shared mine/city/catchment) onto one shared big map/state for the 5-train network test.
  Kept the two existing "doesn't print absurd money" stress tests (oversubscribing *one* route's
  fixed supply with extra trains) since they test something the new precise-range tests don't:
  that piling more trains onto a already-saturated route doesn't scale revenue. All of the above
  needed a `hasEngineShed` workaround in the chain/network helpers — only the *first* station
  ever built in a `GameState` gets a free Engine Shed (buying more is Phase 9's job, not built
  yet), so multi-hub synthetic scenarios force one onto each hub station directly, same as a
  player will eventually be able to do once Phase 9 lands.
- **Panel layout fix** (`index.html`): every panel (`.panel`) was a single scroll container, with
  `.panel-header`/`.panel-actions` faking "pinned" via `position: sticky`. Sticky doesn't remove
  an element from the document flow, so scrolled-past body content could still paint through/over
  the "pinned" header — confirmed by reproducing the exact review screenshot (finance panel,
  scrolled via `scrollIntoView` to bring the chart into frame): the "Credit limit" row's rect
  landed inside the header's own rect afterward. Fixed by making `.panel` a real flex column
  (fixed-size header and footer outside any scrollport) with `.panel-body` as the *only* scrolling
  region (`flex: 1 1 auto; min-height: 0; overflow-y: auto`).
  - That surfaced a second, previously-latent bug: a flex item with non-visible overflow (e.g.
    `.train-car-picker`'s own `overflow-y: auto`) has an *automatic minimum size of 0* per the
    flexbox spec. Once `.panel-body` became height-constrained instead of just growing to fit its
    content, the browser shrank the car/loco/order pickers all the way to 0px height to make
    everything else fit — they were still "visible" per the DOM, just invisible on screen (this
    is exactly what made `buy-train-dialog and train panel fit an 800×360 viewport` time out
    trying to click a 0-height Coal button). Fixed with a blanket
    `.panel-body > * { flex-shrink: 0; }` — nothing in a panel body should ever be squeezed below
    its natural/capped size; overflow is `.panel-body`'s own job to handle by scrolling.
  - Two e2e specs scrolled `.panel` directly (`el.scrollTop = ...`) to frame a screenshot; updated
    both to scroll `.panel-body` instead, since `.panel` itself no longer scrolls
    (`e2e/economy.spec.ts`, `e2e/trains.spec.ts`).
  - Also found and fixed a real (pre-existing, unrelated to the sticky bug) test-timing issue
    while checking every panel screenshot per this phase's brief: the yearly report test's
    100ms wait after the panel auto-opens wasn't enough to clear the panel's own 0.2s slide-in
    CSS transition, so the screenshot sometimes caught it still sliding in — ledger row *values*
    (right-aligned near the panel's right edge) rendered past x=800 and were invisible in the
    800×360 screenshot, while the left-aligned labels were still on-screen (looked exactly like a
    cut-off/overlap bug at a glance). Bumped the wait to 300ms.
- **Delivery label fix** (`src/render/deliveryLabels.ts`): dark cargo colors (coal `#2A2A2A`,
  wood, ...) as the label's fill color, over a half-opacity dark stroke, were unreadable against
  almost any terrain. Cargo colors light enough to read on their own now stay cargo-colored
  (still useful for "what got delivered" at a glance); anything darker (luminance < 0.45) falls
  back to bold white. Also thickened the stroke halo (3px → 4px, 65% → 85% opacity) and bumped
  the font from 13px to 15px, per the review's ask.
- **Screenshots — looked at every one of the seven named panels at 800×360** (only the panel-
  opening/delivery-label screenshots were regenerated and kept; the rest were reverted after
  `npm run e2e` touched them with only incidental animation-timing noise, same precedent as prior
  phases):
  - `phase-7-finance-panel.png`: "Finance" header now reads cleanly with no "Credit limit" text
    bleeding into it; Borrow/Repay buttons fully visible, not half-cut.
  - `phase-7-delivery-label.png`: "+$2k" is now bold white with a strong dark halo, clearly
    legible against the green grass background it used to disappear into.
  - `phase-7-passenger-train-zoom1.5.png`: same fix visible on a second label mid-fade next to a
    moving train.
  - `phase-7-station-waiting-cargo.png`: correctly scrolled to the "Waiting cargo — Coal 20/40"
    bar (this one actually regressed to showing the *unscrolled* top of the panel right after the
    layout fix, since the test scrolled `.panel` — caught and fixed per the e2e-spec note above).
  - `phase-7-yearly-report.png`: "1848 Year in Review" with all ledger row values (Revenue,
    Expenses, Train/Track/Station maint., ...) visible on the right, not cut off past the
    viewport edge (the slide-in-transition timing bug above).
  - `phase-6-buy-train-dialog.png`: scrolled-to-top now genuinely shows the Locomotive picker at
    the top (previously silently stayed scrolled to wherever the Coal-car click had left it,
    since the reset also targeted the now-inert `.panel`).
  - `phase-6-train-panel.png`: scrolled-to-bottom shows Consist/Sell/Orders correctly.
  - `phase-3-city-panel.png`, `phase-3-industry-panel.png`, `phase-5-station-panel.png`,
    `phase-5-station-placement.png`: all clean, header/footer never overlapping body content, at
    both the 1280×720 (Phase 3's own viewport) and 800×360 sizes.
- Known issues / carry-over: the yearly report's ledger-row-value cutoff (the slide-in-transition
  timing bug) was a pre-existing issue in the *test*, not the panel — real play was never affected
  since a real player doesn't screenshot 100ms after a panel opens. The passenger/freight ratio
  dips slightly under 1× at the far end of the "12–20 tile" range (noted above, not chased
  further). Station improvements (buying an Engine Shed at a second station) are still Phase 9's
  job, so the chain/network balance tests force one onto extra hub stations directly rather than
  going through a real in-game flow that doesn't exist yet.
- `npm run check` and `npm run e2e` both green (190 unit tests, 26 e2e specs).
- Next: **Phase 8 — Eras and technology**.

## 2026-09-25 — Phase 8: Eras and technology

Delivered autonomously (background session; see CLAUDE.md's "push early and often" — pushed to
`main` after each coherent, green step rather than in one batch).

**Carry-over fix from the Phase 7.1 review (before starting Phase 8 proper).** The Finance panel's
"Yearly Report" footer button (`docs/screenshots/phase-7-finance-panel.png`, flagged in this
session's brief) still rendered mid-panel, overlapping later ledger rows, instead of pinned at the
bottom. Root cause: `.panel-actions` was still nested *inside* the scrolling `.panel-body`, relying
on `position: sticky` to fake staying put — the exact same class of bug the Phase 7.1 header fix
addressed, just not carried over to the footer. `position: sticky` only "sticks" once scrolled
*past* its natural flow position; on a panel whose content is much taller than the viewport
(Finance's ledger + chart), it painted at whatever pixel offset the current scroll happened to
imply, visually overlapping later siblings rather than sitting at the true bottom. Fixed by giving
`openPanel` (`src/ui/panel.ts`) a `footer` option rendered as a real flex sibling of `.panel-body`,
outside its scrollport — the same fix pattern as the header, this time applied consistently.
Updated all four callers (Finance, New Station, Buy Train, Train panel). Re-verified all seven
panels at 800×360; screenshots below confirm the fix (`phase-8-finance-panel-fixed.png`).

**Year-gated availability.** `locomotivesAvailableIn`/`buyableLocomotivesIn` (`src/data/trains.ts`)
— the latter is new, further excluding steam once phased out (see below), and is what the Buy
Train and Replace Locomotive pickers actually list now (previously the buy dialog could still show
a steam model post-1960 that would always fail to buy — a real gap this phase's testing surfaced
and fixed). Track/station era gates (electrification from 1905, bridge types by era, station
improvement eras) were already in place from earlier phases' data tables; this phase only added
Electrify's own gate.

**Electrify mode** (`src/sim/commands.ts` `computeElectrifyPlan`/`electrifyTrack`,
`src/sim/track/cost.ts` `electrifyCost`): drags along existing track — single *or* double, unlike
Double mode which only extends single track — via a new `existingAnyTrack` pathfind option
(`src/sim/track/pathfind.ts`). Era-gated from 1905 inside the command/plan (like Track mode's
bridge types), not by disabling the toolbar button, so the UI layout already matched SPEC before
this phase and just needed enabling. Electric-loco routing was **already implemented** from an
earlier phase (`src/sim/trains/route.ts`'s `RouteOptions.electric` filters non-electrified edges) —
this phase added the "Route not electrified" UI diagnostic: `isElectrificationOnlyBlocker` re-runs
the A* search once with the electrification constraint dropped, so the train panel can tell "stuck
because this specific line isn't wired" apart from a genuinely disconnected network.

**Catenary rendering** (`src/render/track.ts`): poles + wire on electrified edges, only at
zoom ≥ ~0.75 (the `tiesStyle` cached-raster path; at lower zoom track collapses to one plain line,
too small to read poles on). First pass was geometrically correct but visually invisible — the
poles' 6–9px offset landed right in among the tie marks (tie half-length ≈4.2px) instead of
clearing them, so the light-gray line blended into the busy tie/rail pattern and didn't read at any
screenshot resolution. Confirmed this diagnosis with a throwaway 5×-exaggerated render (clearly
visible), then dialed back to a legible-but-normal 16/20px single/double offset, thickened both
lines slightly, and darkened the palette colors for contrast against grass
(`GHOST_ELECTRIFY_COLOR`/`CATENARY_POLE_COLOR`/`CATENARY_WIRE_COLOR` in `src/render/palette.ts`).

**Breakdowns & aging** (`src/sim/trains/breakdown.ts`, `src/sim/trains/movement.ts`,
`src/sim/finance/ledger.ts`): monthly roll per SPEC §7.6's exact formula (base chance by
reliability × age factor × 0.5 Engine Shed service discount × difficulty multiplier). A new
`"broken"` train status freezes movement (keeps held blocks, so it still occupies its block like a
real stalled train) for a randomized 2–5 day repair, $5k era-scaled cost charged immediately,
pushes a `breakdown` news item. Obsolescence (+50% maintenance past 25 years, steam +50% past
1955 — the *higher* of the two applies, not both multiplied) and the 1960 steam phase-out
(`STEAM_PHASE_OUT_YEAR`) are in `computeBuyTrainPlan`/`buyTrain`/`monthlyFinanceStep`. **Replace
Locomotive** (`computeReplaceLocoPlan`/`replaceLocomotive`): 30% trade-in of the old loco's current
era-adjusted price, −3%/year of age, 10% floor; keeps cars/orders, resets the train's age/service
clock to the new locomotive's. UI: a "Replace" button on the train panel opens a picker
(`openReplaceLocoPanel` in `src/ui/trainPanels.ts`).

**Water Tower** (`src/data/stations.ts` `WATER_TOWER_COST`, `computeWaterTowerPlan`/
`buildWaterTower` in `src/sim/commands.ts`): buildable from the station panel. Steam locomotives
accumulate `tilesSinceWaterTower`; past 40 tiles without a refill stop they lose 20% speed
(`computeTargetSpeed`'s new `conditionFactor` in `src/sim/trains/movement.ts`) until they next stop
at a station that has one. Diesel/electric never accumulate this at all. This is the one piece of
SPEC §6.2's improvement roster pulled into this phase — the rest (Hotel, Warehouse, Post Office,
...) stays Phase 9's job as PLAN already scoped it.

**Wooden bridge washouts** (`src/sim/track/washout.ts`): rolled once per wooden bridge edge at
each year boundary, 1%/year (`WOODEN_BRIDGE_WASHOUT_CHANCE_PER_YEAR`, already defined in
`src/data/track.ts` from an earlier phase in preparation for this one). Removes the edge, reduces
`capitalInvested` (same net-worth treatment as bulldozing), bumps `trackVersion` so affected trains
reroute — `stepTrain`'s existing "track destroyed under the train mid-journey" recovery (added for
bulldoze) already handles a train caught on a just-washed-out edge without any changes needed.
Pushes a `washout` news item.

**News system** (`src/sim/news.ts`, `src/ui/newsPanel.ts`): `GameState.news` capped at
`NEWS_HISTORY_MAX` (200, oldest dropped first), a `pendingNews` queue drained once per frame for
toasts (same pattern as `pendingDeliveries`), and `newsReadUpTo` for the unread badge. Kinds:
`newLocomotive`, `breakdown`, `washout`, `trafficJam`, `noRoute` — the last two replace the ad-hoc
`Set`-based "stuck train" toast tracking that lived directly in `main.ts` since Phase 6/7; it's now
sim-driven (pushed at the exact status transition inside `movement.ts`) and covers a case that
ad-hoc code never did (no-route, not just traffic jams). A bottom-right News button (SPEC §10.1,
stacked above the existing Trains button) shows an unread-count badge; opening the panel marks
everything read. `formatNewsItem` resolves current train/station names from live state at display
time rather than baking text in at push time, so a renamed/sold train's older news still reads
sensibly (falls back to "?").

**Real bug this phase's testing caught and fixed**: the yearly "new locomotive" news + yearly
report tech card originally fired a full year late — it checked the year that had just *ended*
(`year - 1` at the boundary) rather than the year the calendar had just rolled *into*, so a model
was already purchasable for an entire year before the player was ever told about it. Screenshot
evidence in the session's own long-run test caught this immediately (expected 1905, got 1906).
Fixed in `src/sim/tick.ts` (`newlyAvailableLocomotives` now keyed by the year that just started)
and `src/ui/yearlyReport.ts` (the tech section now looks up `year + 1` relative to the report's own
`year` variable, since the report's ledger data and its tech section are one calendar year apart in
this scheme — documented inline since it's easy to get backwards again).

**"New!" badges & yearly report tech section**: any locomotive within `NEW_LOCOMOTIVE_BADGE_YEARS`
(3, a judgment call — SPEC doesn't specify a window) of its intro year gets a badge in the Buy
Train/Replace Locomotive pickers. The yearly report gets a "New technology" section listing every
model introduced in the year it's reporting on it (year+1 relative to the ledger, per the above).

**SPEC deviation, `src/data/cargo.ts`**: `passengers.baseRate` 1,400 → 1,650 (+18%). The new
monthly breakdown roll draws from the same shared seeded RNG stream as industry/city growth
(`monthlyIndustryStep` already did before this phase); adding any new monthly `nextFloat` consumer
shifts every subsequent probabilistic draw for the rest of a run, even on ticks where the
breakdown itself doesn't fire. This knocked `tests/sim/balance.test.ts`'s fixed-seed passenger
route and passenger/freight-ratio checks (both un-touched by breakdowns directly) outside their
Phase 7.1-tuned $80k–$200k / 1×–2.5× windows, purely from city growth landing slightly differently
for that one seed. Retuned the constant (not the formula, not the test's target range) per this
repo's own documented convention in that test file for exactly this situation, verified against
all seven balance tests plus the rest of the suite.

**Tests** (`npm run check`: 206 unit tests, all green): `tests/sim/trains/eras.test.ts` (era
availability, steam phase-out at/past 1960, trade-in value including the age floor, a statistical
test of the breakdown formula's reliability-base-chance and Engine-Shed discount, the Electrify
command's era gate and idempotent re-drag), `tests/sim/trains/route.test.ts` (added
`isElectrificationOnlyBlocker` cases), and `tests/sim/longRun.test.ts` — a synthetic two-train
freight route ticked hour-by-hour from 1830 to 1961 (~2.7s wall-clock; "8× speed" just means many
ticks per real second at the UI level, the sim's own granularity is always 1 tick = 1 hour per
SPEC §3) asserting: never throws; every diesel/electric model's news fires in its exact SPEC §7.7
intro year (checked against an unbounded test-side news log, decoupled from `state.news`'s own
200-item cap); steam is live-rejected past 1960 via `buyTrain`/`computeBuyTrainPlan` on the
actually-evolved state; and both `state.news` and `state.finance.netWorthHistory` stay within
their caps across 131 years, rather than growing unbounded.

**Screenshots** (`e2e/eras.spec.ts`, all reviewed at 800×360):
- `phase-8-electrified-line-zoom2.png`: Electrify mode's real drag+confirm UX (not a debug
  shortcut) on a built line, then an Early Electric loco running on it at zoom 2 — catenary poles
  visible below the track, pantograph mark on the loco.
- `phase-8-diesel-train-zoom2.png`: a Streamliner Diesel at zoom 2, its colored hood-unit shape
  clearly distinct from steam/electric (no catenary needed/rendered — correct, track isn't
  electrified).
- `phase-8-breakdown-indicator.png`: a deterministically-forced breakdown (the probabilistic monthly
  roll itself is covered by `eras.test.ts`'s statistical tests, not screenshot-suitable) — 🔧 icon
  over the stalled train, the "Train 1 has broken down and is being repaired" toast, and the News
  button's unread badge all visible together.
- `phase-8-news-panel.png`: opened from that same breakdown, showing the history list.
- `phase-8-yearly-report-tech.png`: the exact 1905 boundary — both Pacific 4-6-2 (Steam) and Early
  Electric intro that year, so two tech cards render; confirms the year-boundary timing fix above
  (title correctly reads "1904 Year in Review" while announcing 1905's new tech, per the
  report/announcement offset documented in `yearlyReport.ts`).
- `phase-8-finance-panel-fixed.png`: the panel-footer fix from the top of this entry, re-verified.

**Debug hooks added** (`src/main.ts`, `e2e/gameWindow.ts`, test-only): `electrifyTrackPath`
(mirrors the existing `buildTrackPath`) and `electrified` on `getTrackEdges()`.

**Known issues / deferred**: city-growth news (SPEC's news list mentions it) isn't emitted — no
city growth model exists yet; that's explicitly Phase 9's job per PLAN.md, and this phase's news
`kind` union can just grow a `cityGrowth` variant when it lands. Station improvements beyond Water
Tower (Hotel, Warehouse, Post Office, Cold Storage, Freight Yard, Livestock Pens) are unbuilt,
also Phase 9's job per PLAN.md's own phase boundary — Water Tower was pulled forward only because
the steam speed-penalty rule is explicitly in this phase's scope. `NEW_LOCOMOTIVE_BADGE_YEARS = 3`
and the news history cap of 200 are both judgment calls where SPEC doesn't give a number.

- `npm run check` and `npm run e2e` both green (206 unit tests, 31 e2e specs).
- Next: **Phase 9 — Upgrades and growth**.

## 2026-09-25 — Phase 9: Upgrades and growth

Delivered autonomously (background session, CLAUDE.md's "push early and often" — pushed to `main`
after each coherent, green step). Confirmed PROGRESS.md/`main` were at Phase 8 before starting.

**Station improvements** (SPEC §6.2's remaining roster — Engine Shed/Water Tower already existed
from Phases 6/8 with their own bespoke fields). `src/data/stations.ts` adds
`STATION_IMPROVEMENT_TYPES`/`STATION_IMPROVEMENTS` (cost, era gate, description) and the per-effect
multiplier constants; `Station.improvements: StationImprovementType[]` (`src/sim/stations/types.ts`)
holds which ones are built. One generic command, `buildImprovement`/`computeImprovementPlan`
(`src/sim/commands.ts`), handles all six — era-gated (Cold Storage 1880, Freight Yard 1870),
once-per-station, refreshes station economy afterward (Post Office changes supply). Effects, each
wired at its actual point of use rather than as a side lookup table:
- **Post Office**: +50% mail supply (`stations/economy.ts`, a final pass after the normal
  supply/split computation); +25% mail revenue *for mail loaded there* (`trains/loading.ts`
  `applyUnload` looks up the car's `loadedTile`'s station, not the delivering one).
- **Hotel**: +25% passenger revenue *delivered there* (the unloading station, not loaded-at); +20%
  city growth contribution for passengers/mail delivered there (see growth section below).
- **Warehouse**: storage ×2 and exempts everything from waiting-cargo decay.
- **Cold Storage**: exempts food/livestock from decay; +15% revenue for food/livestock *loaded
  there*.
- **Freight Yard**: halves the loading/unloading dwell multiplier (on top of the station type's own).
- **Livestock Pens**: gates the "auto"/"fullLoad" loading loop in `planLoadUnload` — without it,
  livestock cars simply never enter the load list at that station (unloading elsewhere is
  unaffected).
`src/sim/stations/improvements.ts` centralizes the three effects (storage cap, decay exemption, load
speed) that other modules (`cargoFlow.ts`, `loading.ts`) need to query rather than duplicating
`station.improvements.includes(...)` checks everywhere.

**City growth** (SPEC §8.3). New `src/sim/economy/cityGrowth.ts`: `accrueCityGrowthScore` is called
from `loading.ts`'s `applyUnload` on every delivery of passengers/mail/food/goods/fuel, splitting the
score across whichever cities the delivering station's catchment covers (the same coverage concept
§6.3 already uses for supply/acceptance splitting) — passengers/mail weight 1×, food/goods/fuel 3×,
per SPEC's formula, with Hotel's +20% applied to the passengers/mail term only. `monthlyCityGrowthStep`
(called from `tick.ts` at the month boundary) folds that score (or, if under
`CITY_SERVED_SCORE_THRESHOLD`, a slow population-proportional baseline — SPEC's "0.2%/year") into a
running `points` balance; once `points` crosses `population × CITY_GROWTH_THRESHOLD_FACTOR`, it fires
a growth step: population ×= 1.05, one new footprint tile (BFS one ring out from the existing
footprint, deterministic via the game's own seeded RNG — same style as map-gen's own footprint
grower in `economy/cities.ts`, but mutating the live map instead of a throwaway `claimed` array), and
a tier check (`maybeAdvanceTier`, never downgrades) that pushes a `cityGrowth` news item on a bump —
`"<city> has grown into a <tier>!"` per the review's exact wording. The threshold scaling with
population is what keeps growth bounded without an explicit decay (a bigger city needs
proportionally more delivered cargo to keep growing); `CITY_POPULATION_CAP` (metropolis's own max,
400k) is a hard backstop regardless. **Civic Investment** (`computeCivicInvestmentPlan`/
`civicInvestment` in `commands.ts`): validates the city is "connected by rail" (some station's
catchment covers one of its tiles — same coverage concept again), costs
`$100k × tier rank (1-4) × eraInflation`, once per `CIVIC_INVESTMENT_COOLDOWN_YEARS` (5) per city,
applies +15% population + one growth-step's worth of footprint/tier check, and pushes its own news
item. City panel (`ui/infoPanels.ts`) now shows a growth trend row (from `CityGrowthState.lastServed`)
and a Civic Investment button with a live cost or a "`Available again in Ny`" countdown.

**Judgment call / retuning**: `CITY_GROWTH_THRESHOLD_FACTOR` started at `8` (a size-scaled but
otherwise made-up number) and turned out to be wildly unreachable — the long-run test's single
one-car passenger shuttle only accrues on the order of a few hundred growth points a year, so a
40,000-population city's first threshold (320,000 points) would've taken over two millennia.
Retuned to `0.05` by working backward from "a single modest passenger route should visibly grow a
city at least a little over a full 1830-1960 game" (see the long-run test below) rather than any
principled derivation — SPEC gives no target growth rate, so this is a pure judgment call, and a
network with many more trains/cars feeding a city will grow it correspondingly faster (and cap out
at the metropolis ceiling sooner), which seems like the right shape even if the exact constant is a
guess.

**Industry dynamics** (SPEC §8.2), `src/sim/economy/industryDynamics.ts`, called from `tick.ts`
right after `monthlyIndustryStep`. Growth/shrink only applies to the six raw (terrain-placed)
producers SPEC names (Coal/Iron Mine, Logging Camp, Farm, Ranch, Oil Well) — processors and Port
already track delivered inputs directly. **Deviation**: SPEC's "served ≥50% of output picked up
over the last 12 months" would need a new rolling per-industry pickup log; instead this reuses
`StationCargoPile.waitingDays`, which a covering station already resets to 0 on every load
(`trains/loading.ts` `applyLoad`) and otherwise climbs unbounded (an unserved pile sits pinned near
its storage cap forever — see `cargoFlow.ts` — so nothing else ever resets it), checked against a
`INDUSTRY_SERVED_WAITING_DAYS_THRESHOLD` (12) *this* month rather than a trailing 12-month window.
Simpler, no new state, same underlying idea ("is something actively drawing this pile down"), and
covered by `tests/sim/economy/industryDynamics.test.ts`'s bounds test running 500 simulated months
both ways. Served → 3%/month chance to multiply `growthMult` by 1.2 (capped at 3×); unserved → 1%/month
×0.8 (floored at 0.5×) — `processing.ts`'s raw-producer branch now scales `produces` by this before
handing it to `stationEconomy` as monthly supply. New-industry spawning: 0.5%/month, picks a random
terrain-placeable type valid for the current year, scans the whole map for a legal empty tile
(respecting the same same-type spacing map-gen placement uses), and — **deviation** — biases toward
"near any city" rather than SPEC's "near *served* cities", since served-city status is this same
month's own city-growth pass and depending on its ordering felt fragile; "near a city" is a
reasonable proxy and much simpler.

**Overlays** (SPEC §10.2), `src/render/overlays.ts`, toggled from a new ☰ menu
(`src/ui/menuPanel.ts`) — pure client-side presentation state in `main.ts` (`OverlayState`), not
`GameState`, matching every other UI-only toggle (`quickBuild`, `currentTool`) already in this
codebase:
- **All catchments**: tints every built station's catchment (reusing `stationCatchmentTiles`, the
  same helper the single-station placement preview already used).
- **Cargo supply heatmap**: pick a cargo from a chip row; tints each station's catchment by its
  `supply[cargo]`, using that cargo's own color (same palette waiting-cargo bars/delivery labels use).
- **Track type colors**: flat single/double/electrified line colors, independent of (and more
  visible at low zoom than) the normal track renderer's own subtler tie/catenary rendering.
- **Train profit colors**: no full per-train P&L exists (attributing track/station upkeep to
  individual trains would need a lot more bookkeeping), so this is a deliberate proxy — a new
  `Train.lifetimeRevenue` (accumulated on every delivery) divided by the train's age in days, compared
  against its locomotive's daily maintenance cost. Green/red/neutral, neutral for anything under 30
  days old (too new to judge). Drawn as a colored ring under the train sprite.

**Mini-map** (SPEC §10.1), `src/render/minimap.ts`: drawn directly into the main game canvas in
screen space rather than a separate DOM canvas. A small offscreen bitmap (terrain water/land +
city-tile tint + track lines) is cached and only rebuilt when `trackVersion`/`mapContentVersion`
change, not every frame; the viewport rectangle and station dots redraw per frame (both cheap).
Tap-to-jump is handled in `main.ts`'s existing `handleTap` (checked first, before train-hit-testing
or station taps). **Placement fix caught by its own screenshot**: initially placed at `left:8px`
bottom-left, the same column the build toolbar (`left:8px`, full height top-to-bottom on this game's
short landscape viewport) already occupies — `docs/screenshots/phase-9-station-improvements-zoom2.png`'s
first draft showed the mini-map drawn right on top of the toolbar's Bulldoze/Info buttons. Moved to
start past the toolbar's ~56px column (`left:68px`, matching the existing debug seed/size controls'
own "clear of the toolbar" convention) — confirmed clear in the final screenshots.

**Carry-over fixes from the Phase 8 review**:
- Floating bottom-right buttons (News/Trains/Quick-build) showing through/on top of open panels
  (`phase-8-finance-panel-fixed.png`'s faint "News"/"Trains" text bleeding through the panel's 0.92-
  alpha background): now hidden outright (`display:none` via a `.floating-hidden` class) whenever
  `isPanelOpen()`, checked once per render frame in `main.ts`, rather than relying on z-index/opacity
  to fully occlude them. Also gave them a fully solid background (`#181c22`) instead of the
  translucent one, removing the underlying bleed-through mechanism too.
- Station label rendering under the News button (`phase-8-electrified-line-zoom2.png`): station/city
  labels (`render/stations.ts`, `render/labels.ts`) now take a `reserved: ReservedScreenRect[]`
  param (new `render/reservedRects.ts`) and skip drawing entirely — measuring the label's actual text
  width first — if its bounding box would intersect a reserved rect. `main.ts` computes those rects
  each frame from the floating buttons' and mini-map's real `getBoundingClientRect()`/`screenRect()`,
  so it stays correct as buttons show/hide rather than a hardcoded corner box.

**Station graphics** (`src/render/stations.ts`): each active improvement (plus Engine Shed/Water
Tower) now draws a small distinct marker (envelope for Post Office, a peaked-roof block for Hotel, a
barn shape for Warehouse, a snowflake-dotted box for Cold Storage, paired siding lines for Freight
Yard, a fenced square for Livestock Pens, a tank-on-a-stalk for Water Tower, a shed+wheel for Engine
Shed) in a row below the station building, from zoom ≥ 1 — confirmed legible in
`phase-9-station-improvements-zoom2.png`.

**Debug hooks added** (`src/main.ts`, `e2e/gameWindow.ts`, test-only): `buildImprovement`,
`civicInvestment`, `getCityGrowth`, `getOverlayState`/`setOverlay`/`setHeatmapCargo`,
`getMiniMapRect`/`tapMiniMap`, `camera.getCenter`; `getStations()` now also reports
`hasWaterTower`/`improvements`. `debugPlaceIndustry`/`debugPlaceCity` now bump
`mapContentVersion` — without it, a debug-injected industry/city sat outside the terrain chunk cache
until something else happened to invalidate it and silently didn't render (caught by the city-growth
screenshot test's own "before" shot initially showing no city at all).

**A pre-existing e2e flake found and fixed while testing this phase**: `economy.spec.ts`'s "train
panel shows the current load of each car" clicked a train at its snapshotted tile position after a
couple of real-time waits (camera centering, panel-open timing) — with the sim clock still ticking at
1x during those waits, a fast train could drift just far enough to slip outside `findTrainAt`'s hit
radius, an intermittent miss unrelated to what the test actually checks. This phase's own changes
happened to shift timing just enough to make it fail consistently rather than intermittently, which
is what surfaced it. Fixed by pausing the sim (`setSpeed(0)`) before locating/clicking the train,
rather than skipping or loosening the test.

**Tests** (`npm run check`: 224 unit tests, all green): `tests/sim/stations/improvements.test.ts`
(each improvement's effect, era gating, cost table), `tests/sim/economy/cityGrowth.test.ts`
(threshold crossing with footprint+tier+news, the population cap, score attribution/splitting, Civic
Investment's connection gate/cost/cooldown), `tests/sim/economy/industryDynamics.test.ts` (growthMult
bounds under 500 simulated months of sustained growth and sustained shrink, and new-industry
spawning). `tests/sim/balance.test.ts` gained a Phase 9 guard: a fully-improved coal route (every
applicable improvement on both stations, 1880 so era-gated ones qualify) earns more than the
unimproved baseline but stays within 1.5× its two-year profit — passes with real margin.
`tests/sim/longRun.test.ts` extended with a served two-city passenger shuttle running the full
1830-1961 span: both cities' population grows >15% and their footprint grows beyond the starting 4
tiles, while staying at/under the metropolis population cap and keeping `cityGrowth` map size sane —
"grows when served, stays bounded" as the review asked for.

**Screenshots** (`e2e/upgrades.spec.ts`, all reviewed at 800×360):
- `phase-9-station-improvements-zoom2.png`: a station with 5 improvements built, each marker legible
  in a row below the platform.
- `phase-9-city-before-growth.png` / `-after-growth.png`: a village-tier city (a handful of small
  roofs) before, the same city after a forced growth tick — visibly larger footprint, "Town" tier,
  and the "Ashtown has grown into a Town!" toast + unread News badge both caught in the after shot.
- `phase-9-city-panel-civic-investment.png`: the City panel's Tier/Population/Growth rows and the
  Civic Investment section.
- `phase-9-city-civic-investment-cooldown.png`: same panel right after investing — population up
  50k→58k, cash down by the ~$552k charged, and the toast + the button now showing its cooldown
  instead of a price (the reviewer's "clear feedback" ask).
- `phase-9-minimap.png` / `-after-jump.png`: the mini-map bottom-left, clear of the toolbar; a
  corner-tap moved the camera to the opposite side of the map (the after shot happens to land near
  the map edge — expected, since the tap targeted the mini-map's own far corner).
- `phase-9-overlay-{catchments,cargoHeatmap,trackType,trainProfit}.png`: each overlay individually
  toggled and screenshotted; the heatmap test places a real coal mine so there's nonzero supply to
  actually tint (a supply-less "coal" car alone, as first tried, correctly renders nothing).
- `phase-9-finance-panel-buttons-hidden.png`: confirms the News/Trains/Quick-build buttons are gone
  (not just faded) while the Finance panel is open.

**Known issues / deferred**: `CITY_GROWTH_THRESHOLD_FACTOR`, the industry-dynamics served-window
simplification, and the "near any city" spawn bias are all judgment calls flagged above where SPEC
under-specifies exact numbers/behavior — revisit if playtesting says growth feels too fast/slow.
Civic Investment's cost is charged to the `construction` ledger category for lack of a better fit
(SPEC's ledger categories don't have a dedicated "civic" bucket).

- `npm run check` and `npm run e2e` both green (224 unit tests, 37 e2e specs).
- Next: **Phase 10 — Real-world maps and the new game screen**.

## Phase 10.1 — mapgen pipeline + region loader + us-east (in progress)

**Network**: `cdn.jsdelivr.net` (the Natural Earth GeoJSON host SPEC §4.3 names) is blocked by this
environment's egress policy — confirmed via `curl -sS "$HTTPS_PROXY/__agentproxy/status"`, which
logged `connect_rejected: gateway answered 403 to CONNECT (policy denial or upstream failure)` for
`cdn.jsdelivr.net:443`, not a config/cert problem. Per SPEC's own fallback and this phase's task
brief, `tools/mapgen` uses **hand-authored simplified coastline/lake/river polygons** exclusively —
no live-fetch code path was written at all (untestable code in this environment would just be dead
weight); if a future session has network access, add a `tools/mapgen/fetch.ts` that downloads and
caches the three GeoJSON files under `tools/mapgen/.cache/` (already gitignored) and rasterizes
those instead of `RegionDef.land/lakes`.

**Pipeline** (`tools/mapgen/`, run via `npm run mapgen -- <regionId>`):
- `regionDef.ts`: the author-time format — bounds+grid size, start year, seed, hand-drawn land/lake
  polygons and river polylines (lon/lat), mountain ridges (polyline + peak elevation + influence
  radius in tiles), resource zones (which raw industry types are allowed where), optional arid
  zones, and the city list (name/lon/lat/tier/population/optional foundingYear).
- `geo.ts`: equirectangular projection (region bounds → tile space) and point-in-polygon /
  point-to-polyline-distance / polyline rasterization helpers. Each region's grid width/height is
  chosen up front (in its `regions/<id>.ts`) to match `(east-west)·cos(centerLat) / (north-south)`
  so the projection doesn't stretch coastlines — no cos-lat term needed at query time once that's
  baked into the aspect ratio.
- `build.ts`: rasterizes land (minus lakes) tile-by-tile at tile *centers*; elevation = max over
  mountain features of `peakElevation × falloff(distance/radius)`, plus low-amplitude fractal noise
  for texture (`src/sim/map/noise.ts`, reused as-is); terrain classification reuses
  `classifyTerrain` (now exported from `src/sim/map/generate.ts`) so regions and random maps agree
  on thresholds; rivers are rasterized polylines that overwrite land tiles as `river` terrain and
  cap elevation along their course (SPEC: "rivers pull elevation down").
- `cities.ts` / `industries.ts`: cities snap to the nearest buildable land tile (hand-drawn
  coastlines are imprecise, so an exact lon/lat can land just offshore) and grow a footprint via
  the random generator's own `growFootprint`/`isCoastal` (now exported from
  `src/sim/economy/cities.ts`) — reused, not reimplemented, so regions and random maps size
  footprints identically. Raw industries reuse the terrain-affinity lists from `data/industries.ts`
  but restrict placement to a region's resource zones when the type is zoned (e.g. `coalMine` only
  in the Pennsylvania zone) and fall back to region-wide placement otherwise; processors/ports reuse
  `placeProcessorsAndPorts` (now exported from `src/sim/economy/industries.ts`) unchanged.
- `index.ts`: CLI entry, writes `src/data/regions/<id>.json`.
- Runs via **`tsx`** (added as a dev-only dependency — devDependency, not shipped in the app
  bundle). Node's own native TypeScript stripping (`--experimental-strip-types`) was tried first
  since it needs no new dependency, but it requires explicit `.ts`/`.js` extensions on every
  relative import (confirmed empirically), which the rest of this codebase's bundler-style
  extensionless imports don't use — rewriting every `src/sim`/`src/data` import for one CLI tool
  wasn't worth it. `tsx` resolves extensionless imports like Vite does.

**Committed format** (`src/sim/regions/types.ts`): terrain/elevation packed as base64 `Uint8Array`,
the continuous pre-quantization elevation (needed for hillshading, SPEC's render layer) packed as
base64 fixed-point `Int16` (×10000) rather than raw `Float32`, halving that field's size. Rivers are
stored as ordered tile-index chains (source→mouth) rather than a full `riverNext`/`riverFlow`
array — the loader (`src/sim/regions/load.ts`) reconstructs those two GameMap fields from the
chains deterministically. `us-east.json` is 127 KB (budget: <300 KB).

**GameState changes**: `NewGameOptions` is now a discriminated union — `RandomNewGameOptions`
(existing shape, `region` absent) or `RegionNewGameOptions` (`{seed, region, startYear?,
difficulty?}`). `createGameState` branches on `options.region`. Added `GameState.regionId?` and
`GameState.pendingCityFoundings: PendingCityFounding[]` (always `[]` on a random map) — a city
whose `foundingYear` is still in the future loads with `tiles: []`/`population: 0` and an entry in
`pendingCityFoundings` carrying its target tiles/population; **the tick-time code that applies a
founding and fires the news toast is Phase 10.6's job** (goals + founding-year cities), not this
step — for now a future city simply doesn't exist yet, which is already covered by an e2e test.
`City` gained an optional `foundingYear?: number`.

**us-east** (bounds fixed by SPEC's table: −92…−68 lon, 29…46 lat; grid **160×142**, chosen to match
the region's true aspect ratio, `(24°·cos(37.5°))/17° ≈ 1.12 ≈ 160/142`). 25 cities per SPEC's list,
real lon/lat, populations from 1830 census figures (or the village-tier floor of 1,000 where the
real 1830 figure was smaller, e.g. Chicago's actual ~350 and Cleveland/Detroit's low hundreds—
picking a real number below the game's own village floor would just be silently clamped-looking
without explanation, so the floor is used directly and it's noted here instead). **Chicago**
(founded 1833) and **Atlanta** (founded 1837, as "Terminus"/Marthasville) carry `foundingYear`, per
the task brief's example. **Deviations** (both because the real location is outside `us-east`'s
SPEC-fixed bounds): "Mesabi iron" (Minnesota, ~lat 47.3-47.9, north of the lat-46 edge) →
substituted with an eastern-Ohio/western-PA iron zone; "Texas oil" (west of the lon-92 edge) →
substituted with the historical Pennsylvania oil zone (Oil Creek/Titusville, the first US
commercial well, 1859). Lake Superior is also outside the fixed bounds (its south shore is ~46.5-47N)
— Michigan/Huron/Erie/Ontario are all drawn.

A real city's exact hand-authored coastline snap-to-land, plus two real cities close enough for
their footprints to touch (Baltimore/Washington, ~4 tiles apart at this resolution), surfaced a
real bug: `growFootprint` unconditionally claims its anchor tile even if another city already
claimed it — fixed in `tools/mapgen/cities.ts` by nudging a city's anchor to the nearest *unclaimed*
buildable tile before calling it (a mapgen-only concern; `growFootprint` itself, shared with the
random generator where `CITY_MIN_SPACING=8` already prevents this, is untouched).

**Screenshots** (`e2e/regions.spec.ts`, 800×360, reviewed):
- `phase-10-us-east-overview.png`: zoom 0.25 (SPEC's overview threshold), centered on the map's
  geometric middle — the 800×360 phone viewport at 0.25× shows ~100×45 of the map's 160×142 tiles,
  so this one shot is a crop, not the whole region (same limitation every other phase's overview
  screenshot has on a Medium/Large map). What's visible: Chesapeake Bay's notch, the Atlantic coast
  from NJ down past Norfolk, Washington/Baltimore/Philadelphia, Charleston/Savannah further south.
  A **wider (1400×1100, not committed) inspection screenshot** was also taken to judge the whole
  region and is genuinely recognizable: Great Lakes correctly shaped and positioned, Chesapeake Bay,
  the Appalachian upland as a visible darker band from Pittsburgh down through Nashville, the
  Atlantic coast curving from Montreal/Boston down to Savannah, and (in a second wide shot) the
  Mississippi/Ohio confluence and Gulf coast toward Florida. At zoom 0.25 (overview style) rivers
  aren't drawn — that's the existing renderer's overview simplification (SPEC §4.1: "no per-tile
  detail" below zoom 0.5), not a regression.
- `phase-10-us-east-closeup.png`: zoom 2 on New York — a large, dense multi-block metropolis
  footprint right on the water, clearly distinct from a random map's villages.

**Tests**: `tests/mapgen/build.test.ts` (determinism — two builds of the same `RegionDef` are
byte-identical; <300 KB; every city within 1.5 tiles of its projected lat/lon; every city anchor on
non-water/non-mountain terrain; no two cities' footprints overlap; river chains well-formed; no
NaN/out-of-range elevation). `tests/sim/regions/load.test.ts` (JSON → GameMap sizing; founded vs.
pending cities; `createGameState` with a region vs. a random map). `e2e/regions.spec.ts` (loads,
screenshots, Chicago absent pre-1833). Existing 224 unit tests and 37 e2e specs still green —
`tests/sim/track/helpers.ts`'s hand-built `GameState` fixture needed `pendingCityFoundings: []`
added for the new required field.

- `npm run check` (236 unit tests) and the full `npm run e2e` (39 specs) both green.
- Next: **gb region** (Phase 10.2).

## Phase 10.2 — gb region

**gb** (bounds fixed by SPEC's table: −6.5…2 lon, 50…56.5 lat; grid **112×144**, matching
`(8.5°·cos(53.25°))/6.5° ≈ 0.78 ≈ 112/144`). Aberdeen (real lat ≈57.15) is excluded per SPEC's own
"(may be off map)" caveat in its city list — it's north of this region's fixed lat-56.5 edge, so the
other 18 SPEC-listed cities are included. Populations from ~1830 figures; London and Glasgow are
both well past the game's 400k metropolis ceiling in reality (London ~1.66M, Glasgow ~202k is
actually within range) — London is clamped to the tier max (400,000) rather than silently
overflowing it. No founding-year cities in this region (unlike us-east's Chicago/Atlanta, every
SPEC-listed GB city already existed by 1830). Mountains use SPEC's own example peak elevations
verbatim (Pennines 3, Scottish Highlands 5) plus an added Cambrian Mountains range (Wales, elevation
4, not in SPEC's list but needed for Wales to read as upland rather than flat). Resource zones: South
Wales coal, a combined Yorkshire/Midlands coal-and-iron zone (Sheffield's historical steel industry),
a Scottish Central Belt coal-and-iron zone (Glasgow), and an East Anglia farm zone (Norwich). Rivers:
Thames (through London) and Severn (Bristol Channel).

**Bug found while authoring the coastline**: the Bristol Channel notch (carving water between South
Wales and South-West England) was drawn too wide, and its "return" boundary (the Wales-side shore)
passed south of Cardiff's real coordinates — so Cardiff's projected point landed 2.9 tiles out in
open water and snapped to the nearest unrelated land, nowhere near its real site. Not a code bug
(the point-in-polygon/rasterization logic checked out — verified there's no self-intersection in the
coastline ring via a segment-pairwise check, and a flood-fill connectivity check confirmed the
landmass is a single connected component, no phantom islands), just an imprecise hand-drawn
coordinate — fixed by narrowing the notch and pulling its Wales-side shore north of Cardiff's
latitude. General lesson carried into the remaining regions: after drawing a coastline, check every
city's snap distance (`buildRegion` + `project`) before trusting the map, not just eyeballing the
rendered preview.

**Screenshots** (`e2e/regions.spec.ts`, 800×360): `phase-10-gb-overview.png` (zoom 0.25, centered on
the map's middle — Manchester/Liverpool west, Leeds/York/Hull northeast, Sheffield/Nottingham south,
Birmingham further south, all in correct relative positions; the GB outline is also visible whole in
the mini-map thumbnail in-shot, and does read as Great Britain's shape). `phase-10-gb-closeup.png`
(zoom 2 on London) — a large city footprint with the Thames running through it, clearly recognizable.

**Tests**: `tests/mapgen/build.test.ts` was refactored to run its per-region checks (determinism,
size budget, city placement accuracy, on-land anchors, no footprint overlap, river validity, no
NaN/out-of-range elevation) against a `REGIONS` array instead of duplicating a describe block per
region — gb and any later region just get added to that array. `tests/sim/regions/load.test.ts`
gained a `loadRegion(gb)` case (no pending foundings, unlike us-east). `e2e/regions.spec.ts` gained
the gb load/screenshot test.

- `npm run check` (246 unit tests) and the full `npm run e2e` (40 specs) both green.
- Next: **central-eu region** (Phase 10.3).

## Phase 10.3 — central-eu region

**central-eu** (bounds fixed by SPEC's table: 5…20 lon, 44…54 lat; grid **142×144**, matching
`(15°·cos(49°))/10° ≈ 0.98 ≈ 142/144`). Mostly landlocked — the only coastline in bounds is the
northern Adriatic near Venice/Trieste, carved as a `lakes` polygon kept south/west of both cities so
they stay coastal-but-on-land. 25 SPEC-listed cities, no founding-year cities (all existed by 1840).
Every city landed within 0.7 tiles of its projected position on the first try this time — the
snap-distance check written for gb's Cardiff bug caught nothing to fix here.

**The Alps** are one continuous ridge (SPEC's own example elevation, 9) arcing from the western Alps
near Turin through Switzerland, South Tyrol/Innsbruck, and the Austrian Alps to the Julian Alps near
Ljubljana — `radiusTiles: 11` gives it real breadth without swallowing Innsbruck, Salzburg, Zurich,
or Ljubljana (all snap to non-mountain terrain, verified). A wide (1400×1100, not committed)
inspection screenshot confirms it reads as an obvious, continuous mountain barrier separating
Italy (Milan/Turin/Venice/Genoa) from the German/Austrian side (Munich/Salzburg/Vienna/Graz), with
Ljubljana and Zagreb correctly placed near its eastern end approaching the Adriatic, and Trieste
right on the coast. Danube (Vienna, Budapest) and Rhine (Basel, Strasbourg, Cologne) added as bonus
rivers for recognizability (not required by the task brief for this region, but cheap given the
pipeline already exists). Resource zones: Ruhr coal, Silesia coal, Styria iron (Graz).

**Deviation**: the task brief's own example suggests "Vienna/Berlin cities" (not metropolis) — both
are capped at the city tier's ceiling (150,000) rather than their real ~330-400k 1840 populations,
following that guidance over strict historical accuracy (their real sizes would otherwise make them
this region's third and fourth metropolis, on top of already using that tier nowhere here — no city
in this region reaches metropolis, unlike us-east/gb). Trieste (realistically ~50k by 1840, a
significant Habsburg free port) is similarly kept at the town tier's ceiling (25,000) per the brief's
"Trieste town" example.

**Bundle size note**: `npm run build` now warns that the main JS chunk exceeds 500 KB — each
region's JSON is statically imported (`src/sim/regions/index.ts`) so all shipped regions bundle into
the app upfront rather than loading on demand. Not fixed now (would mean making `createGameState`'s
region path async, which ripples into `main.ts`'s `regenerate` and the New Game screen this phase
still has to build) — left as a candidate for Phase 12 (Performance and release hardening), which
already covers this kind of thing.

**Screenshots** (`e2e/regions.spec.ts`, 800×360): `phase-10-central-eu-overview.png` (zoom 0.25,
Frankfurt/Prague/Nuremberg/Munich/Salzburg all correctly relatively positioned).
`phase-10-central-eu-closeup.png` (zoom 2 on Vienna, the Danube running through it).

**Tests**: `central-eu` added to `tests/mapgen/build.test.ts`'s shared `REGIONS` array and to
`tests/sim/regions/load.test.ts` and `e2e/regions.spec.ts`, same pattern as gb.

- `npm run check` (254 unit tests) and the full `npm run e2e` (41 specs) both green.
- Next: **us-west region** (Phase 10.4).
