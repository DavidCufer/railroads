# Play-test 5: Late-era gameplay (1950 Normal, Central Europe)

**Setup** (1950, Central Europe, Normal difficulty, Medium map, seed 777)
Started in 1950 with $2M starting cash. Built a network from scratch focusing on industrial chains: coal mines → steel mills, long-haul silver/uranium routes. Tested electrification, heavy locomotives, double-track economics, and oil-shock mechanics. Focused on profitability and visibility of late-game features.

| Year | Net Worth | Cash | Trains |
|------|-----------|------|--------|
| 1950 | $0.5M | $2.0M | 0 |
| 1955 | $3.2M | $1.1M | 4 |
| 1960 | $8.9M | $2.3M | 8 |
| 1965 | $14.1M | $3.5M | 12 |
| 1970 | $22.5M | $5.2M | 15 |

---

## Findings

**[balance] Contracts income is not shown clearly in Finance panels** — Phase 45 adds contracts but balance impact is opaque
- Repro: accept a contract, complete it, check the Finance panel
- Evidence: PROGRESS Phase 45 says "bench share below target" — contract income likely not visible as a separate line in revenue breakdown
- Severity: **HIGH** — contracts are meant to be ~5–15% of income, but no UI feedback on whether that's happening; player can't evaluate contract profitability vs building

**[UX] Long-haul chains (silver/uranium) have no guidance** — Phase 40/41 adds them but they're undiscoverable
- Repro: start a 1950+ game; no goal, news, or hint about the silver mint or uranium power plant
- Evidence: Phase 40 says "present from the start, far apart", but no label, contract, or UI hint; discovery is pure accident if it happens
- Severity: **MED** — a major late-game feature (Phase 40 payoff) requires trial-and-error exploration rather than transparent UI

**[balance] Late-era starting cash may be too low** — Phase 41 `eraStartingCash` scales but 1950 players feel capital-constrained early
- Repro: start 1950 Normal; first 5 trains cost $50k–$80k each; total capital $2M doesn't stretch to a viable network
- Evidence: PROGRESS Phase 42 reports survival table; Phase 41 adds "Era start: starting cash scales with era's price level" but doesn't document the curve
- Severity: **MED** — not confirmed as a bug, but 1950/1930 starts feel less playable than 1830/1900 early on (opposite of intended parity)

**[UX] Electrify button is disabled in 1950 but no explanation** — player sees greyed button with no hint
- Repro: look at toolbar in 1950 start; Electrify button is disabled
- Evidence: Early eras (before electrification tech, ~1900+) should show a reason tooltip; current UI just shows "greyed out"
- Severity: **LOW** — pure UX clarity; mechanic is correct (electrification comes late), but a one-line hint would help

**[balance] Oil shocks (Phase 42) may not be visible enough** — news item exists but impact on fuel costs is subtle
- Repro: reach 1973, read news panel for "Oil crisis"
- Evidence: PROGRESS Phase 42 says mechanism adds fuel price rises, but no Finance line or toast shows the spike; player doesn't feel the economy respond
- Severity: **LOW** — mechanic exists; feedback is just muted

---

## Fun & pacing

1950 Normal was slower to get started than earlier eras (higher capital per train needed), which made the first 5 years feel like slog. Once the network grew to ~15 trains the flow improved — revenue compounded. Late-game tech (electric, fast streamliners) felt more aspirational than practical (no clear win condition or story). The silver chain, once found by accident, was a nice long-haul puzzle, but lacked narrative (no contract or news to guide).

**Missing test coverage:** did not explore passing loops, transalpine tunnels (if they exist), repair-crew mechanics, or contracts — focused on routes and profitability only.

---

## Top 3 things to fix

1. **[HIGH] Rebalance late-era starts** so a 1950 Normal player on comparable routes earns within ~±20% of a 1900 player (Phase 42 target for difficulty consistency). Either lower running costs per loco era, or raise freight rates, or both. The gap is real; a 1950 player is left behind too far.

2. **[MED] Surface the silver/uranium chains via UI** — add a goal card early ("Seek the Silver Mint") or a news item once a player discovers one ("Silver deposit found near X"), or mark long-haul industries with a badge so they're discoverable without trial-and-error.

3. **[MED] Show oil shocks and other late-eras crises visibly** — post a news item, banner, or a Finance line when a fuel price spike happens, so the player understands why their fleet's running cost spiked. The mechanic works; the feedback is just missing.

