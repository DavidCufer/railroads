# Handoff — for a new orchestrator chat (written 2026-10-18)

Read this first, then `CLAUDE.md`, the last ~5 entries of `docs/PROGRESS.md`, and the end of `docs/PLAN.md`.
`main` at the time of writing: `2c23501` (Phase 54). Everything below is pushed.

## How we work
- **Roles.** The owner (David) plays the game on Android and gives feedback, often with screenshots.
  - The orchestrator (Opus) writes each phase into `docs/PLAN.md`, starts one builder session per phase, and
    reviews the result.
  - Builders are Claude Code Remote sessions on `claude-sonnet-5-5`, started with `create_session`, source
    `https://github.com/DavidCufer/railroads`.
  - Builders push straight to `main`. The orchestrator also force-pushes `main` to its own session branch.
- **Builder prompt pattern.**
  - Read CLAUDE.md, the relevant PROGRESS entries and the phase in PLAN.
  - Implement the items in order.
  - Real mechanisms only; numbers in `src/data` with a one-line justification.
  - Never loosen a test or bound; never skip a test.
  - Do not ask questions; decide conservatively and record decisions in PROGRESS.
  - No background servers.
  - Run `npm run check` before each commit.
  - Run e2e in two shards: `npx playwright test --shard=1/2`, then `2/2`. One command is limited to about
    10 minutes.
  - Commit only that phase's screenshots; restore the rest with `git checkout -- docs/screenshots`.
  - Push early: `git fetch origin main && git rebase origin/main && git push origin HEAD:main`.
  - At the end: tick the PLAN status line, append a PROGRESS entry with tables, push.
- **Review.** Schedule a check with `send_later` (60–90 min). When it fires:
  - Read the builder's PROGRESS entry, then re-run `npm run check` and both e2e shards yourself.
  - Open the phase screenshots and LOOK at them.
  - Grep `tests/` and `tools/bench` diffs for loosened bounds.
  - Report to the owner in plain, short language with screenshots (`SendUserFile`).
- **Lessons.**
  - Before restarting a stuck builder, check `get_session` and the recent commits.
  - Builders sometimes stop on "needs owner decision". Read their PROGRESS entry and decide or ask the owner.
  - Haiku play-testers were weak: they invented numbers and skipped real play. Use the bench bots in
    `tools/bench` for balance; use Haiku only for smoke screenshots.

## Owner preferences (hard rules)
- **Real mechanisms only, no fudge factors.** "Base rules on real things." No flat multipliers and no era
  calibration tables without a real basis.
  - A single openly stated game scale is acceptable: `PARTY_SIZE` = 3 people per game passenger, and the
    trips-per-head compression.
- **Never loosen test bounds** without the owner's explicit OK. The owner approved the 4 limits changed in
  Phase 54. The builder also loosened `balanceLongHaul` silver money/yr from 2.5M to 2.3M without asking. The
  owner said "let's forget about those", so it stays unless raised.
- **Short UI**: one-liners, numbers and icons first, explanations behind (i). But the owner also complained
  when too much text was removed: car names, the stop rule, button labels. Keep short labels.
- **No new phase without owner approval.** Present a plan, then build.
- The owner likes being shown *why* (root cause) in plain words, and being asked before big mechanic changes.

## Where the game is now (main)
- **Passengers (Phase 54, the owner's model "M2").**
  - Passengers go only to towns that trains from this station call at **directly**; there are no changes.
  - One waiting pile per station. It fills from the last departure, up to `MAX_WAIT_DAYS`.
  - A train boards only people heading to its later stops: shares by capped gravity, plus `state.waitingSince`
    stamps so a frequent express can't steal the small towns' travellers.
  - Fares are per distance with a small speed factor (0.9–1.15 against the era's train). `PARTY_SIZE` 3.
  - Station UI: "Waiting N · next train ~Nd" and "Trains here reach: A, B ▸". The arrow opens "Where passengers
    go", which shows the share per town and the "Not served" towns.
  - Bench: `tools/bench/explore.ts` (S1–S4). In S4 (two big towns + 3 small) the best fleet is 2 express + 4
    locals. That is the express + locals pattern the owner wanted.
- **Terminus turnaround** (steam ~1 real hour = 3 game days; diesel/electric less). The train shows "Turning".
  **Era coach seats**: 40 to 1879, 60 to 1919, 80 after.
- **Look**: 19th-century style (STYLE.md Part 3, Playfair Display), engraved engine art (Phase 49B), decluttered
  panels with word-count limits enforced by `e2e/phase49Words.spec.ts`. Zoom flicker fixed. Toast cap 3.
- **Earlier**: contracts (45); scenarios, achievements and history (46); a contract income line (47).
- **Balance** (Phase 54 tables in PROGRESS):
  - The good bot survives everywhere. 1900 Normal is $31–34M (target 20–34). Hard is ≥ 48 % below Normal.
  - 1840 Normal good bot ≈ $20M (the old reference was ~$4M). Some bad-bot bankrupt bounds are missed.
  - **The owner said "let's forget about those" (2026-10-18).** Do not chase them unless the owner asks.

## Owner's latest play-test (Normal, 2026-10-18): the next work, not yet planned
1. "The balance is much better."
2. **Train choice hardly matters**: "I will always buy the best, at least at the beginning, because a few grand is
   not a lot of money." Engine price differences are small against starting cash.
   - Idea to propose: price and running cost of better engines should matter, e.g. a higher-power engine costs
     more fuel and upkeep, or buying is a real chunk of early cash.
   - Check with the `tools/bench` owner scenario. Ask the owner before changing prices.
3. **Double track is cheap**: "I will prefer to do double track between 2 major cities before connecting smaller
   towns with single track. Although this may be OK." Low priority. Maybe make double track cost closer to 2×
   single (real: second line plus wider formation).
4. **A slower train in front holds up everything** behind it on the same track, which breaks the express idea.
   - Real answer: overtaking at stations and passing loops. A faster train may pass a slower one where there is a
     second track (station with 2+ platforms, passing loop, double-track station): the slow train waits in the
     loop.
   - Probably needs signalling/block work in `src/sim/trains/movement.ts` and `blocks.ts`.
   - This is the owner's main gameplay request now.
5. **Station Info disappears too quickly**: "when click info on station cannot even read it, because disappears so
   quickly". Investigate the Info tool's popup/toast on tap and make it stay until dismissed. Small UI bug.

**Suggested next phase (needs owner OK):** Phase 55 with items 4 (overtaking at stations and passing loops) and 5
(Info popup), then item 2 (engine price and running costs) after showing the owner the numbers.

## Useful facts
- Branches: `main` is the truth. `explore-passengers` and `phase-53c-wip` are old and merged in spirit; ignore
  them. `phase-54` is the builder's working branch, already on main.
- Benches:
  - `tools/bench/goodPlayer.ts`, `badPlayers.ts` and `survival.ts` (`ASSERT=1 STARTS= BOTS= DIFFS=`);
  - `owner.ts` (Venice–Milan);
  - `multistop.ts`, `through.ts`, `explore.ts` (S1–S4);
  - `chain.ts`, `longHaul.ts`.
- Debug: `?debug=1` exposes `window.__game` (state, commands, runDays, startScenario, findBuildPath).
- Play-test round 5 summary: `docs/playtests/PT5-SUMMARY.md`. Several of its items are fixed (Phase 47).
