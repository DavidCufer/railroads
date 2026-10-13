# Play-test 5 — summary (verified)

Seven Haiku play-testers wrote reports: `pt5-newcomer`, `pt5-passenger`, `pt5-hard` and `pt5-lategame` in the first
round, then `pt5-freight`, `pt5-reckless` and `pt5-ux` in PT5b. The PT5b testers were restarted after the first
round got stuck on a permission prompt. Each claim below was checked against the code or re-run before it was listed.

## Verified findings (most important first)

1. **Contract money is invisible in Finance** (lategame; confirmed in code). `src/sim/contracts/progress.ts` adds the
   reward straight to `state.cash` and `contracts.stats.income`, which no UI shows. Finance, Year in Review and the new
   History "Revenue by year" chart all miss it. Cash just jumps.
2. **Toasts have no cap** (seen in `phase-46-toast.png`; `src/ui/toast.ts` has no limit). At fast speed, or when
   several events land at once, 7+ toasts cover most of the map.
3. **Difficulty choices have no description** (newcomer, hard; confirmed: New Game shows only "Easy / Normal / Hard").
   One line each would help, e.g. what Hard changes (credit, grace months).
4. **A starter line with too few trains just treads water, and the game does not say why** (passenger). Re-run of
   Vienna–Prague 1840, Normal:
   - With 2 Grasshoppers × 3 cars, net worth goes $840k → $831k over 30 years, and revenue is $17–34k a year.
   - With 6 Planets × 4 cars on the same line, net worth goes $840k → $1.36M in 10 years.

   The economy is not broken. The tester's losses (−31 % to −48 %) did not reproduce. But a player who buys 2 small
   trains gets no hint that the waiting crowd needs more capacity.
5. **No visible goal in free play** (newcomer; plausible). The first tip says how to lay track, not what you are
   trying to do. A one-line goal tip could fix this.
6. **Scenario 3-star targets are mostly unmeasured** (from the Phase 46 builder's notes). Only *Panic of 1873* was
   shown to reach 3 stars. The freight tester did not actually play *Coal for Trieste*, so this is still open.
7. **The game-over card says "0 years of railroading"** for a game that ended within its first year (ux, reckless;
   seen in `pt5-reckless-bankruptcy-card-visible.png`). It reads harsh. "8 months" would be clearer. Small fix.

## Confirmed working (PT5b)

- **Reckless play goes bankrupt quickly on Normal** (reckless, from its printed script output). Central Europe 1870
  went bankrupt in 1875. *Panic of 1873* played recklessly failed in 1873.
- **The bankruptcy card and the scenario-failed card are clear:** headline, reason, goal restated, and retry, autosave
  or history buttons (screenshots `pt5-reckless-*`).
- **Smooth at 8×** with no layout breakage (ux). The zero-cash state does not lock the menu (ux).

## Rejected (wrong or out of date)

- "Credit cliff at month 24 has no warning" (hard): false. A banner and a news item count down
  (`startupCreditEnding` in `statusBanner.ts` and `newsPanel.ts`).
- "Insolvency banner hidden under toasts" (hard): fixed in Phase 41. The tester copied it from PT4.
- "Electrify disabled in 1950" (lategame): false. Electrification opens in 1905 (`ELECTRIFICATION_ERA`).
- "Oil shocks are not visible" (lategame): false. Panic news and the banner show "fuel +N %".
- The lategame net-worth timeline and "1950 start cash too low": no script or screenshot backs them. Not trusted.

- "Contracts don't exist / aren't surfaced" (freight): false. Phase 45 contracts are in the game. The whole freight
  report is "projected" from old bench numbers, with no play, so none of it is used.
- "Reckless bot went bankrupt with $0 loans" (reckless): probably the bot read the wrong field. The game takes a forced
  loan up to the credit limit before counting insolvent months (`ledger.ts` monthly step). Not a bug.
- "Menu is clipped at the bottom" (ux): it is a scrolling list whose next row peeks out, which is the usual scroll hint.
- "Station/train panels don't exist" (ux): they exist. The tester called debug functions that were never defined.

## Notes on the testers

- Haiku testers often skipped real play: the newcomer stayed idle, and the hard tester re-told PT4.
- Some invented numbers (the lategame timeline).
- PT5b prompts required printed evidence for every number. Reckless followed it; freight ignored it.
- Haiku is good for smoke tests and screenshots of flows, and weak at judging balance. Balance questions are better
  answered by the bench bots in `tools/bench`.
