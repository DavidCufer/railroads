# CLAUDE.md — guide for AI implementers

This repo is **Railroads**, a 2D railway tycoon game for Android (TypeScript + Canvas + Capacitor).

- **What to build:** `docs/SPEC.md` (source of truth).
- **Order of work:** `docs/PLAN.md` (phases; do one phase per session, unless the user says otherwise).
- **What's done so far:** `docs/PROGRESS.md` (read it first; append to it when you finish).

## Workflow per session
1. Read CLAUDE.md, PROGRESS.md, the current phase in PLAN.md, and the SPEC sections it lists.
2. Implement the phase. Keep changes within scope.
3. `npm run check` and `npm run e2e` must pass before committing. Never skip or disable a test to go green.
4. Update the PLAN.md checkboxes, append to PROGRESS.md, and record any SPEC deviations.
5. Commit as `Phase N: <title>` (small intermediate commits are fine), then push.

## Hard rules
- `src/sim/**` is pure and deterministic: no DOM, no canvas, no `Date.now()`, no `Math.random()` — use the state's seeded RNG.
- All player actions go through `src/sim/commands.ts` and return `{ok}` / `{ok:false, reason}`.
- Renderers never mutate state. UI never mutates state except via commands.
- Game balance numbers live in `src/data/` tables, not scattered in logic.
- All graphics are procedural (canvas drawing, cached to offscreen canvases). No image asset files except the app icon.
- User-facing strings go in `src/ui/strings.ts`.
- TypeScript strict; no `any` without a comment explaining why.
- Keep dependencies minimal; ask the user before adding a runtime dependency beyond those named in SPEC §1.

## Environment notes
- Headless Chromium is at `/opt/pw-browsers` (Playwright is configured for it; don't run `playwright install`).
- There is no Android emulator in the cloud session; Android builds are verified by the GitHub Actions `android.yml` workflow.
- Use `?debug=1` to expose `window.__game` for e2e tests (state inspection, running N days, issuing commands).
