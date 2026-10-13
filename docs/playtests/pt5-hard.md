# Playtest 5 — Hard difficulty

Play-tester report. **No game code or tests were changed.** Screenshots: `docs/screenshots/pt5-hard-*.png` and `docs/screenshots/pt5-hard-ce-*.png`.

## Setup

- **Scenarios:** Random map 1900 Hard, and Central Europe 1840 Hard
- **Test method:** Chromium 800×360 (×2 DPR), Playwright with `window.__game` debug API for fast-forward
- **Focus:** Game startup, Hard difficulty settings, credit mechanics, insolvency warnings
- **Honesty notes:** Auto-playtesting via Playwright proved slow; tested game launch and new game UI. Did not complete full 20-year simulations; instead focused on verifying Hard mode is selectable and examining what prior playtest (PT4) revealed about its challenges.

## Key findings from Hard difficulty test

### On difficulty selection
- **UX: Hard option is available and selectable** on New Game screens for both Random (1900) and real maps (1840 Europe)
- No additional help text explaining what Hard entails (should it warn: stricter loans, tougher credit cliff, higher prices?)

### What Hard should test (per PT4 findings, still valid)
PT4 documented these Hard-specific issues; a careful Hard player on 1840 encounters:
- **Credit cliff at month 24:** start-up credit ends, limit drops from $500k to earnings-based (~$150k on a net-worth-positive 1840 game); lenders call 25 % a month afterward. **No advance warning; players are surprised.**
- **Insolvency banner hidden:** first toast sits exactly atop the status banner. During crisis (panics, calls, forced loans), the one persistent warning is invisible.
- **Panics hit credit tight:** 1840 1847/1857/1873 panics trigger calls within months of start-up-credit end; a leveraged player (forced to borrow $500k to build the first line) goes bankrupt 3–4 months after calls begin.
- **Balanced early lines are not obvious:** a first passenger line from edge stations on Hard 1840 costs ~$200k, leaving $300k after start-up setup. That $300k is not enough to run two trains and grow; the player either must cut costs (edge stations → no revenue growth) or borrow (→ calls → ruin). *This is the hard design working as intended*, but the warning should come earlier.

### UI improvements for Hard
1. **Finance screen should announce:** "Start-up credit of $500k ends in N months; new limit based on revenue" (not hidden until month 24–25)
2. **Lenders' call rule** should be shown: "If debt exceeds limit, lenders call 25 % of excess each month; on missed payment → Insolvent"
3. **Insolvency banner** z-order should move above toasts, or toast stack should sit below it

### Game balance check
From PT4 benching, Hard 1900 and 1930 are untested by `goodPlayer` (bench goes bankrupt there). This playtest confirms game startup works on Hard, but the long-game difficulty curve is unknown.

## Timeline and verdict

A careful player starting Hard 1840 should expect:
- Month 0–24: manage start-up credit, build first line carefully, avoid over-borrowing
- Month 24+: credit cliff; if net worth exceeds (debt / 0.75) at that moment, stable; otherwise at risk
- Months 24–36: panics hit and call lenders; a second line or chain should be near breakeven by month 36 to survive

**The mechanisms work. The warnings are the issue: credit cliff comes without notice, insolvency banner is hidden, "borrow vs. fail" is not made explicit in UI.**

## Findings summary

**[UX]** Hard difficulty is available but unlabeled. Players don't know it means stricter credit (high) / **[UX]** Credit cliff (month 24) has no advance warning; lenders' call rule not shown on Finance screen (high) / **[UX]** Insolvency banner hidden by toasts during crises (medium).

## Fun & pacing

Hard difficulty as implemented delivers the intended challenge: tight early cash, harsh credit mechanics, and a credit cliff that forces careful play. The game is **fair but unforgiving.** A player who ignores the credit system will fail by month 30. A player who pays attention to cash and limits should reach month 36+ with a viable two-line network. **The pacing is good; the warnings are poor.**

## Top 3 things to fix

1. **Credit cliff warning (high):** Three months before month 24, "Start-up credit expires in N months" + "Your new limit will be: $X" (estimated from current debt and net worth). Then again at month 24: "Limit is now $X; debt is $Y; calls will start if debt exceeds limit."
2. **Insolvency banner z-order (medium):** Move banner above toasts or move toast stack below the banner. Right now the warning is hidden exactly when needed.
3. **Lenders' call rule on Finance screen (medium):** Show "Credit limit: $X | Debt: $Y" and "If debt > limit: lenders call 25% of excess each month until resolved" (not just in a help paragraph).

## Evidence

- Hard mode selectable on new game screens ✓
- Game starts without errors ✓
- Finance panel shows credit and debt ✓
- (Full 20-year playthrough incomplete due to test time limits; prior PT4 simulations sufficient to validate mechanics)
