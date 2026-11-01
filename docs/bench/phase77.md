# Phase 77 bench (raw rows; bonds are never called, laid-up trains give no service; strongV1 = the Phase 59-69 bot (tools/bench/strongPlayerV1.ts), strong = the Phase 77 bot, both on current main)

Revenue and operating profit are those of the completed year (year 5 = the fifth year played). Return on capital = operating profit of the year / (capital invested in track and stations + rolling stock value as the bots print it). `-` = no data (bankrupt before that year, or a bad bot, which prints no yearly books). NaN = could not afford a first line.

| bot | start | diff | seed | bankrupt | min cash $M | final NW $M | revenue $M y5 | y10 | y16 | op profit $M y5 | y10 | y16 | op ratio y3 | y10 | y16 | return on capital y3 | y10 | y16 | cash>20% NW year (years from start) | laid up / returned |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| strong | 1840 | normal | 3 | no | 0.03 | 15.94 | 0.71 | 2.16 | 7.3 | 0.31 | 1.22 | 4.44 | 0.43 | 0.43 | 0.39 | 0.21 | 0.19 | 0.23 | 3 | 0 / 0 |
| strong | 1840 | normal | 2 | no | 0.02 | 17.07 | 0.85 | 2.74 | 8.45 | 0.42 | 1.52 | 5.25 | 0.41 | 0.45 | 0.38 | 0.20 | 0.19 | 0.24 | 5 | 0 / 0 |
| strong | 1840 | normal | 1 | no | 0.02 | 13.41 | 0.83 | 2.5 | 5.63 | 0.39 | 1.37 | 3.03 | 0.46 | 0.45 | 0.46 | 0.18 | 0.18 | 0.15 | never | 0 / 0 |
| strong | 1840 | normal | 4 | no | 0.02 | 16.68 | 0.84 | 2.41 | 8.03 | 0.41 | 1.33 | 5.01 | 0.44 | 0.45 | 0.38 | 0.20 | 0.18 | 0.24 | never | 0 / 0 |
| strong | 1840 | normal | 7 | no | 0.03 | 18.75 | 0.82 | 2.89 | 8.77 | 0.4 | 1.67 | 5.96 | 0.43 | 0.42 | 0.32 | 0.21 | 0.21 | 0.25 | 3 | 0 / 0 |
| strong | 1840 | normal | 5 | no | 0.01 | 16.94 | 0.75 | 2.02 | 7.75 | 0.33 | 1.06 | 5.11 | 0.39 | 0.48 | 0.34 | 0.25 | 0.16 | 0.23 | 3 | 0 / 0 |
| strong | 1840 | normal | 8 | no | 0.02 | 15.97 | 0.73 | 2.11 | 6.88 | 0.31 | 1.1 | 4.33 | 0.44 | 0.48 | 0.37 | 0.19 | 0.16 | 0.21 | 13 | 0 / 0 |
| strong | 1840 | normal | 6 | no | 0.02 | 13.88 | 0.75 | 2.13 | 7.35 | 0.32 | 1.1 | 4.49 | 0.42 | 0.48 | 0.39 | 0.21 | 0.15 | 0.23 | 16 | 0 / 0 |
| strong | 1840 | normal | 9 | no | 0.03 | 17.82 | 0.78 | 2.3 | 8.36 | 0.35 | 1.22 | 5.76 | 0.45 | 0.47 | 0.31 | 0.19 | 0.17 | 0.26 | 12 | 0 / 0 |
| strong | 1840 | normal | 10 | no | 0.03 | 16.44 | 0.84 | 2.3 | 7.65 | 0.41 | 1.24 | 5.05 | 0.43 | 0.46 | 0.34 | 0.21 | 0.17 | 0.24 | 3 | 0 / 0 |
| strong | 1870 | normal | 2 | no | 0.02 | 45.92 | 2.69 | 10.02 | 10.63 | 1.63 | 5.98 | 6.23 | 0.35 | 0.4 | 0.41 | 0.30 | 0.26 | 0.19 | 2 | 0 / 0 |
| strong | 1870 | normal | 1 | no | 0.01 | 33.72 | 1.91 | 8.12 | 11.5 | 1.15 | 4.82 | 6.72 | 0.45 | 0.41 | 0.42 | 0.20 | 0.25 | 0.20 | 3 | 12 / 12 |
| strong | 1870 | normal | 5 | no | 0.02 | 46.15 | 2.48 | 9.71 | 10.18 | 1.51 | 5.88 | 5.89 | 0.35 | 0.39 | 0.42 | 0.30 | 0.27 | 0.18 | 9 | 0 / 0 |
| strong | 1870 | normal | 6 | no | 0.02 | 35.31 | 1.91 | 8.14 | 10.69 | 1.19 | 4.92 | 6.44 | 0.44 | 0.4 | 0.4 | 0.21 | 0.29 | 0.21 | 3 | 0 / 0 |
| strong | 1870 | normal | 3 | no | 0.02 | 42.11 | 2.43 | 9.48 | 11.89 | 1.46 | 5.42 | 6.93 | 0.35 | 0.43 | 0.42 | 0.30 | 0.24 | 0.20 | 2 | 0 / 0 |
| strong | 1870 | normal | 4 | no | 0.03 | 30.73 | 1.9 | 8.24 | 11.91 | 1.17 | 4.89 | 6.6 | 0.44 | 0.41 | 0.45 | 0.20 | 0.26 | 0.18 | 3 | 0 / 0 |
