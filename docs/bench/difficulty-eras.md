# Difficulty report: eras on central-eu (quick mode)

Made by `npx tsx tools/bench/difficulty.ts central-eu <year> <diff> --quick --raw docs/bench/difficulty-runs.jsonl`; re-rated from the saved runs with `--from`. Quick = 1 Strategist seed (6-month lookahead, a decision every 60 days), 3 seeds of the cautious and sloppy players, 8 years. Coarse: see difficulty-calibration.md for how far to trust it.

## central-eu 1840 normal (quick)

Seeds 1 (strong) / 3 (plain players), 8 years, start cash $1.00M, credit $0.50M. Operating profit in $M (median of seeds; `-` = not reached in this run length).

| player | runs | profit y5 | y10 | y16 | bankrupt | first profit (month) | first line paid back (years) |
|---|---|---|---|---|---|---|---|
| strong | 1 | 0.32 | - | - | 0 of 1 | 3 | 1.9 |
| cautious | 3 | 0.40 | - | - | 0 of 3 | 3 | 2.8 |
| sloppy | 3 | 0.76 | - | - | 0 of 3 | 4 | 1.7 |

Strong - sloppy gap: sloppy play loses 0 % of the strong player's profit. Map survey: 7 projects pay back within 9 years, best payback 0.7 years, best pairs 55 tiles apart. Downturns in range: Railway mania crash at year 7.5 (-5 %).

**Rating: EASY** (trouble score 1.0; profit 0.7/3, failure 0.0/6.5, slow start 0.0/2, skill gap 0.0/1.5, crisis 0.2/1.5) - coarse: one seed, short run

Why:
- long distances: the best town pairs are 55 tiles apart

_Run time 1 s._

## central-eu 1860 normal (quick)

Seeds 1 (strong) / 3 (plain players), 8 years, start cash $1.00M, credit $0.50M. Operating profit in $M (median of seeds; `-` = not reached in this run length).

| player | runs | profit y5 | y10 | y16 | bankrupt | first profit (month) | first line paid back (years) |
|---|---|---|---|---|---|---|---|
| strong | 1 | 1.11 | - | - | 0 of 1 | 3 | 1.4 |
| cautious | 3 | 2.20 | - | - | 0 of 3 | 3 | 1.1 |
| sloppy | 3 | 2.79 | - | - | 0 of 3 | 3 | 1.0 |

Strong - sloppy gap: sloppy play loses 0 % of the strong player's profit. Map survey: 7 projects pay back within 9 years, best payback 0.8 years, best pairs 55 tiles apart. Downturns in range: none.

**Rating: EASY** (trouble score 0.0; profit 0.0/3, failure 0.0/6.5, slow start 0.0/2, skill gap 0.0/1.5, crisis 0.0/1.5) - coarse: one seed, short run

Why:
- long distances: the best town pairs are 55 tiles apart

_Run time 1 s._

## central-eu 1870 normal (quick)

Seeds 1 (strong) / 3 (plain players), 8 years, start cash $1.00M, credit $0.50M. Operating profit in $M (median of seeds; `-` = not reached in this run length).

| player | runs | profit y5 | y10 | y16 | bankrupt | first profit (month) | first line paid back (years) |
|---|---|---|---|---|---|---|---|
| strong | 1 | 1.37 | - | - | 0 of 1 | 3 | 1.3 |
| cautious | 3 | 1.32 | - | - | 0 of 3 | 3 | 1.2 |
| sloppy | 3 | 1.22 | - | - | 0 of 3 | 3 | 1.3 |

Strong - sloppy gap: sloppy play loses 11 % of the strong player's profit. Map survey: 7 projects pay back within 9 years, best payback 1.0 years, best pairs 55 tiles apart. Downturns in range: Panic of 1873 at year 3.6 (-6 %).

**Rating: EASY** (trouble score 0.3; profit 0.0/3, failure 0.0/6.5, slow start 0.0/2, skill gap 0.0/1.5, crisis 0.3/1.5) - coarse: one seed, short run

Why:
- long distances: the best town pairs are 55 tiles apart

_Run time 1 s._

## central-eu 1870 hard (quick)

Seeds 1 (strong) / 3 (plain players), 8 years, start cash $0.60M, credit $0.50M. Operating profit in $M (median of seeds; `-` = not reached in this run length).

| player | runs | profit y5 | y10 | y16 | bankrupt | first profit (month) | first line paid back (years) |
|---|---|---|---|---|---|---|---|
| strong | 1 | 1.24 | - | - | 0 of 1 | 3 | 1.2 |
| cautious | 3 | 0.91 | - | - | 0 of 3 | 3 | 1.2 |
| sloppy | 3 | 1.00 | 0.00 | 0.00 | 1 of 3 | 3 | 1.2 |

Strong - sloppy gap: sloppy play loses 20 % of the strong player's profit. Map survey: 7 projects pay back within 9 years, best payback 1.2 years, best pairs 55 tiles apart. Downturns in range: Panic of 1873 at year 3.6 (-7 %).

**Rating: EASY** (trouble score 1.5; profit 0.0/3, failure 0.8/6.5, slow start 0.0/2, skill gap 0.3/1.5, crisis 0.4/1.5) - coarse: one seed, short run

Why:
- long distances: the best town pairs are 55 tiles apart
- ordinary play goes bankrupt (sloppy 33 %, cautious 0 % of runs)

_Run time 1 s._

## central-eu 1900 normal (quick)

Seeds 1 (strong) / 3 (plain players), 8 years, start cash $1.00M, credit $0.50M. Operating profit in $M (median of seeds; `-` = not reached in this run length).

| player | runs | profit y5 | y10 | y16 | bankrupt | first profit (month) | first line paid back (years) |
|---|---|---|---|---|---|---|---|
| strong | 1 | 0.83 | - | - | 0 of 1 | 3 | 1.2 |
| cautious | 3 | 0.62 | - | - | 0 of 3 | 3 | 1.1 |
| sloppy | 3 | 0.93 | - | - | 0 of 3 | 3 | 1.0 |

Strong - sloppy gap: sloppy play loses 0 % of the strong player's profit. Map survey: 7 projects pay back within 9 years, best payback 0.7 years, best pairs 55 tiles apart. Downturns in range: Panic of 1907 at year 7.8 (-13 %).

**Rating: EASY** (trouble score 0.8; profit 0.2/3, failure 0.0/6.5, slow start 0.0/2, skill gap 0.0/1.5, crisis 0.6/1.5) - coarse: one seed, short run

Why:
- long distances: the best town pairs are 55 tiles apart
- crisis at year 8: Panic of 1907, demand falls 13 %

_Run time 2 s._

## central-eu 1900 hard (quick)

Seeds 1 (strong) / 3 (plain players), 8 years, start cash $0.60M, credit $0.50M. Operating profit in $M (median of seeds; `-` = not reached in this run length).

| player | runs | profit y5 | y10 | y16 | bankrupt | first profit (month) | first line paid back (years) |
|---|---|---|---|---|---|---|---|
| strong | 1 | 1.26 | - | - | 0 of 1 | 3 | 1.6 |
| cautious | 3 | 1.11 | - | - | 0 of 3 | 3 | 1.6 |
| sloppy | 3 | 1.28 | - | - | 0 of 3 | 3 | 1.6 |

Strong - sloppy gap: sloppy play loses 0 % of the strong player's profit. Map survey: 7 projects pay back within 9 years, best payback 1.3 years, best pairs 55 tiles apart. Downturns in range: Panic of 1907 at year 7.8 (-17 %).

**Rating: EASY** (trouble score 0.8; profit 0.0/3, failure 0.0/6.5, slow start 0.0/2, skill gap 0.0/1.5, crisis 0.8/1.5) - coarse: one seed, short run

Why:
- long distances: the best town pairs are 55 tiles apart
- crisis at year 8: Panic of 1907, demand falls 17 %

_Run time 2 s._

## central-eu 1920 normal (quick)

Seeds 1 (strong) / 3 (plain players), 8 years, start cash $1.00M, credit $0.50M. Operating profit in $M (median of seeds; `-` = not reached in this run length).

| player | runs | profit y5 | y10 | y16 | bankrupt | first profit (month) | first line paid back (years) |
|---|---|---|---|---|---|---|---|
| strong | 1 | 0.31 | - | - | 0 of 1 | 3 | 2.1 |
| cautious | 3 | 0.32 | - | - | 0 of 3 | 3 | 2.1 |
| sloppy | 3 | 0.29 | - | - | 0 of 3 | 3 | 2.1 |

Strong - sloppy gap: sloppy play loses 10 % of the strong player's profit. Map survey: 7 projects pay back within 9 years, best payback 0.7 years, best pairs 55 tiles apart. Downturns in range: Crash of 1929 at year 9.0 (-28 %).

**Rating: FAIR** (trouble score 3.5; profit 2.0/3, failure 0.0/6.5, slow start 0.0/2, skill gap 0.0/1.5, crisis 1.4/1.5) - coarse: one seed, short run

Why:
- weak profit: about 0.32x the starting cash a year in year 5
- crisis at year 10: Crash of 1929, demand falls 28 %
- long distances: the best town pairs are 55 tiles apart

_Run time 2 s._

## central-eu 1930 easy (quick)

Seeds 1 (strong) / 3 (plain players), 8 years, start cash $2.25M, credit $0.50M. Operating profit in $M (median of seeds; `-` = not reached in this run length).

| player | runs | profit y5 | y10 | y16 | bankrupt | first profit (month) | first line paid back (years) |
|---|---|---|---|---|---|---|---|
| strong | 1 | 0.69 | - | - | 0 of 1 | 4 | 2.5 |
| cautious | 3 | 0.81 | - | - | 0 of 3 | 4 | 2.2 |
| sloppy | 3 | 1.70 | - | - | 0 of 3 | 3 | 1.5 |

Strong - sloppy gap: sloppy play loses 0 % of the strong player's profit. Map survey: 7 projects pay back within 9 years, best payback 0.4 years, best pairs 55 tiles apart. Downturns in range: none.

**Rating: EASY** (trouble score 0.8; profit 0.7/3, failure 0.0/6.5, slow start 0.1/2, skill gap 0.0/1.5, crisis 0.0/1.5) - coarse: one seed, short run

Why:
- long distances: the best town pairs are 55 tiles apart

_Run time 1 s._

## central-eu 1930 normal (quick)

Seeds 1 (strong) / 3 (plain players), 8 years, start cash $1.50M, credit $0.50M. Operating profit in $M (median of seeds; `-` = not reached in this run length).

| player | runs | profit y5 | y10 | y16 | bankrupt | first profit (month) | first line paid back (years) |
|---|---|---|---|---|---|---|---|
| strong | 1 | 0.33 | - | - | 0 of 1 | 3 | 4.7 |
| cautious | 3 | 0.26 | - | - | 0 of 3 | 4 | 4.8 |
| sloppy | 3 | 0.00 | 0.00 | 0.00 | 2 of 3 | 3 | 0.8 |

Strong - sloppy gap: sloppy play loses 100 % of the strong player's profit. Map survey: 7 projects pay back within 9 years, best payback 0.7 years, best pairs 55 tiles apart. Downturns in range: Banking crisis of 1931 at year 1.7 (-42 %); Recession of 1937 at year 7.5 (-17 %).

**Rating: BRUTAL** (trouble score 7.5; profit 2.3/3, failure 1.7/6.5, slow start 0.4/2, skill gap 1.5/1.5, crisis 1.5/1.5) - coarse: one seed, short run

Why:
- weak profit: about 0.22x the starting cash a year in year 5
- crisis at year 2: Banking crisis of 1931, demand falls 42 %
- ordinary play goes bankrupt (sloppy 67 %, cautious 0 % of runs)
- skill matters: sloppy play earns 0 % of the strong player's profit

_Run time 1 s._

## central-eu 1930 hard (quick)

Seeds 1 (strong) / 3 (plain players), 8 years, start cash $0.90M, credit $0.50M. Operating profit in $M (median of seeds; `-` = not reached in this run length).

| player | runs | profit y5 | y10 | y16 | bankrupt | first profit (month) | first line paid back (years) |
|---|---|---|---|---|---|---|---|
| strong | 1 | 0.95 | - | - | 0 of 1 | 3 | 2.3 |
| cautious | 3 | 0.80 | - | - | 0 of 3 | 3 | 2.4 |
| sloppy | 3 | 0.82 | - | - | 0 of 3 | 3 | 2.4 |

Strong - sloppy gap: sloppy play loses 14 % of the strong player's profit. Map survey: 7 projects pay back within 9 years, best payback 1.5 years, best pairs 55 tiles apart. Downturns in range: Banking crisis of 1931 at year 1.7 (-55 %); Recession of 1937 at year 7.5 (-23 %).

**Rating: EASY** (trouble score 1.7; profit 0.0/3, failure 0.0/6.5, slow start 0.0/2, skill gap 0.1/1.5, crisis 1.5/1.5) - coarse: one seed, short run

Why:
- crisis at year 2: Banking crisis of 1931, demand falls 55 %
- long distances: the best town pairs are 55 tiles apart

_Run time 1 s._

## central-eu 1950 normal (quick)

Seeds 1 (strong) / 3 (plain players), 8 years, start cash $2.00M, credit $0.50M. Operating profit in $M (median of seeds; `-` = not reached in this run length).

| player | runs | profit y5 | y10 | y16 | bankrupt | first profit (month) | first line paid back (years) |
|---|---|---|---|---|---|---|---|
| strong | 1 | 0.80 | - | - | 0 of 1 | 3 | 1.1 |
| cautious | 3 | 1.04 | - | - | 0 of 3 | 4 | 1.8 |
| sloppy | 3 | 0.91 | - | - | 0 of 3 | 3 | 1.1 |

Strong - sloppy gap: sloppy play loses 13 % of the strong player's profit. Map survey: 7 projects pay back within 9 years, best payback 0.5 years, best pairs 55 tiles apart. Downturns in range: Recession of 1953 at year 3.8 (-9 %); Suez oil shock and recession at year 7.7 (-10 %).

**Rating: EASY** (trouble score 2.0; profit 1.4/3, failure 0.0/6.5, slow start 0.0/2, skill gap 0.1/1.5, crisis 0.5/1.5) - coarse: one seed, short run

Why:
- long distances: the best town pairs are 55 tiles apart
- crisis at year 8: Suez oil shock and recession, demand falls 10 %

_Run time 1 s._

