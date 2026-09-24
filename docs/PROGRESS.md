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
