# Phase 77 bench (raw rows; bonds are never called, laid-up trains give no service; strongV1 = the Phase 59-69 bot (tools/bench/strongPlayerV1.ts), strong = the Phase 77 bot, both on current main)

Revenue and operating profit are those of the completed year (year 5 = the fifth year played). Return on capital = operating profit of the year / (capital invested in track and stations + rolling stock value as the bots print it). `-` = no data (bankrupt before that year, or a bad bot, which prints no yearly books). NaN = could not afford a first line.

| bot | start | diff | seed | bankrupt | min cash $M | final NW $M | revenue $M y5 | y10 | y16 | op profit $M y5 | y10 | y16 | op ratio y3 | y10 | y16 | return on capital y3 | y10 | y16 | cash>20% NW year (years from start) | laid up / returned |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| strong | 1840 | normal | 3 | no | 0.03 | 15.94 | 0.71 | 2.16 | 7.3 | 0.31 | 1.22 | 4.44 | 0.43 | 0.43 | 0.39 | 0.21 | 0.19 | 0.23 | 3 | 0 / 0 |
| strong | 1840 | normal | 2 | no | 0.02 | 15.54 | 0.85 | 2.74 | 7.96 | 0.42 | 1.52 | 4.76 | 0.41 | 0.45 | 0.4 | 0.20 | 0.19 | 0.20 | 5 | 0 / 0 |
| strong | 1840 | normal | 1 | no | 0.02 | 14.49 | 0.83 | 2.5 | 6.99 | 0.39 | 1.37 | 4.12 | 0.46 | 0.45 | 0.41 | 0.18 | 0.18 | 0.21 | 16 | 0 / 0 |
| strong | 1840 | normal | 4 | no | 0.02 | 16.68 | 0.84 | 2.41 | 8.03 | 0.41 | 1.33 | 5.01 | 0.44 | 0.45 | 0.38 | 0.20 | 0.18 | 0.24 | never | 0 / 0 |
| strong | 1840 | normal | 7 | no | 0.03 | 18.51 | 0.82 | 2.89 | 8.65 | 0.4 | 1.67 | 5.84 | 0.43 | 0.42 | 0.33 | 0.21 | 0.21 | 0.25 | 3 | 0 / 0 |
| strong | 1840 | normal | 5 | no | 0.01 | 16.99 | 0.75 | 2.02 | 7.82 | 0.33 | 1.06 | 5.18 | 0.39 | 0.48 | 0.34 | 0.25 | 0.16 | 0.25 | 3 | 0 / 0 |
| strong | 1840 | normal | 8 | no | 0.02 | 15.97 | 0.73 | 2.11 | 6.88 | 0.31 | 1.1 | 4.33 | 0.44 | 0.48 | 0.37 | 0.19 | 0.16 | 0.21 | 13 | 0 / 0 |
| strong | 1840 | normal | 6 | no | 0.02 | 14.89 | 0.75 | 2.13 | 7.18 | 0.32 | 1.1 | 4.39 | 0.42 | 0.48 | 0.39 | 0.21 | 0.15 | 0.24 | 15 | 0 / 0 |
| strong | 1840 | normal | 9 | no | 0.03 | 17.82 | 0.78 | 2.3 | 8.36 | 0.35 | 1.22 | 5.76 | 0.45 | 0.47 | 0.31 | 0.19 | 0.17 | 0.26 | 12 | 0 / 0 |
| strong | 1840 | normal | 10 | no | 0.03 | 16.79 | 0.84 | 2.3 | 8.04 | 0.41 | 1.24 | 5.39 | 0.43 | 0.46 | 0.33 | 0.21 | 0.17 | 0.26 | 3 | 0 / 0 |
| strong | 1870 | normal | 2 | no | 0.02 | 47.68 | 2.69 | 10.63 | 10.9 | 1.63 | 6.53 | 6.45 | 0.35 | 0.39 | 0.41 | 0.30 | 0.28 | 0.20 | 2 | 0 / 0 |
| strong | 1870 | normal | 1 | no | 0.01 | 30.82 | 1.91 | 8.32 | 11.26 | 1.15 | 4.93 | 6.34 | 0.45 | 0.41 | 0.44 | 0.20 | 0.25 | 0.18 | 3 | 14 / 14 |
| strong | 1870 | normal | 6 | no | 0.02 | 36.66 | 1.91 | 8.28 | 11.54 | 1.19 | 4.99 | 7.17 | 0.44 | 0.4 | 0.38 | 0.21 | 0.30 | 0.22 | 3 | 0 / 0 |
| strong | 1870 | normal | 5 | no | 0.02 | 46.15 | 2.48 | 9.71 | 10.18 | 1.51 | 5.88 | 5.89 | 0.35 | 0.39 | 0.42 | 0.30 | 0.27 | 0.18 | 9 | 0 / 0 |
| strong | 1870 | normal | 3 | no | 0.02 | 41.47 | 2.43 | 9.11 | 11.59 | 1.46 | 5.12 | 6.62 | 0.35 | 0.44 | 0.43 | 0.30 | 0.23 | 0.20 | 2 | 0 / 0 |
| strong | 1870 | normal | 4 | no | 0.03 | 34.2 | 1.9 | 9.18 | 11.52 | 1.17 | 5.64 | 6.54 | 0.44 | 0.39 | 0.43 | 0.20 | 0.28 | 0.19 | 3 | 0 / 0 |
