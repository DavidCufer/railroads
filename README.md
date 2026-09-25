# Railroads 🚂

A 2D top-down railway-building tycoon game for Android, inspired by *Sid Meier's Railroad Tycoon
Deluxe*. No competitors, no stock market: build track to cities and resources, run trains, earn
money from deliveries, and grow your railroad from steam to diesel to electric as the decades pass.

Runs in the browser during development and packages as a landscape-locked Android app via
Capacitor. Every graphic — terrain, track, trains, cities, industries, UI — is drawn procedurally
on an HTML5 canvas; there are no sprite sheets or image assets beyond the app icon.

Status: **Phase 12 (Performance and release hardening) complete — v1 feature-complete.** See
[`docs/PROGRESS.md`](docs/PROGRESS.md) for the full build history, phase by phase.

## Features

- **Four real-world regions** (Eastern US, Great Britain, Central Europe & the Alps, the American
  West) built from real coastlines, rivers, mountain ranges and city positions, plus a **random map
  generator** (seed, size, water level, terrain roughness, city count, resource density, start
  year) for endless new maps.
- **Track building**: drag to lay single or double track in 8 directions, wood/stone/steel bridges
  over rivers and water, electrification from 1905, junctions and turn-radius rules, all
  touch-first with a live cost preview.
- **Stations**: Depot/Station/Terminal tiers, catchment-based supply and demand, six improvements
  (Engine Shed, Water Tower, Post Office, Hotel, Warehouse, Freight Yard, Cold Storage, Livestock
  Pens), custom naming.
- **Trains**: 22 locomotives from an 1830 0-4-0 to a 1994 heavy-freight electric, spanning steam,
  diesel and electric eras; configurable cars and cargo, 2–8 stop looping orders with per-stop
  loading rules, realistic speed/grade/curve physics, breakdowns and obsolescence, block signaling
  for single- and double-track lines with deadlock recovery.
- **Cargo & economy**: 13 cargo types (passengers, mail, coal, ore, grain, livestock, oil, steel,
  lumber, food, goods, fuel, wood), 12 industry types with realistic terrain/era placement, city
  growth driven by how well you serve it, era-scaled inflation and difficulty levels.
- **Finance**: cash, loans, a full revenue/expense ledger, yearly reports, a net-worth chart.
- **Goals**: each real-world region ships bronze/silver/gold objectives (e.g. "Connect New York and
  Chicago by 1860").
- **Save/load**: rotating autosaves, five named manual slots, and an automatic crash-recovery save
  if something goes wrong (see "Error handling" below).
- Optional sound, adjustable UI scale, mph/km-h units, a mini-map, and overlays for station
  catchments, cargo supply heatmaps, track type, and train profitability.

## How to play

1. Start a **New Game** — pick a real-world region or generate a random map.
2. Use the left toolbar's **Track** tool to drag rail between a resource or industry and a city
   (or between two cities for passengers/mail), then drop a **Station** on a straight run or dead
   end.
3. Open the station, tap **Buy Train**, pick a locomotive and cars, and set its orders — an ordered
   loop of stops.
4. Watch deliveries earn revenue, reinvest in more track and trains, and upgrade stations as demand
   grows. Speed up time with the top bar's ⏸ / 1× / 2× / 4× / 8× controls.
5. Chase your region's goals, or just build the biggest railroad you can from 1830 to the modern era.

Full design details are in [`docs/SPEC.md`](docs/SPEC.md).

## Install on your phone

Every push builds a debug APK via the **Android** GitHub Actions workflow:

1. Go to the repo's **Actions** tab → **Android** workflow → pick the latest successful run.
2. Download the `app-debug` artifact (a zip containing `app-debug.apk`) and unzip it.
3. Copy `app-debug.apk` to your Android phone (e.g. via a cloud drive, USB, or email to yourself).
4. On the phone, open the APK file. If prompted, allow "Install unknown apps" for whichever app you
   used to open it (Settings → Apps → Special access → Install unknown apps).
5. Install and launch **Railroads**. The app runs landscape-locked, fullscreen.

## Development

```
npm install
npm run dev       # start the dev server
npm run check     # typecheck + lint + unit tests
npm run e2e       # Playwright e2e tests (against a production build+preview)
npm run build     # production build (minified, no source maps) -> dist/
```

## Building the Android app yourself

Needs the Android SDK + JDK 21 installed locally (JDK 21, not 17 — Capacitor's generated build
config requires it).

```
npm run build
npx cap sync android
cd android
./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

`versionCode`/`versionName` are derived automatically from `package.json`'s `version` field
(`android/app/build.gradle`) — bump that one place, not the Gradle file, to release a new version.

### Signed release builds

The **Release** workflow (`.github/workflows/release.yml`, manual dispatch from the Actions tab)
builds a release APK and AAB (Play Store bundle). It signs them if the repository has these four
secrets configured (Settings → Secrets and variables → Actions → Repository secrets); otherwise it
still builds successfully, just unsigned — never commit a keystore or its passwords to the repo.

| Secret | Value |
|---|---|
| `KEYSTORE_BASE64` | Your release keystore file, base64-encoded |
| `KEYSTORE_PASSWORD` | The keystore's password |
| `KEY_ALIAS` | The signing key's alias inside the keystore |
| `KEY_PASSWORD` | The signing key's own password |

**One-time setup**, generating a new keystore (keep the resulting file and passwords somewhere
safe — losing them means you can never update an app already published under that signature):

```
keytool -genkey -v -keystore release.keystore.jks -keyalg RSA -keysize 2048 -validity 10000 \
  -alias railroads
# then, to fill in KEYSTORE_BASE64:
base64 -w0 release.keystore.jks   # macOS: base64 -i release.keystore.jks
```

Paste the base64 output as `KEYSTORE_BASE64`, the password you set as `KEYSTORE_PASSWORD`,
`railroads` (or whatever alias you chose) as `KEY_ALIAS`, and its key password as `KEY_PASSWORD`.
Delete `release.keystore.jks` from your local disk once the secret is saved, or keep it somewhere
outside the repo — it's already `.gitignore`d as a backstop, but the point is it should never exist
in a git history at all.

## How this was built

This project was built end to end by an AI coding agent (Claude), working from a fixed
specification rather than free-form prompting:

- [`docs/SPEC.md`](docs/SPEC.md) — the game design specification, the source of truth for what the
  game does.
- [`docs/PLAN.md`](docs/PLAN.md) — the phased build order (Phase 0 through Phase 12, plus a few
  review-driven sub-phases along the way), each with its own scope and acceptance criteria.
- [`docs/PROGRESS.md`](docs/PROGRESS.md) — a log entry per phase/session: what was built, key
  files, deviations from spec, known issues, and screenshots reviewed along the way.
- [`CLAUDE.md`](CLAUDE.md) — the working agreement for each session (read the docs above first,
  keep `src/sim/**` pure and deterministic, all player actions go through `src/sim/commands.ts`,
  tests must pass before committing, push early and often).
