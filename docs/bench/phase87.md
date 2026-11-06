# Phase 87 steps 1-2: why Hard is not harder, and proposals (investigation only; nothing under src/ changed)
Rows: `phase87.jsonl` (driver `tools/bench/phase87.ts`, tables `phase87Levers.ts`, `phase87Summary.ts`); scenarios: `phase87-scenarios.md`.
V2 bot, central-eu, 3 seeds, NW = net worth at year 12 (median of survivors) as a ratio to Normal; 1870 Normal $14.85M, 1930 Normal $1.44M (2 of 3 Normal 1930 runs go bankrupt).

| Normal + one Hard lever | 1870 | 1930 |
|---|---|---|
| start cash 600k | 1.37x | 2.42x |
| land x1.5 | 1.70x | 1.78x (2 bankrupt) |
| build x1.2 | 1.20x | 1.13x |
| credit | 1.06x | 1.01x |
| breakdown / tax / panic / risk | ~1.0x | ~1.0x (panic: 2 bankrupt) |
| interest | 0.97x | 2 bankrupt |
| all levers (= Hard) | 1.05x | 0.89x |

| Hard + revenueMult | 1870 | 1930 |
|---|---|---|
| 0.9 | 0.77x | 0.72x (2 bankrupt) |
| 0.8 | 0.60x | 0.73x |
| 0.75 | 0.50x | 0.67x |
| 0.7 | 0.36x | 0.61x |
| 0.85 + interest 10 % | 0.79x (1 bankrupt) | 0.65x (1 bankrupt) |
| 0.85 + start cash 400k | 0.60x | 0.42x |

Base (Hard / Normal NW y16, $M): 1840 14.2/11.8, 1870 27.7/23.9, 1900 5.8/12.6, 1930 2.4/1.2. Strategist Hard y16: 1870 25.7 and 32.6, 1930 2.7 and 3.0 (all survive).
