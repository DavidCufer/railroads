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

## Phase 10.4 — us-west region (all four regions now land)

**us-west** (bounds fixed by SPEC's table: −125…−104 lon, 32…49 lat; grid **136×144**, matching
`(21°·cos(40.5°))/17° ≈ 0.94 ≈ 136/144`). Start year 1860 (SPEC's default for this region). All 16
SPEC-listed cities. **Five founding-year cities** — Boise (1863), Cheyenne (1867), Phoenix and Reno
(both 1868), Spokane (1871) — more than any other region, which fits: the interior West really was
settled later than the coasts, so this region exercises the founding mechanic hardest. The one
snap-distance bug this region surfaced: Santa Fe's real coordinates sit almost exactly on the
southern Rocky Mountains ridge point I'd picked, so it got swallowed into "mountain" terrain and
snapped 2.46 tiles away — fixed by nudging that ridge point ~0.5° away from the city (same class of
bug as gb's Cardiff, different cause: mountain-radius overlap instead of a coastline notch). Every
other city landed within 1.2 tiles.

**Sierra Nevada** (peak elevation 8, SPEC's own example) and **Rocky Mountains** (peak elevation 9)
are both obvious as a continuous arc at overview zoom — confirmed in a wide (1400×1100, not
committed) inspection screenshot showing the Sierra as a thin north-south ridge west of the Great
Basin and the Rockies as a much broader arc curving from New Mexico up through Wyoming. Added a
smaller Cascades range (Oregon/Washington, elevation 7 — not in SPEC's example list, but cheap given
the pipeline already exists) for Pacific Northwest texture; it reads more as "hilly forest" than a
sharp range at this scale, which is an acceptable secondary feature since it wasn't the requirement.
**Great Salt Lake** (a `lakes` polygon just northwest of Salt Lake City) and **San Francisco Bay** (a
notch in the coastline, with the Sacramento River flowing into it) are both clearly visible in the
committed overview/closeup screenshots. Resource zones: Central Valley farmland, Rockies coal, High
Plains ranching, Southern California oil (era 1860 — the start year — so it's live from turn one,
unlike the other regions' oil zones which unlock in 1880).

**Screenshots** (`e2e/regions.spec.ts`, 800×360): `phase-10-us-west-overview.png` (zoom 0.25,
centered near Salt Lake City — the lake is unmistakable right next to it).
`phase-10-us-west-closeup.png` (zoom 2 on San Francisco — coastline and the bay inlet both in frame).

**Tests**: `us-west` added to `tests/mapgen/build.test.ts`'s shared `REGIONS` array; a
`loadRegion(us-west)` case in `tests/sim/regions/load.test.ts` asserts all five founding-year
cities are queued as pending by name; `e2e/regions.spec.ts` gained the load/screenshot test. All four
SPEC-listed regions (us-east, gb, central-eu, us-west) now exist under `src/data/regions/`.

**Bundle size**: now 4 regions statically imported — `npm run build`'s >500KB chunk warning is
unchanged in kind from Phase 10.3's note (still deferred to Phase 12).

- `npm run check` (262 unit tests) and the full `npm run e2e` (42 specs) both green.
- Next: **Title/main menu + New Game screen** (Phase 10.5).

## Phase 10.5 — Region terrain fidelity fixes (review carry-over)

A review of the four committed overview screenshots (Phase 10.1-10.4) found real problems, not
nitpicks: **us-west's Salt Lake City surroundings rendered as flat green plains** (no aridZones had
ever been wired into any region — `aridZones` existed in `RegionDef`'s type since Phase 10.1 but no
region actually used it), the Great Salt Lake polygon read as a thin rectangle (6 vertices, not
round enough), and there was no Wasatch Range feature at all. **us-east's Appalachians were
essentially invisible**: the single ridge's `peakElevation: 5` never crossed the hills threshold
(6) established by `TERRAIN_THRESHOLDS.hillsElevation` in `src/data/mapGen.ts`, so the "band" only
ever showed up as scattered lucky noise, not a continuous feature. **central-eu** was closer (the
Alps were already right, `peakElevation: 9`/`radiusTiles: 11`) but had no Carpathian, Black Forest,
or Bohemian Forest hint at all.

**Fixes** (`tools/mapgen/regions/{us-west,us-east,central-eu}.ts`):
- **us-west**: added an `aridZones` polygon covering the Great Basin/Utah/Nevada/Arizona/SE
  California desert (pulling moisture down inside it per `build.ts`'s existing `-0.65` arid
  penalty — this logic already existed, it was just never invoked by any region), staying west of
  the Rockies' main ridge and clear of the coastal strip/Central Valley/Pacific Northwest so those
  stay non-desert. Added a **Wasatch Range** mountain feature (`peakElevation: 8, radiusTiles: 4`)
  positioned so Salt Lake City itself (nudged onto the valley floor) stays outside the hills
  threshold while the immediately adjacent tiles read clearly as mountain — verified by dumping the
  actual generated terrain/elevation grid around SLC's tile (a throwaway inspection script, not
  committed) rather than eyeballing a screenshot alone. Extended the Rocky Mountains ridge north
  into Montana (the task brief specifically named Colorado/Wyoming/Idaho/**Montana**; the old ridge
  stopped at Idaho, lat 45.5). Redrew the Great Salt Lake as a 12-vertex rounded oval instead of the
  original 6-vertex shape.
- **us-east**: split the single `peakElevation: 5` ridge into a broad **"Appalachian Highlands"**
  band at `peakElevation: 6.5` (solidly hills-level, running the full original Alabama-to-Maine
  extent) plus a narrower, higher **"Appalachian Mountains (Blue Ridge)"** core ridge at
  `peakElevation: 8.5, radiusTiles: 3` covering only the Georgia-to-Pennsylvania stretch the task
  brief called out, so the mountain-level tiles concentrate where they belong instead of smearing
  the whole range. Added two small standalone hill clusters, **Adirondacks** (upstate NY,
  `peakElevation: 6.5`) and **White Mountains** (NH, `peakElevation: 6.5`), rather than trying to
  stretch the main ridge polyline up to cover them (they're geologically separate ranges, not a
  continuation of the Appalachian spine).
- **central-eu**: added a short **Carpathians (western edge)** hint near the Tatras (only the
  range's western tip falls inside this region's fixed lon-20 eastern edge — the brief itself calls
  it "Carpathian **edge**"), plus **Black Forest** and **Bohemian Forest** hill clusters
  (`peakElevation: 6` each) at their real locations (SW Germany near Freiburg/Basel; the Czech
  border SW of Prague).
- All three regions' JSON regenerated (`npm run mapgen -- <id>`); determinism, size-budget,
  city-anchor-not-on-mountain/water, and snap-distance tests in `tests/mapgen/build.test.ts` still
  pass unchanged for all four regions (262 unit tests total, same count as Phase 10.4 — no test
  needed adding since the existing per-region checks already cover "did a city get swallowed by a
  new mountain/desert feature").

**Verified with data, not just screenshots**: wrote a throwaway Node script (not committed) that
decodes a region's committed JSON and prints a terrain/elevation grid around a given lon/lat, since
overview-zoom screenshots compress a lot of detail into very few pixels (at zoom 0.25, one tile is
8px) — confirmed the Appalachian cross-section is a clean hills-with-a-mountain-core band, the
Adirondacks/White Mountains are distinct hill clusters, the Alps hit elevation 9 (confirmed snow
triangles actually render there at zoom 2, in an uncommitted closeup), the Wasatch produces real
mountain elevation immediately next to (not on top of) Salt Lake City's tile, and us-west's
Nevada/Utah/Arizona interior is desert while the coastal strip and Pacific Northwest stay green.

**Full-region thumbnails** (new, `e2e/regions.spec.ts`): each region is genuinely bigger than an
800×360 phone viewport can show even at the renderer's minimum zoom (0.25×), so every existing
`phase-10-<region>-overview.png` is a *crop* of the map's geometric middle, not the whole thing —
useful for judging city/label rendering but not for judging overall recognizability. Added four new
tests that set the Playwright viewport to exactly fit each region's full extent at 0.25× zoom (e.g.
us-east's 160×142 tiles → a 1320×1176 viewport) and screenshot the whole map in one shot:
`docs/screenshots/phase-10-{us-east,gb,central-eu,us-west}-full.png`. `gb` wasn't on the review's
list of terrain problems (its screenshots already looked right in Phase 10.2) but got a full
thumbnail too for consistency, and its JSON is confirmed byte-identical after a rebuild (no
unintended change).

**Looked at all four full-region thumbnails**:
- **us-west**: exactly the fix that was needed — a large tan desert interior across Nevada/Utah/
  Arizona/the Mojave, green only near the coast, Central Valley, and the Pacific Northwest/Sierra
  foothills as intended. The Rockies read as an unmistakably wide, continuous brown-grey diagonal
  band from the Colorado border up into Wyoming/Montana. The Sierra Nevada and Cascades are both
  visible as distinct bands. The Wasatch is real in the data (verified above) but, honestly, reads
  as only a thin 1-3-tile-wide grey line right next to Salt Lake City at this zoom — easy to miss at
  a glance, not "obviously a mountain range" the way the Rockies are. That's a reasonably accurate
  shape for the real (quite narrow) Wasatch Front, but flagged here rather than oversold. The Great
  Salt Lake now reads clearly as a rounded lake, not a rectangle.
- **us-east**: the Appalachians are now an unmistakable continuous tan-khaki band running the full
  NE-SW diagonal from north of Pittsburgh down past Nashville's longitude, with a visibly darker
  mountain core along it — this is the clearest win of the four. Washington's label is correctly
  suppressed next to Baltimore's (dot kept) at overview zoom, confirming the declutter fix below
  works on the exact case the review named. Adirondacks/White Mountains are present in the data
  (verified above) but sit near the very top edge of this region's thumbnail and are subtle at this
  scale — real, but not a headline feature of the image the way the main Appalachian band is.
- **central-eu**: this is the strongest result of the four — the Alps read as an obvious, wide,
  continuous grey-brown arc from Basel through Innsbruck to Graz and on to Ljubljana/Zagreb,
  clearly separating Italy from the German/Austrian side exactly as the brief described, and a
  zoom-2 closeup (uncommitted) confirms snow triangles render at the peak. The Carpathian edge hint
  and Black Forest/Bohemian Forest hill clusters are real in the data but visually subtle at
  overview zoom — hills' color (`#A9A46A`) reads fairly close to plain green at this scale, so
  someone not already looking for them could miss them. They satisfy "verify ... Carpathian edge,
  Bohemian/Black Forest hills" as data-level features rather than as bold visual landmarks.
- **gb**: unchanged from Phase 10.2 (no fixes needed here); still reads correctly as Great Britain's
  outline with Manchester/Liverpool/Leeds/Sheffield/Birmingham in correct relative positions.

**Known, not fixed here**: a handful of isolated single-tile "desert" specks appear in us-east and
central-eu away from any mountain feature (e.g. a couple of tiles near lon -80, lat 38.5 in
us-east) — these come from the region generator's ordinary moisture noise occasionally dropping
below the desert threshold on its own, the same mechanism the random map generator has always had;
not introduced by this session's aridZones/mountain changes (verified: gb's JSON, which nothing in
this session touched, is byte-identical, and central-eu had these specks even though its only new
features are hills, not aridZones). Cosmetic, rare, and out of this review's scope.

**Label declutter** (`src/render/labels.ts`): `drawCityLabels` now sorts cities largest-tier-then-
population first before drawing, and tracks each successfully-drawn label's screen rect (reusing
the existing `ReservedScreenRect`/`intersectsReserved` machinery already used for floating-UI
avoidance) so a later, smaller city's label that would overlap an already-drawn one is skipped —
its dot marker (at overview zoom) still draws, so the city doesn't disappear, only its text does.
Confirmed on the us-east full thumbnail: Baltimore's label draws, Washington's dot draws right next
to it with no label, no overlapping text.

- `npm run check` (262 unit tests, unchanged) and the full `npm run e2e` (46 specs, +4 for the new
  full-region thumbnails) both green. Reverted unrelated screenshot churn from every other phase
  (`git checkout -- docs/screenshots/phase-{0,1,1.1,3,4,5,6,7,8,9}-*.png`) per CLAUDE.md — the label
  sort change re-ran every e2e spec that draws a city label, but only the Phase 10 regions
  actually needed their screenshots to change.
- Next: **Title/main menu + New Game screen** (Phase 10.6, renumbered — Phase 10.5 was this
  terrain-fidelity fix).

## Phase 10.6 — Title/main menu and New Game screen

**Title screen** (`src/ui/titleScreen.ts`, new): a full-screen overlay (`z-index: 50`, above every
panel and the confirm bar) mounted into `#ui` with three buttons — **New Game** (opens the New Game
screen below), **Continue** (permanently `disabled`, with a `title` tooltip explaining why — there's
no save system until Phase 11), and **Settings** (opens a one-screen placeholder stating what's
coming, per PLAN's explicit "Settings placeholder" wording for this phase; the real Settings screen
is Phase 11's job). **Deliberately skipped under `?debug=1`**: every existing e2e test across Phases
0-9 navigates to `/?debug=1` and expects the game to be immediately interactive (tapping the canvas,
calling `window.__game` methods) — gating the title screen on the same `DEBUG` flag `main.ts` already
uses for the debug hooks meant zero changes needed to any of those 46 existing specs, while a real
(non-debug) player still sees the title screen on load. Confirmed this is the right call: all 51
e2e specs (46 existing + 5 new) pass unchanged.

**New Game screen** (`src/ui/newGameScreen.ts`, new): tabs for **Real World** (a horizontally-
scrollable row of cards, one per shipped region, each with a thumbnail, name, default start year,
and a 2-line-clamped short description — tapping a card selects it) and **Random** (seed field with
a 🎲 randomize button, plus segmented-button rows for every SPEC §4.2 option: size, water level,
roughness, cities, resources, start year from `RANDOM_START_YEAR_CHOICES` — new in
`src/data/mapGen.ts` — 1830/1850/1870/1900/1930/1950). A pinned footer holds the difficulty picker
(Easy/Normal/Hard) with starting cash shown live from `DIFFICULTY[difficulty].startingCash`
(`src/data/finance.ts`, unchanged), plus Back/Start Game buttons. Starting a Real World game passes
`{seed: 1, region, difficulty}`; Random passes the full `RandomNewGameOptions` shape `sim/state.ts`
already defines — both go through the exact same `regenerate()` path every existing debug/test tool
already uses, so no new state-creation code was needed.

**Region thumbnails** (`src/render/regionThumbnail.ts`, new): draws one pixel per tile at the
region's native grid size directly into an `ImageData` buffer (fast — this only runs 4 times, once
per card, when the New Game screen opens) using the same flat terrain-color palette
(`TERRAIN_COLORS`) the in-game overview zoom bucket already uses, then lets CSS scale it down with
`image-rendering: pixelated` rather than blurring it. Exported `hexToRgb` from `src/render/color.ts`
(previously private) to build the palette lookup table once instead of re-parsing hex strings per
tile. Cities already founded at the region's start year (`tiles.length > 0`) get a single gold pixel
at their anchor, largest population first, so a big city's dot isn't overdrawn by a village's at
this resolution — same declutter idea as the in-game label sort from Phase 10.5, reused here as
plain draw order since there's no text to overlap.

**Layout, actually fit to 800×360**: the first pass at the Random tab's option list didn't fit —
7 rows (seed + 6 generator options) plus the pinned difficulty/cash/buttons footer overflowed the
available height, and the Real World cards' 2-line description clamp got clipped by the card's own
height before CSS `-webkit-line-clamp: 2` had room to show both lines. Fixed by tightening
`.region-card`'s thumbnail to 62px (from a first-pass 84px) and trimming header/tab/option-row/
footer padding throughout — rechecked with a real screenshot after each pass rather than trusting
the CSS numbers alone. Final state: the Real World tab's 4 cards, difficulty row, and Start button
all fit without any scrolling; the Random tab's last option row (start year) is still one scroll
away — confirmed reachable (`.new-game-content`'s existing `overflow-y: auto`) with a throwaway
scroll-and-assert test, not committed. A full "no overlapping panels, 44px targets" pass at this
viewport size is explicitly Phase 11's own checklist item (PLAN.md), so this was fixed enough to be
usable and honestly reported rather than pixel-chased further here.

**Tests** (`e2e/titleScreen.spec.ts`, new, 5 specs, all navigate to `/` *without* `?debug=1`): title
screen visible on load with Continue disabled and Settings enabled; Settings placeholder opens and
Back returns to the menu; New Game screen shows exactly 4 region cards on the Real World tab and the
generator options on the Random tab; selecting American West and starting actually dismisses the
title screen and lands in a game whose top bar shows 1860 (that region's start year); starting a
Random game also dismisses the title screen. No unit tests needed — this phase added no `src/sim`
logic, only UI wiring through the existing `NewGameOptions`/`regenerate()` path.

**Screenshots — looked at them**: `phase-10-main-menu.png` — dark full-screen menu, gold "Railroads"
title, gold New Game button, visibly greyed-out Continue, enabled Settings; reads clearly as a real
title screen, not a placeholder. `phase-10-new-game-real-world.png` — all 4 region cards fit on
screen with recognizable thumbnails (Great Britain's outline is unmistakable even at this size; the
American West card shows the Great Salt Lake as a small blue dot next to Salt Lake City; Central
Europe & the Alps shows the brown mountain band across the middle), 2-line descriptions no longer
clipped, difficulty/starting-cash/Start all visible without scrolling. `phase-10-new-game-random.png`
— seed field + dice button, and 5 of 6 option rows (size/water/terrain/cities/resources) visible
with the difficulty footer; start year needs one scroll (see above, not a hard blocker but worth
listing honestly).

- `npm run check` (262 unit tests, unchanged — no sim code touched) and the full `npm run e2e` (51
  specs: 46 existing + 5 new) both green. Reverted unrelated screenshot re-encoding noise from every
  other phase's specs per CLAUDE.md (this run's water-shimmer redraw timing, which is real-time
  based per Phase 1, made even the *unchanged* Phase 10.1-10.5 region overview/closeup/full
  screenshots re-diff by a few pixels with no actual behavior change — reverted those too, kept only
  the 3 new title/new-game screenshots this phase actually owns).
- Next: **Goals system** (Phase 10.7).

## Phase 10.7 — Goals system

**Goal types** (`src/sim/goals/types.ts`): all six of SPEC §11's types
(`connect`/`annualRevenue`/`netWorth`/`cityTier`/`delivered`/`electrifiedTiles`), with one
documented generalization: `connect` takes `cityIds: number[]` (2+ cities, all mutually reachable
by rail) rather than SPEC's literal `(cityA, cityB)` pair — needed for gb's own example goal,
"Connect London-Birmingham-Manchester-Liverpool", which names four cities. A 2-city array is
exactly SPEC's original case, so nothing is lost.

**Per-region goal sets** (`src/data/goals.ts`): one bronze/silver/gold set per shipped region,
using SPEC §11's own example goals wherever they map cleanly onto the six types, documented
deviations where they don't:
- `us-east`: connect(New York, Chicago) by 1860 → annual revenue $5M by 1880 → Chicago reaches
  Metropolis (SPEC gave no year for this one; chose 1900).
- `gb`: connect(London, Birmingham, Manchester, Liverpool) by 1845 → deliver 1,000 carloads of
  coal in a year (SPEC gave no year; chose 1850) → net worth $5M by 1870 (SPEC's example list for
  gb only gave 2 goals; added this gold one to fill out the trio).
- `central-eu`: SPEC's "cross the Alps: connect Munich/Vienna to Milan or Venice/Trieste" is an OR
  of OR, which the goal system doesn't have a type for — simplified to one representative pair,
  connect(Munich, Milan) by 1875 → electrify 200 tiles by 1930 → net worth $30M by 1930 (added).
- `us-west`: connect(Sacramento, Salt Lake City) by 1870 → net worth $50M by 1920 → annual revenue
  $10M by 1900 (added).

**Resolution and random-map generation** (`src/sim/goals/generate.ts`): region goal defs reference
cities by *name* (readable, robust to array reordering); `resolveRegionGoals` looks each one up
against the actual loaded region's `state.cities` and resolves to a concrete `Goal` with real
`cityId`s — a name that doesn't match is silently dropped rather than throwing (defensive; a unit
test checks every name in `REGION_GOALS` actually resolves for all four regions, so this path is
never hit in practice). `generateRandomGoals` builds a bronze/silver/gold set for a random map from
the same six types, scaled off the map's own two biggest cities and the chosen difficulty's
starting cash (so a Small/Easy game and a Large/Hard game both get plausible targets) — one real
random choice (which of `netWorth`/`cityTier`/`annualRevenue` fills the gold slot, and which cargo
the silver `delivered` goal tracks) drawn from the game's own seeded RNG (`nextInt`/`pick`, never
`Math.random` — CLAUDE.md's sim hard rule), so it's still fully deterministic from the seed like
everything else. `GameState.goals` is populated once in `createGameState` and fixed for the game's
lifetime.

**Evaluation** (`src/sim/goals/evaluate.ts`, pure — never mutates `GameState`): `connect` does a
BFS over `state.trackGraph` from one connector tile (a station whose catchment covers one of the
city's footprint tiles — the same concept `src/sim/commands.ts`'s existing `cityIsRailConnected`
uses for Civic Investment, reimplemented here for N cities instead of 1) of the first city, then
checks every other named city has a connector tile in the visited set — this is "are they all on
one mutually-reachable network," not "built as a single straight line," matching what the SPEC
examples actually mean. `annualRevenue`/`netWorth` reuse `ledgerRevenue`/`netWorth` from the
existing finance module unchanged. `cityTier` compares `CITY_TIERS` rank. `electrifiedTiles` counts
distinct tiles touched by at least one `electrified` track edge. `delivered` is new plumbing: two
`GameState` fields, `cargoDeliveredThisYear` (incremented in `src/sim/trains/loading.ts`'s
`applyUnload`, the same place revenue and city-growth score are already credited) and
`cargoDeliveredBestYear` (the max any *completed* year has ever hit, rolled over at the year
boundary by the new `yearlyCargoDeliveredRollover` in `src/sim/economy/goalTracking.ts`) — a goal
completes off `max(thisYear, bestYear)`, so it can trigger mid-year or from a past year without
needing full per-year history. Every goal also reports `overdue` (target year passed, still
incomplete) — goals never hard-fail (SPEC: "game continues"), this is just a status flag the panel
shows, not a game-over condition.

**Detection and celebration** (`src/sim/economy/goalTracking.ts`'s `dailyGoalsStep`, called from
`src/sim/tick.ts` at the existing day boundary): re-evaluates every goal daily, and for any that's
newly complete (checked against `GameState.goalsCompleted`, so it only fires once) pushes a
`goalCompleted` news item and queues it in the new `GameState.pendingGoalCelebrations`. `src/main.ts`
drains that queue the same one-shot-per-tick way it already drains `pendingDeliveries`/`pendingNews`,
opening `openGoalCelebration` (`src/ui/goalsPanel.ts`) the moment no other panel is in the way —
same precedent the yearly report already established for "something auto-opens if nothing's
blocking it." The celebration and the Goals panel are both plain `openPanel` slide-ins (this
codebase's only existing "automatic dialog" pattern), not a new full-screen modal system.

**City foundings, finally wired up** (`src/sim/economy/founding.ts`, new — the `GameState.regionId`/
`pendingCityFoundings` machinery and even the doc comment referencing this exact file were already
in place since Phase 10.1, just unused until now): a yearly step, called from `tick.ts` at the year
boundary, that applies each pending founding once its year arrives — population, footprint tiles,
coastal flag, stamping `map.cityId` for every new tile, bumping `mapContentVersion` so the terrain
chunk cache picks up the new city's roofs — and pushes a `cityFounded` news toast. Verified against
the real us-east region in `e2e/regions.spec.ts`: Chicago (founds 1833) is absent with an empty
footprint right after load, then `window.__game.runDays(3 * 365)` and it has a real footprint plus
a matching `cityFounded` news item.

**UI**: `src/ui/goalsPanel.ts` (Goals panel + celebration dialog + the floating Goals button,
stacked above News/Trains bottom-right per the existing convention) and `src/ui/goalStrings.ts`
(one `describeGoal(state, goal)` shared by the panel, the celebration dialog, and the news
formatter, so all three describe a goal identically instead of three separate implementations
drifting apart). Goal cards show a tier badge (bronze/silver/gold, color-coded left border),
description, a progress bar, and an overdue flag if applicable.

**Tests**: `tests/sim/goals/evaluate.test.ts` (9 tests — one per goal type, plus a disconnected-
segments case for `connect` and the overdue flag), `tests/sim/goals/generate.test.ts` (8 tests —
every region's goals resolve against the real region data, us-east's bronze goal specifically
names New York/Chicago, random-goal determinism across two `createGameState` calls with the same
seed, and every generated goal's city ids actually exist), `tests/sim/economy/founding.test.ts`
(4 tests). 21 new unit tests; 283 total (was 262).

**E2E** (`e2e/regions.spec.ts`): the existing Chicago test was extended from "is it absent" to
actually running 3 years and checking both the footprint and the `cityFounded` news item; a new
Goals-panel test screenshots all three goal cards with progress bars; a new celebration-dialog test
uses a test-only debug hook (`debugSetCash`, added alongside the existing `debugPlaceCity`/
`debugPlaceIndustry` test-only hooks) to push net worth over gb's $5M gold threshold without
simulating real train revenue, confirming the celebration dialog *and* its news toast both fire.
First pass at both new panel screenshots caught a real timing bug in the test, not the app: without
a wait after opening the panel, the screenshot landed mid-slide-in-transition (CSS
`transition: transform 0.2s ease`), showing the panel mostly off-screen with text apparently
"cut off" — same `waitForTimeout` fix every other panel-screenshot test in this codebase already
uses.

**Screenshots — looked at them**: `phase-10-goals-panel.png` shows all three us-east goal cards
(Bronze/Silver/Gold, color-coded) with full readable descriptions ("Connect New York – Chicago by
rail", "Annual revenue $5.0M", "Chicago reaches Metropolis"), each at 0% progress on a fresh game.
`phase-10-celebration-dialog.png` shows the dialog firing the instant net worth crosses gb's gold
threshold — "Goal reached! 🎉" / "Gold" / "Net worth $5.0M" / Continue — with the matching toast
("Gold goal reached: Net worth $5.0M") visible at the top of the same screenshot, confirming both
fire together as designed.

- `npm run check` (283 unit tests) and the full `npm run e2e` (53 specs, +2 for the goals/
  celebration coverage) both green. Reverted unrelated screenshot re-encoding noise from every
  other phase per CLAUDE.md, same as the last two sessions.
- Next: **Phase 10 final wrap-up** — PLAN.md checkboxes, a consolidated PROGRESS.md entry, and the
  `Phase 10: Real-world maps and new game screen` commit.

## Phase 10: Real-world maps and the new game screen — final wrap-up

Phase 10 landed across seven sessions/sub-phases (10.1-10.7, each with its own detailed entry
above): the `tools/mapgen` pipeline, all four SPEC-listed regions, a terrain-fidelity review pass,
the title/New Game screens, and the goals system. This entry is the consolidated summary
CLAUDE.md's workflow asks for, plus the honest per-region recognizability assessment the task
brief specifically asked to be recorded here.

**What shipped:**
- `tools/mapgen` (Node/TypeScript, `npm run mapgen -- <regionId>`): hand-authored coastline/lake/
  river/mountain-range/resource-zone polygons per region (Natural Earth's GeoJSON host is blocked
  by this environment's egress policy — confirmed, not assumed — so the fallback path is the only
  one implemented; a future session with network access can add the live-fetch path SPEC describes
  without touching the rest of the pipeline). Elevation blends mountain-feature falloff with noise
  texture; terrain classification reuses the random generator's own thresholds so the two map kinds
  agree; rivers/cities/industries all reuse the random generator's placement logic.
- All four SPEC-listed regions (`us-east`, `gb`, `central-eu`, `us-west`), each with real cities
  (positions, 1830s-1860s populations, tiers), founding-year cities where real history has them
  (Chicago, Atlanta, and five in `us-west`), and resource zones matching SPEC's named examples
  (substituting a couple that fall outside a region's SPEC-fixed lon/lat bounds, documented in each
  region file's header).
- A terrain-fidelity review pass (Phase 10.5) that fixed real problems a first look at the overview
  screenshots caught: `us-west` had no desert at all despite `aridZones` existing in the data model
  since Phase 10.1, `us-east`'s Appalachians were invisible (a `peakElevation` that never crossed
  the hills threshold), `central-eu` was missing secondary ranges. Added full-region thumbnail
  screenshots (`phase-10-<region>-full.png`) specifically so this kind of problem is visible at a
  glance instead of hiding in an 800×360 crop.
- Title screen (New Game / Continue-disabled / Settings-placeholder) and a New Game screen (Real
  World tab with a rendered-from-real-data thumbnail per region; Random tab with every SPEC §4.2
  option; shared difficulty picker with starting cash shown), both fit to 800×360.
- A full goals system: SPEC's six data-driven types (one generalized — `connect` takes N cities,
  not just 2, to fit gb's own 4-city example), a hand-authored bronze/silver/gold set per region,
  a generated set for random maps, a Goals panel with progress bars, and a celebration dialog +
  news toast on completion.
- City foundings actually fire now — the `pendingCityFoundings` plumbing existed since Phase 10.1
  but had no consumer until Phase 10.7's `founding.ts`.

**Region recognizability — an honest per-region assessment** (from looking at the full-region
thumbnails in Phase 10.5, still valid — no terrain changed since):
- **us-east**: the strongest of the four for "does this read as the real place." Great Lakes
  correctly shaped/positioned, Chesapeake Bay, the Atlantic coast curving from Montreal/Boston down
  to Savannah, and — after the 10.5 fix — an unmistakable continuous Appalachian band running the
  full NE-SW diagonal with a visible mountain core, plus distinct Adirondacks/White Mountains hill
  clusters (subtle at overview zoom, but real in the data).
- **central-eu**: the other strong result. The Alps read as an obvious, wide, continuous arc
  separating Italy from the German/Austrian side exactly as SPEC's brief describes, with real snow-
  cap rendering confirmed at zoom 2. The Carpathian edge hint and Black Forest/Bohemian Forest hill
  clusters are correct in the data but visually subtle at overview zoom (hills' color reads close
  to plain green at that scale) — someone not already looking for them could miss them.
- **us-west**: much improved by the 10.5 fix (a large, correctly-placed desert interior across
  Nevada/Utah/Arizona/the Mojave, a clearly lake-shaped Great Salt Lake, an unmistakably wide Rocky
  Mountains band), but the Wasatch Range specifically is honestly still under-visible — it's real
  mountain elevation immediately next to Salt Lake City (verified by dumping the actual generated
  terrain grid), but at overview zoom it renders as only a 1-3-tile-wide line easy to miss next to
  the city label. A geologically accurate shape (the real Wasatch Front is narrow) rendered at a
  small scale, not a bug, but worth another look if a future session revisits terrain rendering.
- **gb**: solid and unchanged since Phase 10.2 — reads clearly as Great Britain's outline with
  Manchester/Liverpool/Leeds/Sheffield/Birmingham in correct relative positions. Wasn't touched by
  the 10.5 review because it didn't need to be.

**Known carry-overs, not fixed in this phase** (none block Phase 10's own scope; listed here so a
future session doesn't have to rediscover them):
- A handful of isolated single-tile "desert" specks in `us-east`/`central-eu`, away from any
  mountain feature — ordinary moisture-noise variance the random generator has always had, not
  introduced by this phase's changes (verified: `gb`'s JSON, untouched by the 10.5 fixes, has none;
  `central-eu`'s specks predate its own new hill features).
- The Wasatch Range's low overview-zoom visibility, above.
- `npm run build`'s >500KB main-chunk warning (all four regions' JSON statically imported) —
  explicitly deferred to Phase 12 (Performance and release hardening) since fixing it means making
  the region-loading path async, which ripples into the New Game screen this phase just built.
- No live Natural Earth fetch path (network-blocked in this environment) — the hand-authored
  fallback is the only path implemented; SPEC's fetch-based pipeline step is still open for a
  future session with different network access.
- "Load" isn't a separate main-menu entry yet (see the PLAN.md deviation note) — there's nothing to
  load until Phase 11 ships saves.

- Final `npm run check` (283 unit tests) and `npm run e2e` (53 specs) both green on the commit this
  entry ships with.

## 2026-09-25 — Phase 10.1: Real-world terrain breadth (review findings on Phase 10)

Review of `phase-10-*-full.png` found mountain ranges rendering as 1-3-tile stripes (invisible at a
glance, barely affecting grades/track cost) and no rivers at overview zoom. Root cause and fixes:

- **Root cause**: `MountainFeature` elevation was a single point-ridge smoothstep falloff
  (`peak * smoothstep(1 - d/radiusTiles)`). Because smoothstep is nearly flat near `t=1` and falls
  steeply as `t` drops, elevation crossed the hills/mountain thresholds (6/8 out of 9) only within
  about 1 tile of the ridge line regardless of how big `radiusTiles` was — the "radius" barely
  mattered.
- **Fix** (`tools/mapgen/regionDef.ts`, `build.ts`): `MountainFeature` gained `coreRadiusTiles` —
  elevation now holds flat at `peakElevation` out to the core, *then* smoothstep-falls to 0 by
  `radiusTiles`, so a range reads as an actual broad band (mountain core + hills margin) instead of
  a seam. Distance-to-ridge is also jittered with a coherent noise field (capped at
  `min(2, radiusTiles * 0.15)` tiles — see the "found the hard way" note below on why it's capped in
  absolute tiles, not a fraction of a possibly-huge radius) so a band's edge isn't a perfect offset
  curve of the hand-authored ridge polyline.
- **Widened every named range** toward PLAN's target tile widths: Appalachians (broad
  `peakElevation 6.5` hills pass, `coreRadiusTiles 5`/`radiusTiles 9`, full AL-to-Maine extent, with
  a narrower `peakElevation 9`/`coreRadiusTiles 2`/`radiusTiles 5` Blue Ridge overlay PA-to-N.Georgia
  for the real mountain core), Rockies (broad hills pass `coreRadiusTiles 14`/`radiusTiles 22`
  covering the full CO-to-W.Montana extent, plus a `Wind River Range` mountain-core overlay in
  WY/ID for texture — see below on why there's no separate Front Range overlay), Sierra
  Nevada/Cascades/Wasatch (mostly-mountain narrow ranges, `coreRadiusTiles` 1-3), Alps (`peak 9`,
  `coreRadiusTiles 4`/`radiusTiles 13` — see below on why the core isn't bigger), Carpathians/Black
  Forest/Bohemian Forest (hills-only, `peakElevation 6.5`, no core-driven mountain), Pennines/
  Scottish Highlands/Cambrian Mountains (hills with a modest mountain core, `coreRadiusTiles`
  1.5-2.5).
- **Found the hard way, twice, via the city-placement tests** (both are recorded as comments in the
  region files so a future session doesn't reintroduce them):
  1. A first draft used `peakElevation 7.5` for the hills-only bands (reasoning: "7.5 minus the
     ±0.8 local-roughness noise is still ≥ 6.7, safely above the hills threshold"). It missed that
     elevation is *rounded* before classification (`Math.round`), so `7.5 + 0.8 = 8.3` rounds to 8
     and reads as **mountain**, not hills — a broad, supposedly-hills-only band could randomly sprout
     mountain patches whichever way the local noise fell in a given map. Cheyenne's projected point
     landed on exactly one such noise-tipped tile and got relocated 5 tiles away by the "nearest
     non-mountain tile" fallback, failing the "within 1.5 tiles" test. Fixed by dropping every
     hills-only band's `peakElevation` to 6.5 (so `6.5 + 0.8 = 7.3` rounds to 7, never 8).
  2. A first draft added a separate `Front Range` mountain-core overlay in Colorado, reusing
     essentially the same ridge coordinates as the main Rocky Mountains polyline (which was already
     drawn close to Denver's real position, since Denver realistically sits at the foot of the
     Front Range). Stacking a second flat mountain-elevation core directly on the same line pushed
     Denver's exact tile into mountain territory, 8 tiles from its projected point. Removed the
     duplicate overlay — the main Rockies ridge already *is* the Front Range at that latitude, real
     mountain relief comes from the `Wind River Range` overlay positioned well clear of every listed
     city instead. The same issue, smaller version: the Alps' first draft used `coreRadiusTiles 8`,
     which is a literal reading of "mostly mountains" but swallowed real Alpine valley cities
     (Innsbruck, Graz, Turin) that this ridge-distance model has no way to carve a valley out of;
     dropped to `coreRadiusTiles 4` (widened the falloff margin instead to keep the total band width
     in SPEC's 15-25 range) so those cities land just outside the flat core.
  3. All four regions' `places every city within 1.5 tiles` / `on non-water non-mountain terrain`
     tests pass after both fixes; verified with a throwaway script that prints every city whose
     nearest-valid-tile distance exceeds the test's threshold, not just re-running the suite blind.
- **Lakes added** (all as `RegionDef.lakes` polygons): Lake Geneva, Lake Constance, Lake Balaton
  (`central-eu`), Lake Champlain (`us-east`), Lake Tahoe (`us-west`). Great Salt Lake and the Great
  Lakes were already present from Phase 10.1's first pass.
- **Rivers added** (`RegionDef.rivers` source→mouth polylines, same mechanism as the existing
  Hudson/Ohio/Mississippi/Danube/Rhine/Thames/Severn): Potomac (`us-east`), Columbia and Colorado
  (`us-west`), Elbe and Po (`central-eu`).
- **Overview-zoom rivers** (`src/render/terrain.ts`): `TerrainRenderer.drawRivers` now runs for the
  0.25× overview bucket too (previously gated `if (!overview)`, with a comment explicitly deferring
  this to a later phase — this is that phase). Overview line width is a fixed thin
  `max(1, min(1.75, 0.5 + flow*0.003))` px rather than the full-detail flow-proportional 2-6px, since
  SPEC just wants "thin blue lines" as a build-guide hint at this zoom, not flood-stage widths. This
  is a renderer change, not region-specific, so it also affects (and legitimately changed) two
  existing Phase 1/3 screenshots taken at zoom 0.25 on the *random* map generator — kept those two
  since they now correctly show the renderer's actual current behavior; reverted every other
  screenshot the e2e run touched that this phase didn't cause (timing/shimmer-dot noise across the
  Phase 4-9 specs, none at zoom 0.25) per CLAUDE.md's screenshot-ownership rule.
- All four region JSONs regenerated (`npm run mapgen -- <id>`); sizes barely moved (91.8-127.5 KB,
  same ballpark as before, comfortably under the 300 KB budget) since the format is unchanged —
  only the elevation/terrain bytes differ.

**Screenshots — looked at every regenerated full-region thumbnail** (`docs/screenshots/phase-10-
<id>-full.png`), per the phase brief. Honest per-region read:

- **us-east**: the Appalachians now read unmistakably as a broad diagonal tan band running the full
  Alabama-to-Maine length, with a visibly darker/greyer mountain-core vein threading down its
  center (the Blue Ridge overlay) — a real improvement over the old 1-3-tile seam. Adirondacks and
  White Mountains show as smaller distinct patches near Albany/Maine. Ohio, Mississippi and Hudson
  rivers are all clearly visible as thin blue lines; Potomac is visible flowing into Chesapeake Bay;
  Lake Champlain is present but small (two adjoining blue tiles south of Montreal) — correctly
  proportioned for how narrow the real lake is at this ~13 km/tile scale, but easy to miss at a
  glance. **Verdict: named range reads as a broad band, major rivers visible — meets the accept
  criterion.**
- **gb**: Pennines now read as a clear, continuous brown diagonal band from Newcastle down past
  Sheffield (previously near-invisible); Cambrian Mountains show as a similar band near Cardiff;
  Scottish Highlands show as a smaller patch near Glasgow (correctly small — the region's bounds
  cut the range off before its real extent, per the existing "Aberdeen off-map" note). Thames and
  Severn are both visible as thin lines. **Verdict: meets the accept criterion.**
- **central-eu**: the Alps are the clearest win in this pass — a wide, continuously curved
  brown-grey band running the full Turin/Milan-to-Zagreb width of the map, unmistakably a mountain
  range at a glance, with Innsbruck/Zurich/Graz/Turin all sitting just outside its edge rather than
  inside it. Black Forest (near Basel/Strasbourg) and Bohemian Forest (between Dresden and Prague)
  show as smaller tan hills patches. Danube, Rhine, Elbe and Po are all visible as thin blue lines
  (Po traced from Turin through Milan to the Adriatic near Venice). Lake Constance and Lake Geneva
  are both visible as small blue shapes near Zurich/Basel; Lake Balaton is visible near Budapest.
  **Verdict: meets the accept criterion, best-looking of the four.**
- **us-west**: Sierra Nevada (narrow, strongly mountain-toned vertical band) and the Rocky Mountains
  (very broad khaki hills band covering most of the map's eastern half, with the Wind River Range's
  darker mountain-core overlay clearly visible as a distinct diagonal stripe within it — reads as
  "more than one range" as intended) are both clear wins. Cascades and Wasatch are visible but
  narrower, as designed. Sacramento and Columbia rivers are visible as thin lines; Colorado river is
  visible cutting through the Great Basin desert. One honest caveat: most of this region's cities
  (LA, San Diego, Denver, Phoenix, Tucson, Boise, Cheyenne, Spokane, Reno — everything but San
  Francisco/Sacramento/Salt Lake City) are `village` tier, and village labels/dots are hidden at
  overview zoom by an existing Phase 3 declutter rule unrelated to this phase — so the thumbnail
  reads a little sparser on named places than the other three regions, but that's pre-existing
  behavior, not a terrain regression. **Verdict: meets the accept criterion.**

**Tests**: `npm run check` (283 unit tests, unchanged count — no new test files this phase, existing
region/mapgen tests already covered the invariants that mattered: determinism, size budget, city
placement, river bounds, elevation range) and `npm run e2e` (53 specs) both green.

Known carry-overs, not fixed in this phase:
- The Alps' mountain core (`coreRadiusTiles 4` of a `radiusTiles 13` band) is narrower than a
  literal reading of "mostly mountains" would suggest, traded off against not stranding Innsbruck/
  Graz/Turin (see above) — the band still reads clearly mountainous at a glance, but a future session
  with more time to re-route the ridge polyline itself away from those cities (rather than shrinking
  the core) could push the mountain-core proportion higher without the placement risk.
- Lake Champlain is present but small enough to miss at a glance — correct at this scale, but if a
  future session ever changes `us-east`'s tiles-per-degree, it's worth rechecking this lake doesn't
  disappear into sub-pixel noise.
- No automated test asserts mountain band *width* in tiles (the PLAN's targets were verified by eye
  against the regenerated screenshots this session, plus a scratch script during tuning, not a
  committed test) — a regression here would only be caught by another visual review pass.

## 2026-09-25 — Phase 11: Save/load, settings, polish

- **Save/load** (`src/save/`, new directory): `serialize.ts`/`format.ts` convert `GameState` <->
  a plain-JSON `SerializedGameStateV1` — `GameMap`'s typed arrays are base64-packed losslessly
  (`typedArray.ts`, a full-precision byte-view codec, unlike `sim/regions/codec.ts`'s deliberately
  lossy fixed-point Int16 used for the much size-budget-constrained committed region JSON), every
  `Map`/`Set` field becomes a plain array of entries, and `TrackGraph` becomes its edge list
  (rebuilt via `new TrackGraph()` + `addEdge`). `GameState.stationEconomy` is the one field
  deliberately *not* persisted — it's a pure cache of map/cities/industries/stations/
  industryEconomy (`src/sim/stations/economy.ts`'s own doc comment says as much), so the load path
  just recomputes it the same way every other code path already does when those inputs change.
  `migrate.ts` is the version-chain scaffold (`migrateSaveFile` walks a raw parsed save forward one
  version at a time to `CURRENT_SAVE_VERSION`); since v1 is the first real format, `SaveFileV0Fixture`/
  `migrateV0toV1` are a deliberately-fake "previous format" (renamed `money`->`cash` field, missing
  the goals/per-year-cargo/mapContentVersion fields) that exists purely to prove the scaffold itself
  works end to end, per the PLAN brief's explicit test ask. `db.ts` is a tiny native-IndexedDB
  wrapper (one object store, one record per slot, keyed by slot id) — no dependency added. `index.ts`
  is the public surface: `autosave` (round-robins `auto-0..2` via a localStorage cursor, not
  "oldest timestamp wins"), `saveToSlot`/`loadSlot`/`deleteSlot`/`listSaveSlots`/`latestSaveSlot`.
- **Tests** (`tests/save/*.test.ts`, 7 new, all pure/DOM-free per CLAUDE.md): a round-trip
  determinism test against a hand-built fixture that deliberately exercises every special field
  kind — typed arrays, `TrackGraph`, every `Map`/`Set` field, a real-world region id, a mid-route
  train (non-empty `blockPenalties` `Map`, `heldBlocks`, in-progress `edgeProgress`), an outstanding
  loan, goals/`goalsCompleted`, and news — asserting `deserializeGameState(JSON.parse(JSON.stringify(
  serializeGameState(state))))` is deep-equal to the original; a second test drives a *real* small
  freight-route scenario (reusing `tests/sim/longRun.test.ts`'s proven scenario-building pattern)
  forward 200 in-game days two ways — continuously, and split by a save/load round trip partway
  through the train's route — and asserts the two trajectories' cash/finance/train/stationCargo/
  industryEconomy/news end up identical; a migration test proves the v0->v1 fixture actually gets
  rewritten (not just passed through). This is the headline test PLAN called out, and it's green.
- **UI wiring** (`src/main.ts`, `src/ui/saveLoadScreen.ts`, `src/ui/titleScreen.ts`): autosave
  fires on every in-game month boundary (`isMonthBoundary(state.ticks)` in `tickOnce`, fire-and-
  forget) and on backgrounding — both `@capacitor/app`'s `pause` event and the web/PWA
  `visibilitychange` equivalent, whichever fires first wins (skipped under `?debug=1` so e2e tests
  never touch IndexedDB unexpectedly). `renderSaveLoadScreen` is one shared renderer for both
  directions: Load (title screen's "Load Game", or the in-game ☰ menu... actually only reachable
  from the title screen this phase, see Known issues) lists all 8 slots (3 auto + 5 manual) with
  name/company-date/cash/map per slot, Load + Delete buttons on any occupied one; Save (in-game ☰
  menu only, `openSaveScreen`) lists the 5 manual slots, prompts for a name via `window.prompt`
  (same lightweight pattern as the existing `window.confirm` exit dialog), Save/Overwrite + Delete.
  Continue on the title screen calls `latestSaveSlot()` on mount and loads it directly. `main.ts`
  factored the old `regenerate()` body into a shared `applyState(newState)` so a freshly-generated
  map and a loaded save go through identically thorough rewiring (camera, every renderer's
  `setMap`, drag/ghost/panel state reset) — a save/load bug can't silently diverge from a New Game
  one by skipping a reset step one path remembered and the other didn't.
- **Settings screen** (`src/ui/settings.ts`, `src/ui/settingsScreen.ts`, replaces the Phase 10
  placeholder): units (km/h vs mph, a new `formatSpeed()` used everywhere a loco/train speed is
  shown), quick build (reads/writes the *same* pre-existing `QUICK_BUILD_STORAGE_KEY` from
  `toolbar.ts` rather than a second source of truth), sound, show grid, UI scale — all in
  localStorage under one `railroads.settings` key (quick build stays separate, unchanged since
  Phase 4). Reachable from the title screen and, new, the in-game ☰ menu (`openSettingsOverlay`,
  a full-screen overlay reusing the title screen's own `.title-screen` look over the live game).
  UI scale applies via a `--ui-scale` CSS custom property on `#ui`, scaling from the top-left with
  compensating `width`/`height: calc(100% / var(--ui-scale))` so the scaled box still exactly
  covers the viewport instead of leaving a gap or overflowing it. Grid draws as a new, cheap,
  viewport-clipped overlay (`drawGridOverlay`, `src/render/overlays.ts`) skipped below zoom 0.5.
- **First-game hints** (`src/ui/hints.ts`): a 4-step card (`strings.hints.steps`) shown once per
  browser (a `railroads.hintsSeen` localStorage flag), Skip/Got it/Start playing buttons, floats
  bottom-center and never intercepts map/toolbar input underneath it. Shown after a *new* game
  starts (skipped under `?debug=1`, and never on a loaded save — a loaded game obviously isn't a
  first game).
- **Sound** (`src/ui/sound.ts`): three procedural WebAudio synths (`whistle`/`chug`/`cashDing`,
  simple oscillator+gain-envelope tones, no audio files, matching the "all graphics procedural"
  ethos extended to audio) — off by default, `initSound(enabled)` called once at startup and again
  on every Settings change. Wired at two points: `playSound("whistle")` on a successful train
  purchase (`trainPanels.ts`), `playSound("cashDing")` on a delivery (`main.ts`'s `tickOnce`,
  alongside the existing floating `+$` label). `chug` exists as a synth but has no trigger point
  yet — noted below.
- **Visual polish** (`src/render/terrain.ts`, `cities.ts`, `stations.ts`):
  - **Coastlines/lake shores**: replaced the per-tile diagonal-corner gradient blend
    (`drawCornerBlend`, Phase 1.1/Phase 2-review vintage) with a real marching-squares contour.
    `cornerWaterness(gx, gy)` averages the up-to-4 tiles sharing a grid corner point — the
    standard dual-grid input, and the reason a straight coastline lands exactly on the 0.5
    threshold at every corner along it (2 of the 4 sharing tiles are water, 2 aren't). Each land
    tile bordering water gets the true, linearly-interpolated water polygon for its corner cut
    filled (a generic corner-walk polygon extraction, `marchingSquaresPolygon`, equivalent to the
    standard 16-case lookup table without hand-writing all 16 cases) plus a soft blurred stroke
    along the actual contour; water tiles get the mirror-image land polygon, colored from the
    nearest real land neighbor. `drawEdgeBlend`'s jittered-blob approach is kept only for non-
    water terrain-pair borders (forest/plain/desert/hills/etc.), which weren't in scope.
  - **City roofs** (`drawCityRoofs`): every building now gets a small rotation jitter (±~9°) and a
    gable ridge line (reads as a pitched roof, not a flat colored box); roughly 1 in 6 dense-block
    slots opens into a gap — sometimes with a small tree circle — instead of every roof touching
    its neighbor, so a city reads as separated, slightly-irregular buildings with green breathing
    room rather than a rectangle grid.
  - **Station improvements** (`drawImprovementMarker`/`drawImprovementMarkers`): nearly doubled in
    size (radius factor 0.09 -> 0.17 of tile size, spacing 0.24 -> 0.44), moved further from the
    platform, and given a soft ground shadow, so each reads as its own small building/sign next to
    the station instead of a row of barely-visible colored specks.
- **Phone UI pass at 800×360**:
  - Bumped every clearly-primary/frequently-tapped control that was under 44 CSS px up to 44px:
    top-bar buttons (cash, pause/speed, ☰ — all fit the bar's own fixed 44px height exactly, so
    this doesn't grow the bar), panel close ✕, the New Game screen's tabs/segmented pickers/dice
    button (now used by the Settings screen too), the floating Trains/News/Goals buttons, the loco
    list's buttons in the Buy Train dialog, and this phase's own new save-slot/hint-card buttons.
    Areas that already scroll (`.new-game-content`, `.settings-content`, the loco/orders lists)
    just need a bit more scrolling now, never overlap — verified by screenshot (New Game random
    tab, Buy Train dialog) after the change. Left the small wrapped pill chips in dense pickers
    (car/loco cargo chips, order rule chips, the ☰ menu's cargo-heatmap picker) under 44px — see
    the new SPEC Deviations entry.
  - Added a regression test (`e2e/smoke.spec.ts`, second test) that loads the real production
    build (this suite always runs against `npm run build && npm run preview`, not the dev server)
    without `?debug=1`, plays through to a live game, and asserts `#debug-overlay`/`#debug-controls`
    don't exist in the DOM and `window.__game` is `undefined` — concretely proving the dev FPS
    overlay, seed/size dev controls, and debug hook never reach a real player (or the APK, which
    packages this same build), not just "the code has an `if (DEBUG)` guard".
- **Screenshots — looked at every one of these** (all at 800×360 unless noted):
  - `phase-11-load-screen.png`: 3 autosave + 5 manual slots, "My Save" shows its name, map
    ("Random map"), year, cash, and a real save timestamp; Load/Delete on the occupied slot only.
  - `phase-11-settings.png`: all 5 settings fit without scrolling, mph/grid-on/Normal-scale toggle
    states all read clearly against the dark background.
  - `phase-11-hint.png`: the hint card floats above the toolbar/Quick-build toggle without
    covering the map, toolbar, or top bar — genuinely non-blocking.
  - `phase-11-city-closeup-zoom1.5.png` and the Phase 3/us-east closeups at zoom 2
    (`phase-3-city-closeup.png`, `phase-10-us-east-closeup.png`): both show visibly separated
    building clusters with small green-gap trees dotted through them (easiest to see in the
    us-east/New York closeup, which is dense enough to make the gaps read clearly) instead of a
    solid rectangle block.
  - `phase-1.1-closeup-zoom2.png` and `phase-4-water-bridge.png`: smooth, continuously-curved
    coastlines with no pixel-stair-stepping, both at the coastline itself and around a small
    lake/inlet.
  - `phase-9-station-improvements-zoom2.png`: a shed (engine shed), an envelope (post office), and
    a pale block (cold storage — visible on a different station in the same test) are each clearly
    a distinct small icon next to the station now, not a row of dots.
  - `phase-11-no-debug-overlay.png`: a real (non-debug) game view — top bar, toolbar, floating
    buttons, and the first-game hint card all visible, with genuinely nothing dev-only on screen
    (no fps/tick text, no seed/size dropdown).
  - Kept every regenerated screenshot from running the full e2e suite (both the render-change pass
    and the CSS 44px-target pass) except the ones provably unaffected by this phase's own code —
    the zoom-0.25/"overview"-bucket renders (`phase-1-zoom-0.25.png`, `phase-3-overview.png`,
    every `phase-10-<region>-overview.png`/`-full.png`), which `TerrainRenderer` genuinely never
    routes through the new coastline/city code for (`overview = bucket === 0.25` short-circuits to
    the old flat-fill style) — per CLAUDE.md's screenshot-ownership rule, reverted those
    specifically rather than churning them on pure per-run decoration-jitter/timing noise.
- **Tests**: `npm run check` (290 unit tests, 7 new in `tests/save/`) and `npm run e2e` (59
  specs, 3 new: `e2e/saveLoad.spec.ts`, `e2e/hints.spec.ts`, plus the new smoke test) both green.
- Known issues / deviations (also recorded in SPEC.md):
  - 44px tap targets: met for every primary control, not for the dense wrapped-chip pickers (car/
    loco cargo chips, order rule chips, cargo-heatmap picker) — see the SPEC Deviations entry for
    why those were left as a carry-over rather than force-widened.
  - `GameState.stationEconomy` isn't part of the persisted save format (recomputed on load instead)
    — also in SPEC Deviations, with the reasoning (it's a pure cache everywhere else already).
  - Sound's `chug` synth exists (`src/ui/sound.ts`) but has no trigger wired up yet — `whistle`
    (buy train) and `cashDing` (delivery) cover the two clearest one-shot moments; a satisfying
    *periodic* chug tied to a moving train would need per-train playback state (so trains don't all
    chug in a cacophony) that felt like scope creep for a phase already this large — worth a follow-
    up if sound gets more attention later.
  - Load Game isn't reachable from the in-game ☰ menu (only Save Game and Settings are) — a player
    can only load a different save by returning to the title screen. SPEC/PLAN's own framing
    ("Load menu shows slot name...", the title/main menu screen owning Continue/Load) reads as a
    title-screen feature, so this was in-scope-as-specified, but an in-game "switch save" shortcut
    would be a reasonable follow-up.
  - UI scale (Small/Normal/Large) is implemented as a CSS transform on `#ui` with compensating
    box size — verified visually at Normal only this session (no code path makes Small/Large
    behave differently in kind, just the scale factor, so this is a reasonably safe bet, but worth
    an eyeball check at the two extremes if UI scale ever becomes a support question).
- Next: **Phase 12 — Performance and release hardening**.

## 2026-09-25 — Phase 12: Performance and release hardening

- **Stress scenario + perf e2e** (`e2e/stress.spec.ts`, SPEC §10.4): two new debug-only hooks in
  `src/main.ts` build the scenario without going through real drag-to-build/UI (deterministic and
  independent of procedurally-generated terrain, which would make "exactly ~1,500 buildable
  edges" non-deterministic across seeds): `debugBuildStressNetwork` lays a 5×5 grid of horizontal/
  vertical lines directly on `state.trackGraph` (bypassing `sim/commands.ts`'s cost/terrain
  validation, same precedent as the existing `debugPlaceIndustry`/`debugPlaceCity`) across a Large
  map — 1,590 edges, 3 of 5 lines in each direction double-tracked (mixed single/double per the
  brief) — plus 25 stations along the horizontal lines; `debugSpawnStressTrains` buys and
  orders N trains via the *real* `buyTrain`/`setOrders` commands, shuttling between adjacent
  stations. `FpsCounter` gained `avgTickMs` (mirrors the existing `avgRenderMs`), timed around
  `advanceOneHour` in `tickOnce()`.
  - The e2e spec builds 60 trains/~1,590 edges, centers the camera on a busy stretch of the grid
    (the default camera position mostly looks at open ground on this map — an empty-viewport
    "render" measurement would be meaningless), lets the game run for 3s wall-clock at 8× to
    freshly sample both counters, then repeats under 4× CDP CPU throttling
    (`Emulation.setCPUThrottlingRate`).
  - **Numbers** (this container, desktop Chromium headless): unthrottled sim tick ≈ **0.07–0.10 ms**
    (budget: < 2 ms) and render ≈ **0.4–1.2 ms** depending on exactly what's on screen, `avgFrameMs`
    pinned at the vsync-capped 16.67 ms (headless Chromium's `requestAnimationFrame` is exactly
    60 Hz even under zero load — the same finding Phase 1 already made, `avgTickMs`/`avgRenderMs`
    are the meaningful signals here, not the full rAF interval). Under 4× throttling: tick ≈
    **0.15–0.31 ms**, render ≈ **2.1–4.5 ms**, `avgFrameMs` ≈ **55–57 ms** (~17–18 fps) — reported
    honestly per the brief, not hard-gated (a shared cloud container under emulated throttling
    isn't a real mid-range phone, and the unthrottled numbers are what SPEC §10.4 actually commits
    to). Both are asserted with generous-but-real ceilings so a genuine regression still fails the
    test.
  - **No further optimization was needed to hit the target** — at n=60 trains the existing
    architecture already clears the 2 ms budget by roughly 20–30×. Before touching anything, the
    back-of-envelope math on the two candidate hot spots explains why: `otherTrainsInBlock`/
    `stationOccupancy` scan `state.trains` per block-entry attempt, worst case ~60 trains × 8
    edge-steps/tick × ~120 scanned entries ≈ 58k simple operations/tick — negligible in JS even
    before any indexing. Given that, I didn't rewrite the O(n²) block-occupancy scan into an
    indexed structure — it would've meant threading incremental index maintenance through five
    different mutation points in `src/sim/trains/movement.ts` (block enter, block release on
    reroute/arrival/deadlock-timeout, held-block distance bump) to preserve the *exact* current
    intra-tick semantics (a train's block/station check must see updates from every
    earlier-in-the-tick train, not a stale per-tick snapshot), for a change the measured numbers
    don't call for. Flagged here rather than silently skipped, in case a future phase raises the
    train count well past 60.
  - **What I did fix** (real, low-risk, unconditionally-hot-path wins, found while profiling):
    - `src/sim/trains/index.ts`/`movement.ts`: `TrainRuntime` now carries a `stationsById: Map`
      built alongside the block partition (same `trackVersion`-keyed cache — `buildStation`
      already bumps `trackVersion`, so this needs no separate invalidation), turning three
      `state.stations.find(...)` scans *every train, every tick, unconditionally* (not gated on
      any train state) into O(1) lookups.
    - `src/render/labels.ts` (+ reused from `src/render/stations.ts`): `ctx.measureText()` was
      called for every visible city/station label *every frame* — a real per-call cost (font
      metrics), for a value (a name's pixel width at a given font) that never changes. Added
      `measureTextWidthCached`, keyed by `font|text`, bounded (cleared wholesale past 2,000
      entries — a session that regenerates many random maps could otherwise accumulate one entry
      per generated city name forever).
  - Considered and deliberately **not** done: caching/memoizing `drawCityLabels`' per-frame
    tier/population sort (a few dozen items, genuinely trivial cost vs. the real `measureText`
    cost) and caching `main.ts`'s 4 `getBoundingClientRect()` calls for the floating buttons'
    reserved-label rects (real forced-layout cost, but tiny at 4 small fixed-position elements, and
    a naive cache keyed only on viewport size + panel-open state could go stale if a button's own
    content changes width — e.g. the unread-news badge — silently letting a label render behind a
    button; not worth that correctness risk for a cost this small).
- **Memory/long-run** (PLAN "20 in-game years at 8×… news history capped, chunk cache LRU
  eviction"):
  - The pure-sim half of this was already end-to-end covered by the existing
    `tests/sim/longRun.test.ts` (Phase 8), which runs a full **131-year** game (well past the
    20 years asked here) and already asserted `state.news.length`/
    `state.finance.netWorthHistory.length` stay capped — not duplicated, just confirmed still green.
  - **New**: `src/render/chunkCache.ts` — a small generic LRU cache (`Map`, re-inserted on every
    `get` hit and every `set` so iteration order tracks recency; evicts from the front once over
    cap). `TerrainRenderer`/`TrackRenderer` (`src/render/terrain.ts`/`track.ts`) now use it instead
    of a raw unbounded `Map`, each capped at 350 entries — comfortably above a Large map's actual
    worst case (`ceil(192/16) × ceil(128/16) = 96` chunks/bucket × 3 zoom buckets = **288**), so it
    exists as a backstop against unbounded growth over a long panning session rather than a budget
    meant to force eviction during ordinary play. Eviction correctness (touch-protects-from-
    eviction, re-set-counts-as-touch, never exceeds cap across 1,000 inserts) is unit-tested in
    isolation (`tests/render/chunkCache.test.ts`) since normal play on the biggest supported map
    never actually exercises the eviction branch.
  - **New `e2e/memory.spec.ts`**: tours a Large map across all 3 zoom buckets (a 6×4 grid of camera
    positions × 3 zooms = 72 positions) — confirmed both caches land at exactly **288/350**, i.e.
    every chunk on the map really did get cached and the cap held with headroom to spare. Then
    builds the same 60-train stress scenario (tighter 8-tile station spacing than the perf test, so
    1830-era locomotives — under 1 tile/day — actually complete a delivery inside the test's
    runtime instead of still being mid-first-leg) with a small city placed on every stress station
    (`debugPlaceCity`, since the bare grid network has no passenger supply of its own), warms up
    60 in-game days via `runDays` (fast, no rendering), then runs a real rendered multi-year
    session at 8× and samples `getFloatingLabelCount()`/`getNewsCount()`/
    `getNetWorthHistoryCount()`. Confirmed genuinely non-trivial (not just "0, trivially bounded"):
    a real run saw **3 concurrent floating `+$` labels** at peak — proving actual deliveries fired
    and the render loop's per-frame pruning (`floatingLabels.filter(...)`, already existing code)
    keeps the list from just accumulating.
- **Error boundary** (SPEC/PLAN: uncaught exception → "Something went wrong — Save & Reload" +
  emergency save):
  - `src/ui/errorBoundary.ts`: global `window` `"error"`/`"unhandledrejection"` listeners, installed
    once, as early as possible in `main()` (before map generation/first render, so even a startup
    crash is caught). On the *first* crash (a `handled` flag guards against a second error while
    the dialog is already up trying to double-write the save or stack a second dialog): writes an
    emergency save, then shows a full-screen blocking dialog. Deliberately **not** built on the
    existing slide-in `openPanel` (used for every other dialog in the game, including the goal-
    celebration one) — that always has a ✕ close button and an Android-back-button handler, either
    of which would let a player dismiss this and keep looking at a game that just proved its own
    state is unreliable. This dialog has exactly one way out (the reload button) and installs no
    back-button handler at all.
  - **Emergency save** (`src/save/db.ts`/`index.ts`): a new dedicated `EMERGENCY_SLOT_ID` slot,
    distinct from the 3 rotating autosaves (so a crash's recovery point can never be silently
    overwritten by the next monthly autosave) and the 5 manual slots (never displaces a player's
    named save). `emergencySave(state)` writes it, named "Emergency Save" so it's identifiable.
    Included in `listSaveSlots()`, so it's reachable from the normal Load Game screen and eligible
    to become "Continue" if it's the most recent save — a player who reloads after a crash can just
    hit Continue and be exactly where they were. `src/ui/saveLoadScreen.ts`'s Load-screen row list
    only includes it when it actually holds a save (unlike the always-present autosave/manual
    rows) — a permanent empty "Emergency Save" row for the overwhelmingly common case of "nothing
    ever crashed" would be confusing clutter.
  - **Debug-only test hook**: `window.__game.debugThrow(kind: "sync" | "async")`
    (`src/ui/errorBoundary.ts`'s `debugTriggerCrash`) fires a *real* uncaught exception (via
    `setTimeout`, so it's a genuine browser-level "error" event, not one the caller's own try/catch
    could intercept) or a real unhandled `Promise` rejection — exercising the actual global
    listeners end-to-end, not just calling the handler function directly.
  - **New `e2e/errorBoundary.spec.ts`** (3 tests): sync throw shows the dialog with no close button
    present anywhere in it; an async rejection shows the same dialog; and, full round-trip, a
    crash with a distinctive cash amount set beforehand → click the dialog's own reload button (a
    real navigation) → since `?debug=1` reload skips the title screen by design, navigate fresh
    without it (what a real player's post-crash reload actually looks like) → Load Game screen
    shows "Emergency Save" with that exact cash amount.
- **Release build config**:
  - `vite.config.ts`: explicit `build.minify: true` / `build.sourcemap: false` — matches Vite's
    existing defaults (verified: `dist/` already had zero `.map` files and a minified bundle before
    this change), but explicit rather than implicit, since this is exactly what `npx cap sync
    android` copies into the APK's assets.
  - `android/app/build.gradle`: `versionCode`/`versionName` now derived from `package.json`'s
    `"version"` field (currently `0.1.0` → versionCode `100`, encoding major×10000 + minor×100 +
    patch) via Groovy's `JsonSlurper`, instead of the two hardcoded `1`/`"1.0"` that were never
    bumped since Phase 2. Added a `signingConfigs.release` block that reads an optional keystore
    via 4 environment variables (`RAILROADS_KEYSTORE_PATH`/`_PASSWORD`,
    `RAILROADS_KEY_ALIAS`/`_PASSWORD`) and falls back to **no signing config at all** (not a build
    failure) when `RAILROADS_KEYSTORE_PATH` is unset — `android.yml`'s every-push `assembleDebug`
    never sets them, so it's completely unaffected; confirmed by watching that workflow's actual
    CI run on this same commit rather than assuming the Groovy parses (no Android SDK/Gradle
    available in this cloud session to test it locally).
  - New `.github/workflows/release.yml` (`workflow_dispatch` only — a signed release build is a
    deliberate act, never an every-push thing): `npm run build` → `cap sync` → decodes
    `KEYSTORE_BASE64` into a keystore file **only when that secret is actually set** (the decode
    step's own `if:` skips it entirely otherwise, so the Gradle build's fallback above takes over
    and still produces a real, valid, just-unsigned APK/AAB) → `assembleRelease` +
    `bundleRelease` → uploads both artifacts (30-day retention). `android.yml` itself is untouched
    — still builds the debug APK on every push.
  - `.gitignore`: keystore file patterns, as a backstop — the secrets mechanism above is the real
    guard, but a local keystore file should just never exist in this repo's history at all.
- **Final README**: rewritten from the Phase-2-era stub — what the game is, a features list pulled
  from what's actually shipped (regions, track/stations/trains/cargo/finance/goals/save systems,
  overlays), a short "how to play" walkthrough, install-the-APK steps (unchanged), a build section
  split into plain dev build vs. the new signed-release flow (with the one-time `keytool`
  keystore-generation + base64-encoding steps for the 4 GitHub secrets `release.yml` needs), and a
  "How this was built" section pointing at SPEC/PLAN/PROGRESS/CLAUDE.md. Status line updated to
  "Phase 12 complete — v1 feature-complete."
- **Tests**: `npm run check` — 295 unit tests (5 new: `tests/render/chunkCache.test.ts`), all
  green. `npm run e2e` — 64 specs (4 new: `stress.spec.ts`, `memory.spec.ts`,
  `errorBoundary.spec.ts`, plus the existing suite), all green. `android.yml`'s CI run on the final
  commit is the real verification the Gradle changes parse and `assembleDebug` still succeeds
  (watched via the Actions API, same practice as Phase 2).
- Known issues / deviations:
  - The O(n²)-shaped `otherTrainsInBlock`/`stationOccupancy` train-scan pattern in
    `src/sim/trains/movement.ts` was deliberately left as-is (see above) — fine at the 60-train
    scale this phase's target is defined at, but worth indexing properly (an incrementally-
    maintained per-block/per-station occupant map, threaded through the block-enter/release call
    sites) if a future phase pushes train counts well beyond that.
  - `main.ts`'s 4 `getBoundingClientRect()` calls for floating-button reserved-label rects are
    still uncached (see above) — real but small forced-layout cost, left alone rather than risking
    a stale-cache correctness bug for a marginal win.
  - The chunk-cache LRU cap (350/renderer) is sized to *not* evict during ordinary play on the
    biggest supported map (288 chunks worst case) — it's a genuine backstop, verified correct in
    isolation, but `npm run e2e`'s `memory.spec.ts` doesn't (and structurally can't, without an
    even larger contrived map) exercise the actual eviction branch end-to-end through the real
    renderers, only via the dedicated unit test.
- Next: **v1 is feature-complete per PLAN.md.** Ideas for after v1 (tunnels, more regions,
  scenario editor, transfers between trains, seasonal effects, achievements) are listed at the
  bottom of `docs/PLAN.md`, not scheduled.

## 2026-09-27 — Phase 14: UI restyle, welcome screen, cargo icons

Applied `docs/STYLE.md` §1–6 ("railway poster, modern flat") across the whole UI. Ran alongside
another session's Phase 13 (curved track/top-down trains); per this session's brief, stayed inside
`src/ui/**`/`index.html` and only touched `src/render/**` for the two things explicitly carved out
for this phase (welcome-screen background, station supply bubbles) — never `track.ts`/`trains.ts`.

- **`src/ui/theme.css`** (new): every design token from STYLE §2 (`--ink-*`, `--paper*`, `--brass*`,
  `--signal`/`--go`/`--steel`, radii, gaps, `--font-display`/`--font-ui`, type scale), plus a full
  rewrite of every component style STYLE §3 names — panel shell (header + a real `.panel-rule` 2px
  brass divider element, not just a border, so a panel with a two-line subtitle still gets the rule
  in the right place), buttons, chips, the new `.action-grid`/`.action-btn` 2-column pattern,
  segmented controls, top bar, toolbar (44→48px per STYLE), floating buttons (now round 48px
  icon-only, no more text label crowding them), toasts. This entirely replaces the ~1250-line
  inline `<style>` block `index.html` used to carry since Phase 0 — `index.html` is now just the
  document skeleton plus a `<link rel="stylesheet" href="/src/ui/theme.css">`.
- **`src/ui/icons.ts`** (new): the STYLE §5 tool icon set (24×24 inline SVG, 2px stroke,
  `currentColor`) plus all 13 cargo pictograms, exported as an `icon(name)`/`cargoIcon(cargo)` pair
  of small `<span>`-building helpers so callers drop them into `h()` trees like any other node.
  Extended the named tool list with a handful of icons STYLE's §5 list doesn't itemize but the rest
  of the UI needed to actually get to zero emoji (check, warning, wrench, water, trophy, arrowUp,
  arrowFlat, shed) — a documented, minimal deviation per STYLE's own "smallest deviation, note it"
  rule. Removed every emoji from `strings.ts` and every DOM-rendered emoji across `src/ui/*.ts`
  (toolbar icons, ⏸/☰ in the top bar, ✕ close/cancel buttons, ⚠/🔧 status text, ⚙/💧/✅ station
  badges, 🎉/🏆 the goal celebration, 🎲 the seed dice button) — the only emoji-shaped canvas draws
  left anywhere are the breakdown/warning glyphs in `src/render/trains.ts`, deliberately not
  touched since that file is Phase 13's for this session.
- **City/Station/Industry panels, STYLE §6**: `cargoChip`/`cargoDemandTile` (`src/ui/infoPanels.ts`)
  now render STYLE's actual "pictogram + amount" chip (icon + number, `--ink-700` background) and
  "pictogram tile, dimmed if unmet" demand tile, instead of the old full-cargo-color-background
  text chip — tapping either shows the cargo's name/detail in a toast, a lightweight stand-in for
  STYLE's "small popover". City panel gained a `stationsServing()` helper (walks
  `stationCatchmentTiles` against the city's own tiles) for the "Served by" line STYLE's mock shows,
  and its header subtitle is now `Tier · Population` plus a growing/stagnant arrow icon (extended
  `PanelOptions.subtitle` to accept a `Node`, not just a string, so an icon can sit next to text
  there). Station panel: supply chips now carry a thin waiting-cargo bar underneath each one
  (`supplyChipStack`) instead of a separate "Waiting cargo" section lower down — merges what used
  to be two disconnected reads of the same cargo into the one STYLE actually asks for, with any
  waiting cargo that isn't part of the station's own `supply` (e.g. from an era-gated formula
  edge case) still shown as its own zero-rate stack so nothing silently disappears. Added a
  "Trains" section (STYLE's Supplies→Demands→Trains→Improvements order) listing trains whose
  orders include this station, tap to open that train's panel — required threading a new
  `onOpenTrain` handler through `StationPanelHandlers` from `main.ts`. Improvements are now a real
  `.action-grid` of `.action-btn`s (icon/check + label + cost-on-second-line), built ones shown
  done-and-disabled with a check icon instead of a plain "✅ Name" row.
- **Welcome screen** (`src/ui/titleScreen.ts` + new `src/render/titleBackground.ts`): STYLE §4's
  overline/hero-title/brass-rule/subtitle column, Continue promoted to primary once a save exists
  (New Game demoted to secondary), version string bottom-right. The live background is a fresh
  small map generated on open, flat-rendered once to an offscreen canvas (like the existing
  region-thumbnail approach, just bigger), then panned at STYLE's ~8px/s (ping-ponging at the
  image's edges rather than wrapping, simplest way to avoid a seam) with a darkening scrim on top.
  A small procedural steam-loco silhouette runs a self-contained rounded-rectangle loop track drawn
  directly on the same canvas — deliberately its own geometry and its own tiny loco-drawing code,
  not a reuse of `src/render/trains.ts`'s vehicle renderer, specifically so this file never
  conflicts with the other session's Phase 13 rewrite of that renderer. The loop is sized wide and
  low so it peeks out on both sides of the centered button column instead of running directly
  under it. Background animation stops (`cancelAnimationFrame` + resize listener removed) the
  moment any path off the title screen is taken (New Game/Load Game submit, or the whole screen
  closing), not just on unmount, since sub-screens replace `root`'s children entirely.
- **New Game / Settings / Save-Load screens**: new shared `src/ui/screenHeader.ts` (back arrow +
  serif title) replaces each screen's own plain text header, and the New Game footer is now the one
  row STYLE actually specifies (difficulty segmented control left, starting cash middle, Start
  right) instead of two stacked rows plus a separate Back button (Back moved into the header arrow,
  matching STYLE's layout for that screen — and applied to Settings/Save-Load too for consistency,
  even though STYLE's mock only spells it out for New Game).
- **Station supply bubbles on the map** (`src/render/stationSupplyBubbles.ts`, new — the other
  `src/render/**` file this phase's scope allowed): up to 2 small pictogram bubbles float above each
  station showing its top-supplied cargo, only drawn at zoom ≥ 0.75 to avoid clutter. Reuses the
  exact cargo SVG markup from `icons.ts` (a new `cargoIconDataUrl()` export resolves `currentColor`
  to an inline `style="color:…"` on the SVG root, then loads it as an `Image` via a data URL and
  caches it per cargo type) rather than duplicating icon-drawing logic in canvas calls — so a bubble
  and a panel chip are pixel-for-pixel the same pictogram. Bubble fill is the cargo color tinted at
  ~55% over a dark base plus a light ring, matching the DOM chip's own tinted-tile look closely
  enough that dark cargos (coal) still read as "a bubble with something in it" rather than
  disappearing into a plain dark circle (checked at 4× zoom with a throwaway debug script, not
  committed).
- **A real, pre-existing test bug found and fixed, not papered over**: `economy.spec.ts`'s "train
  panel shows the current load of each car" test went from reliably green to failing ~2/3 of the
  time the moment `cargoChip` stopped putting the cargo's name in visible text. Root cause (found
  by bisecting against the pre-Phase-14 commit, not guessed): the test was clicking
  `getTrains()`'s `x`/`y`, which is the tile of the last route node the train passed
  (`t.route[t.routeIndex]`) — fine for a stopped train, wrong for a moving one, which is usually
  somewhere *between* nodes. The click had been landing on the station underneath instead of the
  train all along; it only "passed" because the station's old-style chip also rendered the cargo
  name as text ("Coal 60/mo"), which happened to satisfy the test's loose `hasText: "Coal"` check
  too. Fixed at the root rather than by loosening the assertion further: exposed the train's actual
  continuous position (`renderX`/`renderY` — the same field `findTrainAt`'s own hit-test in
  `main.ts` already uses) from the `getTrains()` debug hook, and had the test center the camera on
  that and click the exact viewport center. Reliable across 6 repeated runs after the fix (0/6
  failures), where it failed 2–5 times out of 6 in every attempt before it (including two rounds of
  the wrong fix — a click retry loop, then an extra settle-delay — before finding the actual cause).
  Also fixed a real, unmasked-by-this-same-change CSS bug: `.floating-hidden`'s `display: none` was
  losing to `.quick-build-toggle`'s own `display: flex` (equal specificity, later in the
  cascade) — added `!important` to the utility class, the one place in `theme.css` that carries one,
  with a comment explaining why.
- **Screenshots — looked at all of them, several rounds**: welcome (both before and after widening
  the decorative loop off the button column), New Game (Real World + Random tabs), city/station/
  industry panels, Finance, Train panel, Buy Train dialog, in-game top bar + toolbar, Goals panel,
  goal-celebration dialog, Yearly Report, News panel with an active toast, Load Game screen — all at
  800×360, all read as a coherent "railway poster" look: warm brass accents on dark ink surfaces,
  serif titles, no emoji anywhere, clear icon+label toolbar, chips and action grids reading cleanly
  at phone width. One thing that looked like a bug on first look (the Train panel's Speed row
  appearing to overlap the row above it in a screenshot) turned out to be a compressed-PNG/small-
  font legibility issue, not a real layout bug — confirmed by dumping every `.panel-row`'s
  `getBoundingClientRect()` in the live DOM (clean, non-overlapping Y positions, exactly matching
  the scrolled `scrollTop`/`scrollHeight`), so no fix was needed there.
- **Tests**: `npm run check` (295 unit tests, unchanged — this phase is UI-only, no `src/sim/**`
  touched) and `npm run e2e` (64 specs) both green. Updated e2e selectors for the merged supply/
  waiting-cargo UI (`stations.spec.ts`'s "Nothing waiting." text assertion → checks for
  `.supply-chip-stack`/`.chip-row` instead; `economy.spec.ts`'s `.cargo-bar-row`/`.cargo-bar-label`
  checks → checks the new mini bar under the Coal chip) rather than deleting coverage, per this
  phase's brief.
- Known issues / deviations:
  - STYLE §5's icon list names 8 named extras this UI ended up needing beyond its literal
    inventory (see above) — a deliberate, documented "smallest deviation" rather than leaving
    scattered emoji behind just to stay literally within the named list.
  - Cargo chip/demand-tile taps show a toast rather than a real anchored popover (STYLE's "small
    popover with the cargo name and details") — a lightweight stand-in given this phase's scope;
    a proper popover component (positioned near the tapped chip, dismiss-on-outside-tap) would be
    a reasonable follow-up if this is ever tightened up.
  - The mini-map overlay (`src/render/minimap.ts`, `src/ui/menuPanel.ts`) wasn't restyled — it
    predates this phase and wasn't named in STYLE §3's component list; its own screenshot
    (`phase-9-minimap.png`) still shows the pre-Phase-14 look. Worth a pass later if the mini-map
    ever gets its own STYLE entry.
  - Station supply bubbles are genuinely new map-canvas content (not just a restyle), scoped in by
    this session's own brief rather than PLAN's checklist wording alone — kept deliberately small
    (one new file, one two-line wire-up in `main.ts`, one new export in `icons.ts`) and away from
    `track.ts`/`trains.ts` to not collide with the concurrent Phase 13 session.
- Next: nothing scheduled — v1 was already feature-complete after Phase 12; Phases 13/14 were a
  visual-quality pass on top of it. Future ideas remain at the bottom of `docs/PLAN.md`.

## 2026-09-27 — Phase 13: Map visuals — top-down trains and curved track

Ran concurrently with another session's Phase 14 (UI restyle); per this session's brief, stayed in
`src/render/**`, the new `src/render/trackPath.ts`, and the A* build-path preview in
`src/sim/track/pathfind.ts` — didn't touch `src/ui/**`.

- **Shared curve geometry** (`src/render/trackPath.ts`, new): STYLE §7's fillet — a circular arc at
  every 45° bend, radius 1.2 tiles — reduces to one fixed shape everywhere it's used. Worked out
  why: the turn rule (`src/sim/track/turn.ts`) only ever lets a train through a node straight
  (`directionSteps === 0` on travel headings) or at exactly 45°; expressed as the *away-from-node*
  direction pair each of the two meeting edges has (what the renderer actually has on hand per
  edge), that's `directionSteps === 4` (straight, no fillet needed) or `=== 3` (the one bend to
  smooth) — sharper junctions (`<= 2`) already get the existing red "not traversable" marker and
  are left as plain corners, nothing to smooth for a bend no train can take. Since the bend angle
  is always 45°, the interior angle between the two rays is always 135°, so the tangent length for
  a given radius is a fixed constant (`FILLET_TANGENT_TILES ≈ 0.497` tiles at radius 1.2) — every
  fillet in the game is the same shape, just translated/rotated per node.
  - `halfFillet(nodeX, nodeY, dirThis, dirOther)`: each of the two edges meeting at a bend computes
    its *own half* of the shared arc independently — from its own tangent point to the arc's
    midpoint — using only its own direction and the other edge's away-from-node direction (no
    global "who owns this junction" bookkeeping needed; the two halves meet exactly at the
    midpoint by construction, verified in `tests/render/trackPath.test.ts`).
  - `buildEdgeGeometry(mapWidth, a, b, partnerDirAtA, partnerDirAtB)`: builds one edge's full
    curved centerline (tile units) — a straight middle piece, optionally preceded/followed by its
    own half-fillet at each end, or left un-trimmed at an end with no valid partner (dead end,
    straight-through pair, sharp junction, or the far end of a bridge, which never bends at its own
    ends — see below). `partnerDirAtX` is resolved differently by each caller: the track renderer
    scans *all* other edges at that node (any valid steps-3 direction counts, whichever edge it
    belongs to — matches STYLE's "junction: through route stays straight, diverging route uses the
    same fillet" without needing to label which edge is "the" mainline); the train renderer instead
    looks at the *specific* previous/next tile in the train's own route, since a route only ever
    actually uses one specific pair of edges at a junction, not just any valid pair.
  - `EdgePath`: an ordered straight+arc piece list with `pointAt(distance)` (position + heading)
    and `offset(dist)` (a parallel curve, used for rail pairs, double-track separation, and the
    catenary wire) — an arc offset is exactly a radius change (a circle offset a constant
    perpendicular distance is another concentric circle).
  - **A real bug found and fixed via unit tests, not by eyeballing pixels first**: position across
    a piece boundary was already continuous (an earlier hand check confirmed the (x,y) sequence was
    smooth), but *heading* flipped by exactly 180° at the internal boundary between an edge's own
    straight middle and its own fillet — i.e. two points a hair's-width apart in *position* could
    face opposite directions. Root cause: `pointOnPiece`'s arc-heading formula picked which of the
    two tangent directions is "forward" using `sign(a1 − a0)` (whichever way the stored angles
    happened to increase) — but that sign only tracks the *parametrization's* direction, not which
    physical tangent direction is actually forward for *this specific* bend (a-end fillets and
    b-end fillets need the opposite sign convention, since a b-end's `dirThis` is the edge's
    *backward* away-from-node direction while an a-end's is *forward*). Fix ended up being a single
    negation once the two cases were worked out algebraically (see the comment above `pointOnPiece`
    and `offsetPiece`, and PLAN's now-obsolete first attempt at this comment for the wrong
    derivation that motivated finding the bug). Added two regression tests
    (`tests/render/trackPath.test.ts`: "heading is continuous across the internal line->arc
    boundary..." / "...arc->line boundary at the a-end too") that fail with the old sign and pass
    with the fix — confirmed by temporarily reverting the sign and watching them fail with the
    exact 180°-off value, then restoring it.
  - This bug was invisible in rail/tie rendering (a tie is a symmetric mark either side of a point,
    so a 180°-flipped heading draws an identical tie) and in the position-only "chaining" test I'd
    already written (which happened to compare two *independently* 180°-off headings against each
    other at a shared midpoint and saw them agree) — it only became visible once something used
    heading *asymmetrically*: the catenary wire (a one-sided offset from the centerline) rendered
    as a chaotic crossing "starburst" instead of a smooth parallel curve, screenshotted, looked
    wrong, and led straight back to this. Left as a cautionary note for future geometry work here:
    position continuity is not proof of heading continuity.
- **Track renderer** (`src/render/track.ts`, rewritten): per-edge, at each end, scans the graph for
  any other edge whose away-from-node direction is a valid 45° partner (`isFilletBend`); if found,
  the edge trims and draws its own half-fillet (rails, ties, the double-track offset, the catenary
  wire — all via `EdgePath`/`tracePieceList`, which maps tile-space pieces straight into a chunk's
  local pixel space with a uniform scale/translate, so an arc stays an arc — no per-point sampling
  needed to draw it, only for ties/catenary poles which do need discrete points along the curve).
  Bridges (a single fixed structural span, SPEC §5.1's Phase-4 deviation) never trim/bend at their
  own ends — the "bridge on a curve" screenshot ask is about the *approach* track curving into a
  straight deck, not the deck itself bending. A sharp (>45°) junction still just draws to the plain
  tile center at that end, matching its existing red marker.
- **Train renderer** (`src/render/trains.ts`): `sampleBehindHead` (cars) and the loco head both now
  resolve their position via `curvedRouteSample`, which looks at the *actual* previous/next tile in
  the train's route (not a generic "any partner" scan) to decide whether either end of the current
  edge bends, then samples `buildEdgeGeometry`'s curve at the sim's own edge-progress distance —
  render-only; the sim's own `routeIndex`/`edgeProgress` bookkeeping (straight-line tile lengths)
  is untouched, so a fillet's small length difference from the straight corner it replaces (an arc
  is slightly shorter — a real, if tiny, side effect of literally cutting a corner) is absorbed as
  a barely-perceptible timing rounding, not by changing sim distances. The loco's screen position
  additionally blends the sub-tick `alpha` the game loop already provides (via
  `progressAlongEdge`, projecting the existing `renderFromX/Y` tick-start snapshot onto the current
  edge) so it keeps the pre-existing smooth interpolation *and* follows the curve — before, only
  cars ever bunched onto the actual route path; the head used a straight tile-to-tile lerp with a
  coarse compass-snapped angle, so a fast loco visibly cut every corner square before this phase.
- **New vehicle shapes** (`src/render/trains.ts`): cars now draw a distinct top-down silhouette per
  STYLE §7 by the cargo they carry (`CARGO_CAR_SHAPE`, keyed off `CARGO[type].car`'s naming) —
  hopper (coal/ore/grain: open top, load heap in the cargo color when loaded, dark when empty),
  tanker (oil/fuel: rounded cylinder, lighter top-lit stripe), flatcar (wood/steel/lumber: bare wood
  deck, cargo-colored load blocks when loaded), boxcar (food/goods: ribbed roof), livestock
  (slatted roof), passenger (lighter roof center line), mail (plain, already red via its own cargo
  color) — instead of one generic rounded rectangle for every car. Kept the existing SPEC §7 rule
  (body tinted by the cargo's own color when loaded, grey when empty) rather than STYLE's literal
  "green/maroon" passenger-livery suggestion, so a car's cargo stays identifiable at a glance
  exactly as it already was; only the silhouette is new. Sizing retuned to STYLE §7's literal zoom-1
  pixel spec (loco 16px [already matched], cars 12px, 7px width for both, 2px gaps) — previously
  cars were drawn oversized (≈17.6px) relative to their own along-route spacing, so a consist read
  as one overlapping blob rather than distinct coupled cars.
- **A\* zig-zag penalty** (`src/sim/track/pathfind.ts`): a new `CONSECUTIVE_TURN_PENALTY` (6,000,
  comparable to `TURN_PENALTY_PER_STEP`'s existing per-turn cost) applies on top of the existing
  per-turn cost whenever a 45° turn immediately follows another 45° turn — found by looking up the
  *grandparent* direction already sitting in the search's own `cameFrom` map (the direction used to
  reach the current state's parent), no extra state-space needed. Verified with a real, isolating
  test (`tests/sim/track/pathfind.test.ts`) rather than a hand-waved one: a brute-force search
  (a throwaway script, not committed) over small direction sequences found a concrete pair of
  routes to the same destination — one with 2 turns back-to-back, one with 3 turns each separated
  by a straight tile — where the *base* per-turn cost alone would make the zig-zag route cheaper
  (fewer total turns) despite being the uglier shape; confirmed by temporarily zeroing the new
  penalty and watching `findBuildPath` pick the zig-zag route, then restoring it and watching the
  choice flip to the clean one. (An earlier attempt at this test used Double mode's
  `existingTrackOnly` cost-0 edges to try to isolate the penalty from terrain cost, and hit a real,
  separate pre-existing quirk: `findBuildPath`'s octile heuristic assumes real terrain-scale costs,
  so it's badly inadmissible when edges cost 0, and can return a non-optimal path in that specific
  mode — not a Phase 13 bug, just not a mode worth building a precise test on; switched to real
  terrain cost instead, where the heuristic is admissible.)
- **Screenshots — looked at them, iterated until right** (`e2e/mapVisuals.spec.ts`, new;
  `docs/screenshots/phase-13-*.png`): each loco type (steam/diesel/electric) + a mixed freight
  consist (coal/oil/wood/food, so hopper/tanker/flatcar/boxcar all appear) on a straight and on a
  curve at zoom 2; an S-curve; a junction; a double-track curve; a bridge on a curve.
  - First pass had two unrelated problems, both fixed before the "good" versions below: (1) a
    "Goal reached!" celebration dialog covered half of every screenshot — `debugSetCash`'s test
    amount ($50M) happened to clear a random map's auto-generated net-worth goal; lowered to $2M
    (enough for every loco/car/track cost used here, comfortably under any goal's scaled
    threshold). (2) large water bodies showed through a "cleared" test area despite the helper
    setting `terrain` to plain there — the map's *rivers* are drawn by walking `riverNext`/
    `riverFlow` independently of the `terrain` array (so clearing terrain alone doesn't remove a
    river), and separately, the terrain chunk cache had already baked the original water for that
    chunk before the mutation ran; fixed by also clearing `riverNext`/`riverFlow` in the test's
    area and bumping `state.mapContentVersion` (the same counter city-growth/new-industry code
    already uses to bust the terrain chunk cache) after mutating.
  - What they show: the curve screenshots (steam-mixed, diesel, electric) all show rails bending
    through a clean 45° arc with every car individually rotated to the local tangent, coupled
    smoothly around the bend — no pivoting at the tile center, no gap or overlap between cars. The
    electric loco's catenary wire and poles trace the exact same curve as the rails, evenly spaced
    and perpendicular throughout (this is the screenshot that caught the heading-sign bug above,
    then confirmed the fix). The S-curve reads as one continuous flowing line. The junction's
    mainline is unbroken and straight its full length; the branch fillets smoothly away from the
    mainline direction it's 45° from, and still shows the pre-existing red dot on the side where
    it's a sharp 135°-from-the-other-mainline-direction pairing — correct, existing behavior for a
    3-edge junction that (like any non-symmetric junction) has one gentle side and one sharp side,
    not a Phase 13 regression. The double-track curve shows two clearly separated parallel arcs.
    The bridge screenshot shows the approach curving right up to a straight grey deck with no seam.
- **Performance** (Phase 12's stress scenario, 60 trains/~1,590 edges, re-run unchanged): render
  cost is higher than Phase 12's baseline (curve geometry + per-vehicle shape drawing costs more
  than the old straight-lerp + generic-rounded-rect approach) but nowhere near the budget — before:
  unthrottled `avgRenderMs` ≈ 0.4–1.2ms, 4× throttled ≈ 2.1–4.5ms; after: unthrottled ≈ 1.2–2.1ms
  (ceiling 16ms), 4× throttled ≈ 4.3–5.8ms (ceiling 120ms) across several runs. No optimization
  needed to stay inside budget; see the Deviations note in SPEC.md about *not* adding the
  rotation-bucket sprite cache PLAN's checklist suggested, since it wasn't needed to clear the
  target.
- **Tests**: 4 new unit tests in `tests/render/trackPath.test.ts` beyond the initial geometry suite
  (13 total in that file) — the two heading-continuity regressions above, plus the original
  tangency/midpoint-agreement/offset-consistency suite (11 tests) written *before* wiring the
  geometry into any renderer, which is what caught the very first sign bug (a plain 180°-off
  tangent heading) before it ever reached a screenshot. 1 new test in
  `tests/sim/track/pathfind.test.ts` for the zig-zag penalty. `npm run check` (309 unit tests) and
  `npm run e2e` (70 of 72 e2e tests — the 2 failures are pre-existing in the concurrent Phase 14
  session's WIP commit this branch was rebased onto, `.chip`/`.quick-build-toggle` UI selectors
  unrelated to anything this phase touched, confirmed by running the same two tests against that
  commit directly before this phase's changes) both green.
- Known issues / carry-over: the rotation-bucket sprite cache PLAN suggested for vehicle drawing
  performance wasn't implemented (see Deviations in SPEC.md) — revisit if a future phase's stress
  target grows past what plain vector redraws comfortably clear. A junction's "sharp side" red
  marker (pre-existing from Phase 4) can sit very close to a smoothly-filleted curve on its other
  side at the same node, which reads correctly but is easy to misread as a rendering glitch at a
  glance — worth a closer look if a future UI pass wants to make the two states (smooth vs. sharp)
  more visually distinct at that shared point. `docs/screenshots/phase-0-*` through `phase-12-*`
  were regenerated by running the full `npm run e2e` suite (since track/train rendering changed,
  every earlier phase's screenshot that happens to show track or a train changed too) but reverted
  via `git checkout -- docs/screenshots` before committing, per CLAUDE.md ("commit screenshot
  changes only for the phase that owns them") — only `phase-13-*.png` is new/committed here.
- Next: nothing scheduled — this and the concurrent Phase 14 (UI restyle, see the entry just above)
  were both a visual-quality pass on top of the already-feature-complete v1. Future ideas remain at
  the bottom of `docs/PLAN.md`.

## 2026-09-27 — Phase 14.1: UI fixes (review carry-over)

A small follow-up fixing five review findings against Phase 14's restyle, per `docs/STYLE.md`.
Ran after Phase 13 (curved track/trains) had already landed on `main`, so — unlike Phase 14 itself —
this session used the real `TrackRenderer`/`TerrainRenderer` freely; still stayed out of
`track.ts`/`trains.ts` themselves (no need to touch either). Scope: `src/ui/**`, `theme.css`, plus
`src/render/titleBackground.ts` and one small addition to `src/render/stations.ts` (both explicitly
in-brief).

- **Welcome screen overflow** (`src/ui/titleScreen.ts`, `theme.css`): the button stack is now a
  `.title-btn-grid` — a normal centered column ≤280px wide at ordinary heights, switching to a real
  2-column CSS grid (`max-width: 520px`) under a new `@media (max-height: 420px)` block, which also
  shrinks the title to 28px, tightens the rule/subtitle/menu gaps, and drops button `min-height` to
  38px — comfortably fits 800×360 with margin now instead of clipping Settings. An odd (unpaired)
  last button — Settings, when Continue is hidden — spans both grid columns via a
  `:last-child:nth-child(odd)` selector instead of leaving a lopsided empty cell. **Continue** is
  now built into the grid only once `latestSaveSlot()` resolves with an actual save (inserted before
  New Game, which demotes to secondary) — never rendered disabled-with-a-tooltip at all, per STYLE's
  own disabled-button rule ("show the reason as a caption" doesn't apply to a state that isn't
  reachable yet). Removed the now-dead `continueDisabled` string.
- **Welcome background rewrite** (`src/render/titleBackground.ts`, full rewrite): previously a
  hand-rolled flat-fill "overview" render plus a synthetic rounded-rectangle "loop" with its own tiny
  loco-drawing code — deliberately isolated from the real renderers back when Phase 13 was rewriting
  them concurrently. Now that Phase 13's curved-track rendering is on `main`, this reuses it for
  real: a `createGameState` map (small/normal/normal) feeds the actual `TerrainRenderer` at
  `BACKGROUND_ZOOM = 0.85` (full "detail" style — hillshading, tree canopies, river curves — not the
  flat overview fill, since 0.85 ≥ `OVERVIEW_ZOOM_THRESHOLD`), panned slowly (±70 world px, ~8px/s
  screen speed per STYLE) via a real `Camera` instead of a hand-rolled `panX`. A `findLoopSite` scan
  (up to 300 random placements, up to 3 candidate maps) locates a 9×4-tile clearing — flat land, no
  water/city/industry tiles — for a small octagonal loop (7-tile straights, 1-tile 45°-corner cuts;
  the same "walk the 8 compass directions in order" trick guarantees every corner is a legal ≤45°
  bend, no A* needed), built for real via `buildTrack` (`src/sim/commands.ts`) so the actual
  `TrackRenderer` draws it — real ties, rails, fillet curves — instead of a plain stroked rounded
  rect (the exact "reads as a UI box" complaint). The camera is centered so the loop sits in a
  left-side band, low in the frame, clear of the centered button column instead of running behind
  it. The decorative loco is still its own small self-drawn silhouette (a full `sim/trains` `Train`
  — block reservations, orders, breakdowns — is unwarranted for background scenery), but it now
  rides the *real* shared curve geometry: a small local `buildLoopPath`/`sampleLoop` pair built from
  `src/render/trackPath.ts`'s exported `buildEdgeGeometry`/`isFilletBend` (the same primitives
  `track.ts`/`trains.ts` use internally, just not their own not-exported route-sampling helpers, so
  this file still never imports from either), so the loco visibly follows the curved rails drawn
  underneath it instead of a separately-computed rounded-rectangle path. Falls back to terrain-only
  panning (no loop/train) if no clearing is found, which in practice essentially never happens on a
  "small" map.
- **Station panel name shown twice** (`src/ui/stationPanels.ts`, `src/ui/panel.ts`,
  `src/ui/icons.ts`): `PanelOptions.title` now accepts `string | Node` (mirroring `subtitle`'s
  existing precedent) so the station panel can pass its own title row — the name once, plus a small
  new `edit` icon button (documented STYLE §5 deviation, same pattern as Phase 14's `check`/`shed`/
  etc.) that swaps it for an inline `<input>` (Enter blurs/commits, Escape cancels, blur commits) —
  instead of the old title-plus-separate-rename-field duplication. Sections reordered to match
  STYLE §6 literally: Supplies → Demands → Trains → Improvements (2-col grid, unchanged) → a new
  compact `statsGrid()` (2-column key/value grid: type, catchment, max train length, storage/cargo,
  monthly maintenance — `type` folded in here from its old standalone row) → a `footer` holding only
  the single primary Upgrade action (STYLE §3: "only a single primary footer action may be full
  width"), now styled brass-filled like the placement panel's Build button instead of the plain
  outline it used to share with Water Tower/Buy Train (which stay in the body as secondary actions,
  ahead of the stats block). The placement panel (`openStationPlacementPanel`) reuses the same new
  `statsGrid()` for its own stats area, so its stats read as the same compact grid too, not just the
  built-station panel.
- **City panel action label truncation + small pictograms** (`src/ui/infoPanels.ts`, `theme.css`):
  `.action-btn-label` now wraps (`white-space: normal`, `overflow-wrap: break-word`,
  `align-items: flex-start` so a wrapped icon+label reads top-aligned instead of vertically centered
  against only the first line) instead of getting squeezed/cut — verified with a throwaway scrolled
  screenshot (not committed) showing "Civic Investment" cleanly wrapped to two lines above its cost,
  since the committed `phase-9-city-panel-civic-investment.png`/`-cooldown.png` screenshots don't
  scroll far enough to show the Actions section at all (pre-existing, unrelated to this fix). Cargo
  pictograms in the City panel specifically are bigger now: `cargoChip`/`cargoDemandTile` both take
  a new optional `large` flag (only passed `true` at the City panel's two call sites) selecting a new
  `.cargo-icon-lg` (28px tile/18px icon, vs. the usual `.cargo-icon-sm` 18px/12px) and `.chip-lg`
  (taller padding to fit it) — Station/Industry panels are unchanged. `.chip`'s fixed `height: 24px`
  became `min-height: 24px` so the taller variant isn't clipped (no visual change for existing
  24px-tall chips elsewhere).
- **Duplicate station/city label on the map** (`src/render/stations.ts`): `drawStationLabels` now
  skips a station's own label entirely when its name equals its city's name (the common case per
  SPEC §6.1's default naming — a station built right on a city tile just inherits the city's name) —
  the station building icon plus the city's own label already say everything the (now-identical,
  near-overlapping) second label would have. A station with a distinct name (e.g. "Ashtown
  Crossing", off the city tile) is unaffected and still gets its own label, confirmed in
  `phase-5-station-type.png` (one "Ashtown" label, not two) against the pre-existing
  `phase-4-junction.png`/other screenshots (unchanged, different station names).
- **Tests**: updated `e2e/titleScreen.spec.ts` (Continue is asserted absent, not disabled, with no
  save) and `e2e/stations.spec.ts` (rename flow now clicks the pencil button to reach the input,
  rather than expecting it present by default; added a wait after the rename's blur since it
  triggers two back-to-back panel re-renders whose slide-transition cleanup can otherwise still be
  in flight when the next assertion runs — the same "let the old copy clear the DOM" issue Phase 5's
  original upgrade-button assertion already worked around). `npm run check` (307 unit tests,
  unchanged — this is UI/render-only) and `npm run e2e` (64 specs) both green.
- **Screenshots — looked at them**: regenerated only the ones this fix actually touches (rather than
  the ~50 that a full `npm run e2e` run overwrites with pure debug-overlay tick-count/render-time
  noise — spot-checked one totally unrelated screenshot, `phase-4-bridge-steel.png`, byte-for-byte
  against `HEAD` and confirmed the diff was only the on-screen tick counter, nothing visual, before
  reverting the rest): `phase-10-main-menu.png`/`phase-14-welcome.png` (the welcome screen — 2×2
  button grid with no overflow, no disabled Continue, real detailed terrain background with visible
  ties on the loop track and the loco running on it, positioned off to the left rather than behind
  the buttons), `phase-5-station-panel.png` (name once as the title + pencil icon, new section
  order, brass Upgrade footer button), `phase-5-station-placement.png` (the new-station panel's
  stats as the same compact grid), `phase-5-station-type.png` (single "Ashtown" label on a
  same-named station), `phase-7-station-waiting-cargo.png` (station panel reorder, another map),
  `phase-9-city-panel-civic-investment.png`/`-cooldown.png` (bigger city cargo pictograms). All read
  correctly; no further issues spotted.
- Known issues / deviations: none beyond what's already noted above (the scrolled Actions-section
  check was thrown away rather than committed as a new spec, since an existing spec already covers
  the civic-investment button's behavior — only its *visual wrap* needed a one-off look).
- Next: nothing scheduled.

## 2026-09-27 — Phase 15: Play-test fixes (signaling, consist editing, train drawing)

The player's first real play-test found a train stuck ⚠ forever at a Depot on a single-track line
shared with a second train, plus several smaller UI/rendering issues. Landed in 4 pushed steps
(signaling rewrite, waiting-reason text, consist editing, drawing/layout fixes) per the session
brief; this entry covers all of them together.

**Root cause of the reported deadlock**: the old per-block reservation model let a train physically
enter and wait inside the block *just before* a full station, off in the open line. If the train
already in that station wanted to leave in the direction of the waiting train's approach block, its
exit was blocked by that same waiter — a classic head-on deadlock neither train's timeout logic
could resolve, because each was individually "making progress" (successfully holding one block)
right up until the moment it tried to advance into the other's.

**Signaling rewrite** (SPEC §7.5, rewritten; `src/sim/trains/movement.ts` is essentially a full
rewrite, `blocks.ts`/`types.ts` extended, `route.ts` untouched):
- **The fix, precisely**: a train never leaves a station until it has atomically reserved *every*
  block of its path up to the *next* station on its route (`tryEnterSection`, replacing the old
  one-block-at-a-time `tryEnterBlock`) — including the capacity check on that destination station.
  Since the whole path-to-next-station is checked *before* departure, a train that can't get all the
  way through simply never leaves its current platform — it can no longer end up parked mid-line.
  This one change is the actual deadlock fix; everything else below is what SPEC's rewrite needed to
  make that safe and non-regressive.
- **Sections span junctions, not stations**: scanning `train.route` forward from the departure node,
  the first station tile found (whether or not it's the train's actual next order stop) ends the
  reservation batch. A junction along the way doesn't end it — matches "junctions are not waiting
  points." Reaching a station tile that *isn't* the final route node (a through-station) is handled
  by the exact same code path as a real departure: `holdsBlockFor` is false for the fresh block
  starting there (a station is always a block boundary), so `tryEnterSection` fires again
  immediately, before the loop's next iteration would otherwise just keep advancing. If it succeeds
  the train never visibly pauses; if not, it parks there exactly like any other waiting station stop
  (and now legitimately counts toward that station's slot occupancy).
- **Same-direction sharing**: rule 1 (no opposing occupant) only checks direction, never occupant
  *count* — any number of same-direction trains can hold overlapping parts of a section. A new
  continuous check, `leaderAheadTooClose` (run every tick, not just at block entry, unlike the old
  double-track-only spacing check), caps a train's target speed to 0 whenever a same-direction
  occupant of its current block is less than `MIN_SPACING_TILES` (2) ahead — this is the "keep
  spacing and brake" behavior, and it now applies on single track too, not just double.
- **Tail-based release**: `HeldBlock` no longer stores a live `distanceInto` counter; instead each
  entry records `enteredAtDistance` (an absolute mark against a new, never-reset `train.
  distanceTraveled` accumulator) and `lengthTiles`. A block is dropped from the front of
  `heldBlocks` once `distanceTraveled - trainLengthTiles(train)` (physical consist length, from the
  same `LOCO_LENGTH_TILES`/`CAR_LENGTH_TILES` STYLE §7 constants the renderer uses) has passed its
  far end — so a following train, or opposing traffic once the direction is fully clear, can reuse
  the *already-passed* part of a long section without waiting for the whole thing to empty. Using
  one monotonic, never-reset distance counter (rather than resetting per-section) was the key
  simplification that avoided a whole class of off-by-one bugs where a lingering tail entry from the
  *previous* section would otherwise need special-casing at every section boundary.
- **Station slots**: Depot/Station/Terminal capacity raised from 1/2/4 to 2/3/5
  (`src/data/stations.ts`) per the rewritten spec — the minimum of 2 is what actually lets a Depot
  act as a passing loop at all, which was the ingredient the old capacity-1 Depot in the report was
  missing. Occupancy counts a train physically parked at the station (no active outbound
  reservation) plus any train whose *committed* `sectionTargetStationId` names it — a train merely
  *attempting* a reservation (and failing) never counts against the target it failed to reach, which
  would otherwise be a self-inflicted permanent deadlock.
- **Safety net**: `DEADLOCK_REROUTE_DAYS`/`DEADLOCK_STUCK_DAYS` raised 5/10 → 10/20 per the revised
  SPEC text. Found and fixed a real bug here while writing the new tests: `waitingForBlock` and
  `waitingForStation` are different status *strings*, and the old, shared `setStatus` helper resets
  `waitTicks` (the clock these timeouts count against) whenever the status string changes — so a
  train denied for a *different* reason on consecutive ticks (line blocked, then the moment that
  clears the platform turns out full, etc.) could flip between the two indefinitely without the
  clock ever reaching either threshold. Added `setWaitingStatus`, used only for these two statuses,
  which only resets the clock when the train wasn't already in *either* waiting state.
- **Save version bumped 1 → 2** (`src/save/format.ts`/`migrate.ts`): `Train`'s reservation shape
  changed (`HeldBlock.distanceInto` → `enteredAtDistance`/`lengthTiles`, plus the new
  `distanceTraveled`/`sectionTargetStationId`/`waitingForStationId`/`pendingConsist` fields). The old
  v1 shape is frozen as `SerializedTrainV1`/`SerializedHeldBlockV1` (independent of the live `Train`
  type) purely so `migrateV1toV2` has something concrete to convert from. Migration just drops every
  train's in-flight reservation state (`heldBlocks: []`, `distanceTraveled: 0`) — none of it means
  anything under the new model, and every train re-reserves its next section fresh on its first tick
  after load regardless, so there's nothing worth trying to translate.
- **Tests**: `tests/sim/trains/movement.test.ts`'s three pre-existing traffic scenarios (single-track
  shuttle, congested 4-train line, double-track opposing) encoded the *old* invariant "a block is
  never held by more than one distinct train" — no longer true by design once same-direction sharing
  is allowed. Replaced with `opposingDirectionCollision` (a block held by more than one *direction*
  at once — every block has exactly two possible entry directions, so this is the real invariant
  that must never break) and retitled the tests to say what they actually now assert; the congested-
  line test's `maxWaitStreak` bound also moved from the old `10 * 24` to `DEADLOCK_STUCK_DAYS * 24`.
  New `tests/sim/trains/signaling.test.ts` covers everything PLAN asked for by name: the exact
  reported shape (two trains, genuinely opposite directions — one bought fresh while the other is
  already mid-journey back, since both starting from the same shed station otherwise begin in the
  same direction — 2 in-game years, asserting on completed "loading" stops as a stand-in for
  "keeps earning" since this synthetic single-row map has no cargo economy to pay real revenue);
  3 same-direction trains sharing one section never see `waitingForBlock` (measured only up to the
  point the first one would complete the trip and turn around, which is a separate, real
  opposing-traffic scenario the middle-station test covers); a middle station letting opposite-
  direction trains actually overlap in motion, not just take turns waiting for the whole line;
  a lone train (nothing to brake behind, no breakdown) never sitting at speed 0 mid-block; a
  Depot's 2-slot capacity never exceeded by 3 contending trains; and a save/load round trip taken
  mid-section producing identical results to never saving. All of the old regression tests
  (`movement.test.ts`, `blocks.test.ts`, `route.test.ts`, `loading.test.ts`) stay green, updated only
  where they encoded the old per-block rule as above.

**Train panel waiting-reason text** (SPEC §7.5's "the train panel says what they are waiting for"):
`train.waitingForStationId` is set on every reservation attempt (success or failure) — purely
descriptive, nothing in the sim reads it back — so the panel and train list can show "Waiting for
line clear to X" / "Waiting for platform at X" (`src/ui/strings.ts`) with a small red signal dot
(new `signal` icon, matching the map's own waiting-train indicator) instead of the generic
"Waiting (block)"/"Waiting (station)" label.

**Edit consist on an existing train** (`computeEditConsistPlan`/`editConsist`/`reconcileConsist` in
`src/sim/commands.ts`; UI in `src/ui/trainPanels.ts`'s new `openEditConsistPanel`):
- `reconcileConsist` matches the new car list against the train's current cars by cargo type, in
  order (greedy, oldest-unmatched-first) — a car that persists keeps its existing load rather than
  being treated as sold-and-instantly-rebought; a new-list entry with nothing left to match is
  charged full car price; an old car nothing matched is refunded `CONSIST_EDIT_REFUND_FRACTION`
  (50%) and has its cargo dropped.
- Cash changes hands immediately when the command runs, whichever branch it takes — only the
  *physical* car swap (and any resulting cargo drop) is deferred when the train isn't at a station,
  via `train.pendingConsist = { cars, removedLoaded }`, installed by `applyPendingConsist` (in
  loading.ts, called from `arriveAtStation`) the moment the train next stops anywhere. This was a
  deliberate simplification over deferring payment too — SPEC only specifies the price, not when
  cash moves, and charging on command keeps `editConsist` consistent with every other command in the
  file (`buyTrain`, `replaceLocomotive`) rather than needing its own special-cased ledger timing.
  Noting it here as a SPEC-compatible design choice, not a literal deviation.
- Dropped cargo reuses the normal paid-delivery path (`dropCarCargo` in loading.ts, factored out of
  `applyUnload` via a shared `settleUnload`) when the current/arrival station accepts that cargo, or
  just clears the load with no revenue when it doesn't — matches "counts as unloaded without payment
  unless accepted there" exactly.
- Found and fixed a real bug while testing this: the "is this train at a station right now" check
  originally looked up the station via the train's *current order*, which doesn't exist yet for a
  train bought but never given orders (`train.status` is still `"loading"`, but `train.orders` is
  empty) — such a train could never get an immediate edit, always falling into the queued branch.
  Fixed to key off the train's actual position (`route[routeIndex]`) instead.
- Train panel restyled: the old lone "Replace" footer button became a 2-column action grid
  ("Edit cars" + "Replace"), per PLAN's "2-column grid style" ask; Sell is now the only footer
  action. A "Changes apply at next station" caption (new `.train-consist-pending` style) shows
  under the consist chips whenever `pendingConsist` is set, and again inside the editor itself when
  the train isn't currently at a stop.
- Tests: `tests/sim/trains/consist.test.ts` (pricing math, load-preserving reconciliation,
  immediate-vs-queued application, both accepted/wasted cargo-drop outcomes, era/max-cars
  validation) plus an e2e test (`e2e/trains.spec.ts`) driving the real UI end to end.

**Train drawing fixes** (STYLE §7, `src/render/trains.ts`):
- The steam loco's chimney and dome previously drew as small rectangles offset well outside the
  boiler's own width (`-w * 0.85`), which is exactly why they read as "sticking out sideways" —
  redrawn as two circles (chimney near the front, the smaller dome just behind it) both centered
  on `y = 0`, the boiler's actual centerline in this direction-of-travel-aligned local space, each
  with a thin lighter rim. Smoke puffs now originate from that same centerline point and drift
  straight back/up instead of from the old offset spot.
- Vehicles ~20% larger (`LOCO_LENGTH_TILES` 0.5→0.6, `CAR_LENGTH_TILES` 0.25→0.3 in
  `src/data/trains.ts` — these aren't just render constants, the signaling rewrite's tail-length
  math above also reads them, so both got the same bump for free; the renderer's own local
  `VEHICLE_WIDTH_TILES`/`CAR_DRAW_LEN_TILES` scaled the same ~20%) and the coupler gap tightened
  from 2px to ~1px at zoom 1 (`VEHICLE_GAP_TILES`), both still scaling with zoom as before since
  they're tile-space constants converted to screen pixels at draw time, not fixed pixel values.
- Verified by screenshotting a loco at zoom 1 (`phase-15-steam-zoom1.png` etc.) — previously this
  would have been the smaller, harder-to-read size the play-test complained about.

**Station supply bubble pictograms**: root-caused rather than guessed at. `stationSupplyBubbles.ts`
(added in Phase 14) already tried to draw a pictogram inside each bubble via `cargoIconDataUrl` and
`drawImage`, gated on `img.complete && img.naturalWidth > 0` — but `cargoIconDataUrl` built its
`<svg>` markup without an `xmlns` attribute. That's fine when the same markup is inserted via
`innerHTML` into an existing HTML document (a browser infers the SVG namespace for inline content),
but loading it standalone as an `<img src>` data URI — which is what feeding it to canvas
`drawImage` requires — needs well-formed, namespaced XML; without it the image silently fails to
decode, `naturalWidth` never becomes truthy, and only the plain background circle (ordinary canvas
arcs, unaffected) ever drew. Confirmed the failure directly (a minimal repro in a browser context:
the same markup rejects with an `img.onerror` event without `xmlns`, resolves fine with it) before
fixing `cargoIconDataUrl` to add it.

**Bottom-right button overlap**: `.quick-build-toggle` and `.train-list-button` both sat at
`right: 8px; bottom: 8px` — literally the same corner, so the round Trains button always sat on top
of the Quick build toggle's label (confirmed visually: the toggle read as "Quic" with a black circle
over the rest). The Trains/News/Goals buttons are always created unconditionally at game start, so
rather than hide any of them, moved `.quick-build-toggle` to `bottom: 176px`, just above all three
(they're always present, stacked at 8/64/120px, each 48px tall: 120+48+8). New e2e regression test
(`e2e/upgrades.spec.ts`) asserts no bounding-box overlap between the toggle and any of the three
buttons at both 800×360 and a real phone ratio (890×400).

**Screenshots — looked at all of them**: `phase-15-steam-zoom1.png`/`-diesel-zoom1.png`/
`-electric-zoom1.png` (each loco on a straight run into a 45° bend at zoom 1 — chimney/dome read as
small centered dots, not sideways nubs, and the whole consist is legible at this size now);
`phase-15-trains-passing-middle-station.png` (two steam trains, one on each side of "Oakbarwood
Crossing 2", genuinely passing each other rather than one waiting the whole line out);
`phase-15-waiting-reason.png` (Train 2's panel reads "Waiting for line clear to Oakbarwood Crossing
2" with the red signal dot, next to the plain Status row above it); `phase-15-consist-editor.png`
(the add/remove car picker, seeded and mid-edit); `phase-15-bottom-right-buttons.png` (Quick build's
label fully legible, clear of all three round buttons). All read correctly as intended.

**Deviations from the SPEC/PLAN text**: none beyond the cash-timing note on `editConsist` above
(a compatible design choice, not a behavior change from what's specified).

- Next: nothing scheduled — this closes out the play-test punch list. Future ideas remain at the
  bottom of `docs/PLAN.md`.

## Phase 16: Play-test 2 fixes

Second play-test (Trieste/Ljubljana, 1840) filed two bugs: double track rendered as two full-size
tracks far apart with awkwardly splayed single↔double transitions, and opposing trains riding the
shared centerline and passing straight through each other; separately, "I don't understand the
passenger numbers" — cars only ever loaded a full, cargo-agnostic `CARLOAD_UNITS` (20 abstract
units), so a small town's real supply (well under a carload) never accumulated enough and passenger
cars always left empty. Worked Part B (the gameplay bug) first, per CLAUDE.md/PLAN, starting from a
new regression test that reproduced the bug against the pre-fix code before touching anything.

**Real cargo units + partial loading** (`src/data/cargo.ts`, `src/sim/trains/loading.ts`):
- Every cargo now has a real per-car `capacity` (passengers 40, mail 30, most freight 20, livestock
  15, oil/fuel 100) plus a short `unit` word and a full `unitsNoun` phrase for UI text, replacing the
  one-size-fits-all `CARLOAD_UNITS` as the actual car cap. `TrainCar.loaded` (boolean) became
  `loadedUnits` (0..capacity).
- `cargoUnitFactor(cargo) = capacity / 20` (the old flat carload size) scales every table that was
  tuned in the old abstract-unit scale — `src/data/industries.ts`'s livestock/oil/fuel
  produces/consumes, `src/data/cities.ts`'s passenger/mail supply divisors, and
  `stationStorageCap`'s per-cargo waiting-pile cap (`src/sim/stations/improvements.ts`, now takes an
  optional `cargo` param) — so carloads/month (and carloads of storage) are unchanged from before
  Phase 16, exactly as PLAN asked. Coal/ore/grain/wood/steel/lumber/food/goods all keep their old
  20-unit capacity, so their numbers are untouched.
- Found a real bug while doing this: `processIndustryMonth`'s "any"-recipe industries (Food Plant's
  grain-or-livestock) summed consumed inputs unit-for-unit toward the shared output cap — fine when
  every cargo shared one carload size, wrong now that a carload of livestock (15) is smaller than a
  carload of grain (20). Rewrote it to sum in carload-equivalents (`inputStock[cargo] /
  CARGO[cargo].capacity`) so a full carload of either input contributes the same output regardless of
  its real unit count (`tests/sim/economy/processing.test.ts` updated with round-number inputs that
  exercise this).
- `planLoadUnload`'s Auto rule now loads any positive amount up to capacity instead of requiring a
  full carload (the actual bug fix), and `applyLoad` tops up a partially-loaded car on each later
  attempt rather than only ever filling once — which is what lets "Wait for full load" keep
  accumulating across its extra-wait days exactly as before, just now able to reach partial-then-full
  instead of only ever being 0% or 100%.
- Revenue pays per unit delivered: `computeRevenue` itself is untouched (still "per one full
  carload", so its own unit tests didn't need to change) — `settleUnload` just scales the result by
  `loadedUnits / capacity`. City growth score and the `delivered` goal's cargo counter both read a
  new `carloadEquivalent(cargo, units) = units / cargoUnitFactor(cargo)` instead of the raw units, so
  a full car of *any* cargo still contributes exactly what it did pre-Phase-16 (a full 100-barrel oil
  tanker doesn't suddenly count 5× more than a full 20-ton coal hopper toward a city's growth score or
  a "deliver N carloads" goal) — this is the one piece of Phase 7.1-era balance math that needed an
  explicit normalization rather than falling out of the capacity tables alone.
- Save migration v2→v3 (`src/save/migrate.ts`): a v2 car's boolean `loaded` maps to 100%/0% of its
  cargo's new capacity (a v2 train was always exactly full or empty, so this is lossless); every
  stored `stationCargo` pile amount and `industryEconomy` inputStock/monthlyOutput figure is
  rescaled by `cargoUnitFactor` so a loaded save keeps the same carload counts it had before. Needed
  a frozen `SerializedTrainCarV2` (mirroring the existing `SerializedHeldBlockV1` pattern) since
  `SerializedTrainV1`/`V2` would otherwise silently pick up the *new* `TrainCar` shape through their
  `Omit<Train, ...>` definitions once `TrainCar` itself changed.
- Balance tests (`tests/sim/balance.test.ts`) stayed green with no retuning, as PLAN hoped — partial
  loading makes cars fill more eagerly but for the same total revenue over time, since the conversion
  keeps carloads/month identical.

**UI wording** (`src/ui/strings.ts`, `infoPanels.ts`, `stationPanels.ts`, `trainPanels.ts`,
`main.ts`): every cargo count now says what it means, consistently:
- City/station Supplies chips: "270 / month" / "94 bags / month" (previously the city panel showed
  a bare number with no unit or rate at all — the literal complaint — while the station panel used an
  inconsistent "/mo" abbreviation).
- Station panel: a new `strings.station.waitingCount` line under each waiting-cargo bar ("20 tons of
  coal waiting"), so the bar's fill has an actual number next to it. `stationStorageCap` needing a
  `cargo` argument now meant `economyBody` takes the `Station` itself instead of a single precomputed
  cap, since each cargo's cap is a different number.
- Train panel car chips: "Coal 20 / 20 t" / "Passengers 28 / 40" with a small per-car fill bar
  (reusing the `supply-chip-stack` + `cargo-bar-track.mini` pattern already used for station supply
  bars); "Empty (Coal)" only when `loadedUnits` is truly 0.
- Buy Train/Edit Consist car picker: each option's label became `carTypeLabel(cargo)` — the cargo's
  `carLabel` (e.g. "Passenger car", "Coal hopper" — a new cargo.ts field) plus its capacity ("40
  seats" for passengers specifically, `capacity + unit` for everything else).
- Floating delivery label: "+$169 · 22 tons of coal" (`DeliveryEvent` gained an optional `units`
  field — optional so `SaveFileV1`/`V2`'s already-always-drained `pendingDeliveries` array didn't need
  its own migration step for one cosmetic field).

**Double-track turnout rendering + per-lane trains** (`src/render/trackPath.ts`, `track.ts`,
`trains.ts`): re-derived from scratch rather than patched, because the old model (two tracks
symmetrically offset ±half the spacing from a shared centerline) can't produce a clean turnout at
all — neither track "is" the single-track line on the other side of a transition, so both would have
to bend, which is what produced the reported splay. New model: one track ("through") is always
*exactly* the centerline; the other ("diverging") sits `DOUBLE_TRACK_SPACING_TILES` (0.28 tile, SPEC
§5.1's number) to one side, eased from 0 up to full spacing over `TURNOUT_EASE_TILES` (1 tile,
clamped to half the edge) wherever it doesn't continue into another double edge
(`hasDoubleNeighborAt`, checking the graph — deliberately simpler than the centerline fillet's own
bend-angle-aware partner search, since any connected double edge reads as "double continues here" for
tapering purposes). The through track needs no special handling anywhere — it's drawn exactly like a
plain single track always — only the diverging track's rails/ties are sampled as a polyline with a
per-point variable offset (`doubleTrackOffsetAt`, shared by the track and train renderers so a
train's lane always lines up with the rail actually drawn), since `EdgePath.offset(dist)` only
supports one constant offset for a whole edge (arcs included).
- Ties: one shared, widening tie per sample (spanning the through track's own outer rail to the
  diverging track's growing outer rail) instead of two independent full-width tie sets — SPEC §5.1's
  "shared ballast bed", and incidentally what stops the two tracks' ties from visually colliding at
  the tighter 0.28-tile spacing (the old symmetric model's ~0.31-tile gap was already this tight; two
  independent tie sets at 0.28 would have overlapped even more).
- Trains: `curvedRouteSample` (src/render/trains.ts) now applies a lane offset — 0 (through) for the
  direction that matches the edge's own canonical `a→b`, the diverging track's offset (sign-flipped
  to account for its path running the opposite way) for the reverse direction — so opposing trains
  physically ride the two different rails drawn, easing together at exactly the same turnout the
  track renderer draws. Render-only, per CLAUDE.md's sim purity rule and PLAN's own note: sim
  movement/block-reservation is completely untouched.
- **Deviation**: PLAN's train-lane bullet says "offset from the centerline by half the track
  spacing" (implying the old symmetric model), but its own turnout bullet requires "one track
  continues straight on the centerline side" — those two are mutually exclusive (a strictly symmetric
  ±half-spacing pair has no track that's actually *on* the centerline). Implemented the turnout
  bullet literally, since a working splay-free turnout is the harder, more load-bearing constraint
  and the whole point of this rewrite; the train lane offset follows from that (0 or full spacing, not
  half), which is what actually lines a train up with a real drawn rail rather than the empty space
  between two half-offset tracks.
- New `tests/render/trainLanes.test.ts` (render-geometry, no DOM): opposing trains land ≥0.2 tile
  apart on a double stretch (PLAN's own acceptance number), share the centerline on single track, and
  ease together (not jump) right at a single↔double transition.

**Screenshots — looked at all of them**: `phase-16-double-track-turnout.png` (two steam trains
passing side by side through a double-track curve, clearly on separate parallel rails, with the west
turnout visible at the left edge easing from single to double); `phase-16-single-double-transition.png`
(a tight close-up on that turnout: single track cleanly forks into two via a short S-curve, no
splay, no crossing ties); `phase-16-train-panel-fill.png` (a coal car reading "Coal 20 / 20 t" next
to the still-empty "Empty (Coal)" car); plus re-captured (already-existing, now materially different)
`phase-3-city-panel.png` ("270 / month" / "94 bags / month" replacing the old bare "135"/"63"),
`phase-7-station-waiting-cargo.png` ("20 tons of coal waiting" under the bar), and
`phase-7-delivery-label.png` ("+$169 22 tons of coal"). All read correctly as intended; the rest of
the e2e suite's screenshot diffs (map-gen/UI layout incidental, not Phase 16 content) were reverted
per CLAUDE.md's "commit screenshot changes only for the phase that owns them".

**Tests**: `npm run check` (typecheck, lint, 328 unit tests) and `npm run e2e` (81/81, including the
two new Phase 16 screenshot tests and the pre-existing suite) both green.

- Next: nothing scheduled — this closes out the second play-test's punch list. Future ideas remain
  at the bottom of `docs/PLAN.md`.

## 2026-09-27 — Phase 16.1: Double track at stations and turnouts (play-test 3)

Third play-test (Ljubljana, Trieste, 1840): where double track meets a station, the two tracks
pinched to a point right at the station tile (a visible "kink"), ties crossed in a messy fan there,
and a curve near a station could draw a fillet arc through the station's own tile. Root cause: the
Phase 16 turnout model tapers a double edge's diverging track to 0 exactly at whichever node has no
*other* double edge — true for a plain mid-line transition (where the pinch point is just the
single track's own line, correct), but wrong at a station, which should show a full-width passing
loop across its own tile regardless of what the far side is. Render-only throughout, per PLAN's
brief — `src/sim/**` (movement, block reservation) is untouched; every existing sim/render test
stayed green with no changes.

**Shared geometry** (`src/render/trackPath.ts`):
- `TURNOUT_EASE_TILES` raised from 1 to 1.5 tiles (PLAN's "≥ 1.5 tiles" — applies to every
  single↔double transition, station-adjacent or mid-line, since both share the one easing function).
- `isPassingLoopStation(graph, node, stationTiles)`: true iff `node` is a station tile with some
  double edge touching it. A double edge's own taper flags (in both `track.ts` and `trains.ts`) now
  also check `!stationTiles.has(node)` directly — a station never pinches a touching double edge's
  spacing to 0 at itself, independent of `hasDoubleNeighborAt`'s existing "some other double edge"
  check, which is what actually produced the reported kink (a station between one double edge and
  one single edge previously read as "no other double edge here" and tapered to 0 right at the tile).
- `stationApproachOffsetAt(distanceFromStart, edgeLength, approachAtStart, approachAtEnd)`: the
  displaced turnout. Mirrors `doubleTrackOffsetAt`'s shape but inverted — full spacing right at a
  passing-loop station's end of a *single*-track edge, decaying to 0 over `TURNOUT_EASE_TILES`
  moving away from it — so the merge back to single track happens on the single-track side, past the
  station tile, not pinching at the tile itself. Reasoned through (and verified with the new unit
  tests) that this needs no extra sign-flip logic despite living on a different edge than the double
  one: `TrackEdge.a < b` always, so a straight line's edges all share the same canonical `direction`
  (the compass direction from the numerically lower tile to the higher one), which is exactly the
  "+90°" convention every offset in this file is drawn relative to — so the ghost track's "+" side
  automatically lines up with the real double edge's own diverging rail at the shared node, with no
  extra bookkeeping about which literal edge is on which side of the station.

**Track renderer** (`src/render/track.ts`):
- Never resolves a fillet partner at a station's own node (`partnerA`/`partnerB` short-circuit to
  `null` when `stationTiles.has(edge.a/b)`) — "the station tile is always straight" (PLAN). Since
  `canPlaceStationAt` (existing, unchanged) already refuses to place a station on a bend tile itself
  (only a straight-through or dead-end tile), this only ever matters for a station one tile back from
  a bend — confirmed by a new e2e screenshot that such a station's own tile stays straight while the
  curve starts cleanly past it.
- `drawEdge` now computes one `secondaryOffsetAt` function per edge, station-aware, covering three
  cases with the *same* rail/tie-drawing code (no separate branch to keep in sync): a genuine double
  edge (existing behavior, station-aware taper), a single edge with a passing-loop station at one or
  both ends (the new ghost approach), or neither (plain single track, unchanged). This is also what
  satisfies PLAN's "ties drawn once" bullet — the shared widening-tie call was already written
  generically enough to take whichever offset function applies, so the ghost approach reuses it
  as-is rather than adding a second tie code path that could disagree with the first.

**Train renderer** (`src/render/trains.ts`): `laneOffsetTiles` and `curvedRouteSample` both gained a
`stationTiles` parameter (optional, defaulting to empty, so the existing Phase 16 unit tests didn't
need touching) and apply the identical two rules — no taper at a station node, no fillet through
one — so a train's lane visually lines up with the rail the track renderer actually draws all the
way up to the platform, instead of sliding back onto the centerline just before arrival like the
track used to. `drawTrains` now takes the live station-tile set and threads it through.

**Station icon** (`src/render/stations.ts`): `drawStations` now checks
`graph.edgesAt(station.tile).some(e => e.double)` and, when true, draws a new
`drawPassingLoopStationIcon` instead of the plain single-track one — two parallel platform-track
rails (matching `track.ts`'s own through/diverging offsets exactly, so the icon never contradicts
the rails drawn under it) with the platform and building both positioned beyond the diverging
track's own outer rail. **Went through one real iteration here, not just written and assumed
correct**: a first version put a thin "island platform" in the ~9px gap between the two tracks and
the building just past the diverging track's tie extent — looked, per CLAUDE.md, at the actual
screenshot before calling it done, and it read as a confusing brown smear overlapping the ties
rather than a clean building. Wrote a throwaway debug spec (bright-colored markers at known local
coordinates, deleted after) and sampled the PNG's raw pixels column-by-column to confirm the
geometry math was already correct — the rotation, the origin, the offsets all landed exactly where
computed — the problem was purely that "beyond the diverging track" left only a few px of daylight
before the building, indistinguishable at these colors and this zoom. Fixed by dropping the
between-tracks island platform entirely and pushing *both* the platform strip and the building a
fixed clearance (`size * 0.16`, past the diverging track's own `tieHalfLenTiles` reach) beyond the
outer rail — re-screenshotted and this time it reads as a clear building beside two distinct tracks.
`dirIndex` for the rotation is the touching double edge's own canonical `direction` (not "away from
this station", which can flip 180° depending on which end the station sits at) — same reasoning as
the sign-convention note above, needed so the icon's "+local y" always lands on the same physical
side as `track.ts`'s own diverging offset regardless of which side of the station the double edge is on.

**`main.ts` wiring**: a `stationTiles: ReadonlySet<number>` is now maintained alongside `state`,
recomputed via `refreshStationTiles()` on every path that adds a station (`buildStation`'s success
case and the debug stress-network builder — there's no bulldoze-station command, so build is the
only place this set changes) and handed to `TrackRenderer.setStations` (which busts its chunk cache,
same pattern as `invalidateTiles`), plus `drawStations`/`drawTrains` each frame.

**Deviation**: PLAN's own "curves adjacent to stations" bullet talks about a fillet arc overlapping
a station tile, which reads as if a station could sit *at* a bend — it can't (`canPlaceStationAt`
requires a straight-through or dead-end tile, unchanged, pre-existing). Interpreted this as "no
fillet through a station's own node, and no fillet bleeds into a station one tile away from a
bend" — the latter was already geometrically impossible before this phase (the fillet's own tangent
length, ~0.497 tile, is shorter than any real edge's minimum 1-tile length), so the actual fix here
is entirely the "no fillet at the station's own node" rule, covering the case that previously *was*
reachable (a station literally on what would otherwise be a bend node — since a bend needs two
tiles' worth of direction change, both of its nodes are non-straight and neither was ever a legal
station tile either, so this case turned out to be unreachable too; the rule is still correctly in
place and tested, just belt-and-suspenders against a future change to fillet geometry or placement
rules).

**Tests**:
- `tests/render/trackPath.test.ts`: `isPassingLoopStation` (true only for an actual station tile a
  double edge touches) and `stationApproachOffsetAt` (full spacing right at the approach end(s),
  decaying to 0 by `TURNOUT_EASE_TILES`, larger of the two sides on a short edge with both ends
  approaching).
- `tests/render/trainLanes.test.ts`: a reverse-direction train's lane separation at a passing-loop
  station stays at the full `DOUBLE_TRACK_SPACING_TILES` right at the station node (contrasted
  directly against the same setup with an empty station set, which still pinches to 0 — demonstrates
  this is actually the station-awareness fix, not a general widening); and a route through a real
  45°-bend junction (the same geometry `trackPath.test.ts`'s own chaining test uses) reaches the
  exact tile center when that node is marked a station, instead of the fillet-trimmed point it
  reaches without one.
- `npm run check`: typecheck, lint, and 334 unit tests (5 new) — all green, no existing test changed.

**Screenshots — looked at them critically against the player's complaint** (new
`e2e/phase16-1.spec.ts`, `docs/screenshots/phase-16-1-*.png`):
- `phase-16-1-station-straight.png` (+ a `-zoom1.5` variant): a station sitting between two fully
  double edges. Two rails clearly pass through the tile at their full, non-tapered spacing (the "no
  pinch" fix — though since both neighbors are already double, `hasDoubleNeighborAt` alone would
  actually have already avoided a taper here even before this phase; this shot mainly confirms the
  new passing-loop icon reads cleanly, a small brown building with a peaked roof sitting clearly
  beside, not on, the tracks).
- `phase-16-1-station-curve.png`: a station one tile back from a 45° bend (the closest a station can
  legally sit to one). The station's own tile is flat/straight; the curve begins visibly only in the
  next tile over, with no rail bleeding into the station tile and no crossed ties at the join.
- `phase-16-1-station-single-double.png`: the scenario the play-test screenshots actually showed —
  single track running into a station, double track starting on the far side. The single line stays
  a single thin line right up to and through the station tile (matching the through track's own
  unbroken line — no visible pinch or kink *at* the station), and the second track eases in smoothly
  over the following tiles once clear of the station.
- `phase-16-1-mid-line-transition.png`: an ordinary transition away from any station, now easing
  over the full 1.5 tiles instead of 1 — reads as a longer, gentler S-curve than the old Phase 16
  screenshots of the same kind of transition (those weren't recaptured here, since this phase doesn't
  own them, but the geometry change is the same one shown in this shot).
- `phase-16-1-two-trains-at-station.png`: two steam locos, bought from the same depot (the only
  station with an Engine Shed — the first one ever built — so both trains necessarily start there;
  the second wasn't dispatched until the first had already reached the far depot and turned back, to
  get a genuine opposite-direction meeting rather than two trains bunched up going the same way),
  both dwelling ("auto" load rule) at the double-touching middle station at once. They render on
  visibly separate parallel lanes rather than stacked on one centerline.
- All five read as intended on inspection; the rest of a full `npm run e2e` pass's incidental
  screenshot diffs (unrelated phases whose track/train renders shifted slightly, mostly fps/tick
  counter text) were reverted per CLAUDE.md's "commit screenshot changes only for the phase that owns
  them" — including Phase 16's own two turnout screenshots, even though the longer ease value does
  visibly affect them; left for whichever future session next touches Phase 16's own files to
  recapture.

**Tests**: `npm run check` (typecheck, lint, 334 unit tests) and `npm run e2e` (86/86, including the
five new Phase 16.1 screenshot tests and the entire pre-existing suite) both green.

- Next: nothing scheduled — this closes out the third play-test's punch list. Future ideas remain at
  the bottom of `docs/PLAN.md`.

## 2026-09-28 — Phase 17: Play-test 4 fixes (consist gaps, general lane geometry, tap targeting)

Fourth play-test (Trieste, 1840): (1) a visible gap between the loco and its first car on diagonals,
(2) double track "still problematic at times" (a transition landing on a curve next to a station gave
crossing tie fans / an X), (3) tapping the town instead of the station. Done in three pushes: Part C,
then the failing consist test, then the geometry rewrite (A+B). `src/sim/**` untouched — all
pre-existing sim/determinism/balance tests pass unchanged.

### C. Tap targeting (`src/ui/picking.ts`, `src/ui/chooser.ts`, `handleTap` in `src/main.ts`)
- Priority trains > stations > industries > cities. Stations have a touch radius of
  `max(28 CSS px, half a tile at the current zoom)` around the station tile centre (`stationTouchRadius`),
  so a tap anywhere near a station inside a city opens the station, never the city.
- Station vs industry both in reach and the tap not on the station's own tile → small chooser popup
  (icon + name per entry, `data-testid="chooser"`). Train hits win outright (existing hit radius).
- While a train's orders are being edited ("+ Add stop", the `stationPickHandler` mode) only stations are
  pickable: a tap near a station picks it; on a city/industry it picks the station serving it (one → picked,
  several → chooser of stations, none → toast "No station in <name> yet").
- City panel "Served by" names are now buttons that open the station panel (`stationsServingList`).
- Deviation/decision: the Station (build) tool still uses exact-tile hit-testing for existing stations, since
  placing a station next to one needs tile precision. "Edit orders" only exists inside the Buy Train dialog
  today; the picker is generic so a future orders editor gets the behaviour for free.
- Tests: `tests/ui/picking.test.ts` (ranking rules) and `e2e/phase17.spec.ts` (station inside city opens the
  station; far city tile still opens the city and served-by opens the station; order-edit tap on the city
  adds its station; chooser appears for a station next to an industry).

### A. Consist spacing
- Root cause (measured, not guessed): `sampleBehindHead` placed the first car `LOCO_LENGTH + gap +
  car/2` behind the head point, but the loco was *drawn centred* on that same point, so every consist had
  half a loco length (~9.6px at zoom 1) of extra gap after the loco — on every angle (it just looked worst on
  diagonals/curves where it was unmistakable). Parked trains (route = `[stationTile]`) had all cars stacked
  on the head, and cars beyond a short route history bunched up.
- The failing test came first (`tests/render/consistSpacing.test.ts`, committed red: gap 10.6px vs 1px).
  It now passes: horizontal, diagonal and 45° curve at zoom 1 and 2, every gap within ±0.5px of
  `VEHICLE_GAP_TILES × 32 × zoom`.
- New layout (`layoutConsist` in `src/render/trains.ts`, `placeVehicles` in `laneGeometry.ts`): the head
  position is the loco's *nose*; each vehicle occupies the next `length` tiles behind it by **arc length**
  along the same lane path the rails are drawn from; a vehicle is drawn between the lane points at its two ends
  (centre = chord midpoint, heading = chord), so facing ends are exactly one coupler gap apart along the
  rails at any angle/curvature. Behaviour changes worth knowing: the loco is drawn ~0.3 tile further back than
  before (nose at the sim head, which is also what the signalling tail-length math assumes); parked trains
  lie along the approach track instead of stacking; a short route history is extended backwards along the
  track (`extendChainBackward`); after a route fold (reversal at a terminal) the tail continues along
  whatever track lies behind the fold instead of landing on top of the head.

### B. General lane geometry (`src/render/laneGeometry.ts`, `track.ts`, `trains.ts`)
- One model: a **centerline path** per strand (straights + the existing STYLE §7 fillet arcs) and a
  **lane half-width `w(s)`** (0 single, `DOUBLE_TRACK_SPACING/2` double, smoothstep-eased). Two lanes at
  `±w(s)`, symmetric — nothing depends on canonical edge order any more. Old model: one "through" track on the
  centerline and a "diverging" one offset to the `+` side of the edge's canonical `a→b` direction; on a bend
  the canonical direction flips between consecutive edges, so the diverging side flipped too, which is what
  produced the crossing tie fans / X on curves.
- **Ties: one set per strand**, fixed arc-length spacing, perpendicular to the centerline, spanning
  `±(w + overhang)`. Rails: outer rail of each lane always; inner rails only once the lanes are a full gauge
  apart (they start as a V at the centerline, like a turnout frog) — this removed the rail "bow-tie" X that the
  first version of the new model still had when two tracks merge.
- Strands = maximal runs through degree-2 nodes. At junctions every traversable 45° bend gets a short
  **connector arc** (identical to the fillet a bending train follows); the branch strand is trimmed to the
  connector's tangent point and the through line stays straight and untrimmed.
- **Easing is now measured along the path, not per edge.** Graph edges are one tile long, so the old per-edge
  "1.5 tile ease" (`min(1.5, edgeLength/2)`) was really 0.5 tile in practice — much of the "kink" was that.
  `LanePath.halfWidthAt` looks along the path (up to `TURNOUT_EASE_TILES`) for the nearest non-split node
  (double edge) or split node (single edge next to a passing loop).
- Node rule (`nodeIsSplit`): both lanes apart at a station touching a double edge (passing loop) or where a
  double line passes through (two double edges ≥135° apart — a single branch can attach and gets a "ghost"
  funnel). Everything else is drawn single, so double tapers to one track there.
- **Transitions on curves** (PLAN's "shift or extend" choice): extend. The offset keeps easing continuously
  across the fillet arc (`w` is a function of arc length, lanes are `±w` off the centerline), so no transition
  restarts on an arc and no tie fans; verified by the "lanes never cross / never swap sides" unit test on an
  S-curve and by screenshots.
- Stations, junctions, bridges: same model. Bridges are a wide deck over a strand range with the rails drawn
  on top (they were bare decks before); fillets may now lead into a bridge (the deck follows the path).
  Passing-loop station icon just uses the symmetric lanes.
- Trains: `layoutConsist` builds a `LanePath` for the recent route window (history + 3 nodes ahead, because the
  easing looks ~1.5 tiles ahead) with fillets exactly where the drawn strands/connectors have them, and rides
  lane `+1` (the right-hand side of travel), so opposing trains use the two drawn rails.
- Removed: `doubleTrackOffsetAt`, `hasDoubleNeighborAt`, `isPassingLoopStation`, `stationApproachOffsetAt`
  (trackPath.ts), `drawVariableOffsetLine`/`secondaryOffsetAt`/`drawEdge`/`findFilletPartnerDir`
  (track.ts), `laneOffsetTiles`/`curvedRouteSample`/`sampleBehindHead`/`routePartnerDir` (trains.ts).
  `buildEdgeGeometry`/`halfFillet` stay (title background + tests). `TrackRenderer.invalidateTiles` now also
  drops chunks within two tiles of a changed tile, since one node can re-shape its neighbours.
- Tests: `tests/render/laneGeometry.test.ts` (path continuity, node positions on the path, easing spans
  edges, lanes never cross on a curve, opposing lanes exactly one spacing apart, passing-loop station,
  junction connector = route fillet, branch trimmed / through line whole), `consistSpacing.test.ts`. The
  Phase 16/16.1 unit tests for the removed functions were replaced by these.
- **Performance** (Phase 12 stress scenario, 60 trains / ~1500 edges, budgets 16 / 120 ms render):
  before → after: unthrottled avgRender 1.16 → 1.47 ms (tick 0.105 → 0.090), 4× throttled avgRender
  5.18 → 7.04 ms (tick 1.28 → 1.15). Well inside budget. `npm run check` (351 unit tests) and the full
  `npm run e2e` (95 tests) pass.

### Screenshots — looked at critically (`docs/screenshots/phase-17-*.png`, rendered at 2× device scale)
Cropped and magnified the important spots to check rails/ties, not just the overview.
- `phase-17-player-situation(.png, -zoom1.5)`: diagonal double track bending into a station, single on the
  far side (the reported case). No tie crossings; ties lengthen smoothly; past the station the two lanes
  converge over ~1.5 tiles into the single track with the inner rails starting as a V (no X). There is a
  slightly heavy dark blob at the V tip where two round-capped rail ends meet — cosmetic.
- `phase-17-double-s-curve`, `phase-17-transition-on-curve(.png, -zoom1.5)`: double S-curve reads as two
  parallel curves with one tie set; a single→double transition that begins one tile after a bend eases
  across the arc with no fan.
- `phase-17-junction-single-branch`: double mainline stays double through the junction, the single branch
  leaves as a curve that narrows from two rails to one. Honest note: this one is busier than I'd like —
  both mainline lanes fan into the branch's connector and its ties overlap the mainline's for a moment. No
  crossing ties, but it is the least polished of the set. `phase-17-junction-double-branch` (double branch off
  double main) is clean.
- `phase-17-double-bridge`: deck with trestle marks, both lanes' rails continue over it.
- `phase-17-consist-straight`, `phase-17-consist-diagonal-curve`: two 4-car consists (same direction) on
  straight, diagonal and curved double track — couplers tight everywhere, vehicles rotate smoothly through the
  arc, no gap after the loco.
- Recaptured the pre-existing phase-4/6/7/8/13/15/16/16.1 screenshots whose track/train drawing this phase
  changed; other phases' screenshot diffs (text/fps counters) were reverted per CLAUDE.md.
- Known cosmetic/limitations: chunk canvases show a half-pixel seam where rails cross a chunk boundary
  (pre-existing, visible when magnified 8×); a junction within 1.5 tiles of a passing-loop station can pop
  the ghost lane by ≲1px because the easing cannot see across a strand boundary; after a terminal reversal the
  tail extends along whatever track lies behind the fold (or straight back if none).
- Next: nothing scheduled; future ideas remain at the bottom of `docs/PLAN.md`.
