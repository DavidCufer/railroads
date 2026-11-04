# Phase 80 bench (fares x0.92; raw rows; bonds are never called, laid-up trains give no service; strongV1 = the Phase 59-69 bot (tools/bench/strongPlayerV1.ts), strong = the Phase 77 bot (V2), both on current main)

Revenue and operating profit are those of the completed year (year 5 = the fifth year played). Return on capital = operating profit of the year / (capital invested in track and stations + rolling stock value as the bots print it). `-` = no data (bankrupt before that year, or a bad bot, which prints no yearly books). NaN = could not afford a first line.

| bot | start | diff | seed | bankrupt | min cash $M | final NW $M | revenue $M y5 | y10 | y16 | op profit $M y5 | y10 | y16 | op ratio y3 | y10 | y16 | return on capital y3 | y10 | y16 | cash>20% NW year (years from start) | laid up / returned |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| strategist | 1870 | normal | 2 | no | 0.05 | 46.07 | 2.81 | 9.62 | 11.02 | 1.67 | 5.79 | 6.67 | 0.36 | 0.4 | 0.39 | 0.33 | 0.25 | 0.20 | 9 | 0 / 0 |
| strategist | 1870 | normal | 1 | no | 0.04 | 41.71 | 2.21 | 9.25 | 12.39 | 1.39 | 5.64 | 7.25 | 0.34 | 0.39 | 0.42 | 0.35 | 0.26 | 0.20 | 4 | 14 / 14 |
| strategist | 1870 | normal | 3 | no | 0.05 | 39.49 | 2.26 | 8.19 | 12.68 | 1.31 | 4.81 | 7.32 | 0.36 | 0.41 | 0.42 | 0.33 | 0.20 | 0.19 | 15 | 0 / 0 |
