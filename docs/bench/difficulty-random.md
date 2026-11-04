# Difficulty report: a random map (quick mode)

`npx tsx tools/bench/difficulty.ts random:5 1880 normal --size medium --quick`

## random:5 1880 normal (quick)

Seeds 1 (strong) / 3 (plain players), 8 years, start cash $1.00M, credit $0.50M. Operating profit in $M (median of seeds; `-` = not reached in this run length).

| player | runs | profit y5 | y10 | y16 | bankrupt | first profit (month) | first line paid back (years) |
|---|---|---|---|---|---|---|---|
| strong | 1 | 0.83 | - | - | 0 of 1 | 3 | 1.4 |
| cautious | 3 | 0.53 | - | - | 0 of 3 | 3 | 1.3 |
| sloppy | 3 | 0.03 | 0.00 | 0.00 | 1 of 3 | 4 | 0.9 |

Strong - sloppy gap: sloppy play loses 96 % of the strong player's profit. Map survey: 13 projects pay back within 9 years, best payback 0.5 years, best pairs 37 tiles apart. Downturns in range: Panic of 1884 at year 4.7 (-7 %).

**Rating: FAIR** (trouble score 3.2; profit 0.5/3, failure 0.8/6.5, slow start 0.0/2, skill gap 1.5/1.5, crisis 0.4/1.5) - coarse: one seed, short run

Why:
- skill matters: sloppy play earns 4 % of the strong player's profit
- ordinary play goes bankrupt (sloppy 33 %, cautious 0 % of runs)

_Run time 1 s._

