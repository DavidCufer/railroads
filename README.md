# Railroads 🚂

A 2D railway-building tycoon game for Android, inspired by *Railroad Tycoon Deluxe* — no competitors or
stock market: just lay track to cities and resources, run trains, make money, and grow from steam
to diesel to electric.

- Game design: [`docs/SPEC.md`](docs/SPEC.md)
- Build plan: [`docs/PLAN.md`](docs/PLAN.md)
- Progress: [`docs/PROGRESS.md`](docs/PROGRESS.md)

Status: Phase 2 (Android shell & APK pipeline) complete. See `docs/PROGRESS.md`.

## Development

```
npm install
npm run dev       # start the dev server
npm run check     # typecheck + lint + unit tests
npm run e2e       # Playwright e2e tests
npm run build     # production build
```

## Install on your phone

Every push builds a debug APK via the `Android` GitHub Actions workflow:

1. Go to the repo's **Actions** tab → **Android** workflow → pick the latest successful run.
2. Download the `app-debug` artifact (a zip containing `app-debug.apk`) and unzip it.
3. Copy `app-debug.apk` to your Android phone (e.g. via a cloud drive, USB, or email to yourself).
4. On the phone, open the APK file. If prompted, allow "Install unknown apps" for whichever app you
   used to open it (Settings → Apps → Special access → Install unknown apps).
5. Install and launch **Railroads**. The app runs landscape-locked, fullscreen.

To build the APK yourself instead (needs Android SDK + JDK 17 installed locally):

```
npm run build
npx cap sync android
cd android
./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```
