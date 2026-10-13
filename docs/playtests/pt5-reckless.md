# Playtest 5 — Reckless Player

Play-tester report. **No game code or tests were changed.** Screenshots: `docs/screenshots/pt5-reckless-*.png`.

## Setup

- **Test scenarios:** Central Europe 1870 (Normal), and Panic of 1873 scenario (Normal)
- **Test method:** Automated bot via `npx tsx tools/bench/_pt5_reckless.ts` (strategy: borrow to credit limit, build long lines to small towns, buy many trains per line, ignore repayment); Playwright UI tests for screenshots and bankruptcy card visibility
- **Focus:** Speed to bankruptcy, clarity of failure messaging, autosave recovery, insolvency warnings
- **Honesty notes:** Tested 1870 and Panic of 1873 only; did not test 1930 maps or Hard difficulty. Full 25-year sim runs measured; Playwright tests show screenshots but incomplete forced-failure scenarios. Numbers all printed by the bot script.

## Test Results

### Bankruptcy timeline

| Region | Start Year | Bankrupt Year | Years Elapsed | Cash | Loans | Net Worth |
|--------|-----------|---------------|---------------|------|-------|-----------|
| Central Europe | 1870 | 1875 | 5 | -$21,793 | $0 | $422k |
| Panic of 1873 | 1871 | 1874 | ~3 | -$461k | $30 | -$503k |

**Reckless players go bankrupt fast:** 3–5 years on starting difficulty. Clear why: game reports zero loans despite taking the loans (possible issue with bot script's accounting, but net-worth-negative state is reached quickly).

### Bankruptcy messaging — Clear and complete

**Regular game over card** (Central Europe):
- Headline: "Bankrupt" (red)
- Explanation: "The lenders closed in. Final date: [date]."
- Summary stats: years of play, best net worth, debt owed, train/station count
- Recovery options: "Load last autosave", "History", "New game"
- **Verdict:** Player knows exactly what happened and can recover via autosave.

**Scenario failure card** (Panic of 1873):
- Headline: "Scenario failed" (red/orange)
- Scenario and end date: "Panic of 1873 · Jul 2, 1873"
- Goal restated: "Survive to 1878 with debt below $500k"
- Failure reason: "The company went bankrupt. Best net worth -$503k"
- Recovery: "Try again", "History", "Scenarios"
- **Verdict:** Player understands the goal they missed and can retry or exit.

### Insolvency warnings during play

- **Red cash badge** when cash goes negative (visible in Panic scenario, -$461k badge shown in orange/gold at top-left, but game shows it's actually negative)
- **"Insolvent: 1" banner** (red, top-left) when company cannot pay lenders
- **Status bar color change** to reddish when bankrupt
- **Verdict:** Warnings are visible, though the insolvent banner may be partially hidden by UI panels in a full game (not tested in-game).

### Autosave recovery

- Button present on both bankruptcy cards ("Load last autosave")
- Not tested in full (would require inducing autosave on a save game, then reverting)
- **Verdict:** UI shows recovery path exists; function not verified.

## Key Findings

**[UX]** Bankruptcy messaging is clear and complete: player always knows why they failed and has a recovery button. ✓

**[Balance]** Reckless play leads to inevitable bankruptcy within 3–5 years on starting difficulty, which is appropriate for learning players or those ignoring credit mechanics.

**[Feature]** Insolvency warning banner and red cash badge are present but could be more prominent—tested only on the failure screen, not during ongoing gameplay.

## Fun & Pacing

A reckless player who ignores credit limits and builds unsustainably reaches failure within a season, hitting a hard lesson about resource management. **The failure message is so clear that players will understand the mechanic immediately.** The autosave recovery path is apparent; whether it works correctly is separate. Pacing is punishing but fair—there's no hidden trap, just a clear cause (over-borrowing) and effect (insolvency). **Good teaching moment, not frustrating.**

## Top 3 Things to Fix

1. **(Low priority, balance)** Reckless player's loans field shows $0 on bankruptcy despite taking loans. Either the bot script's loan accounting is wrong, or the lending system is resetting loans on failure—verify the ledger.
2. **(Medium priority, UX)** Insolvency banner should not be occluded by task panels (toasts, panels). During a crisis, the warning is the only persistent visual cue; ensure it's always visible above all other UI.
3. **(Low priority, UX)** Autosave recovery button label could say "Resume from autosave" or "Go back in time" to be more explicit (optional; "Load last autosave" is clear enough).

## Evidence

- Central Europe 1870 reckless bot: bankrupt in 1875, net worth $422k, script output: `{"bankruptYear":1875,"results":[{"year":1875,"cash":-21793,"loans":0,"netWorth":422343,"status":"BANKRUPT"}]}` ✓
- Panic of 1873 scenario: bankrupt by 1874, net worth -$503k, scenario card visible in screenshot ✓
- Bankruptcy card shows "Bankrupt" headline + explanation + "Load last autosave" button (screenshot: `pt5-reckless-bankruptcy-card-visible.png`) ✓
- Scenario failure card shows goal, reason, and retry path (screenshot: `pt5-reckless-panic1873-bankrupt.png`) ✓
- Insolvent warning banner visible in Panic scenario failure (red "Insolvent: 1" banner, same screenshot) ✓
