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
