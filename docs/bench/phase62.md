# Phase 62 bench (raw rows; passenger destinations split by uncapped gravity, volume unchanged)

Revenue and operating profit are those of the completed year (year 5 = the fifth year played). Return on capital = operating profit of the year / (capital invested in track and stations + rolling stock value as the bots print it). `-` = no data (bankrupt before that year, or a bad bot, which prints no yearly books). NaN = could not afford a first line.

| bot | start | diff | seed | bankrupt | min cash $M | final NW $M | revenue $M y5 | y10 | y16 | op profit $M y5 | y10 | y16 | op ratio y3 | y10 | y16 | return on capital y3 | y10 | y16 | cash>20% NW year (years from start) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| strong | 1840 | normal | 3 | no | 0.01 | 25.53 | 0.93 | 3.86 | 8.66 | 0.43 | 2.28 | 5.76 | 0.42 | 0.41 | 0.34 | 0.20 | 0.24 | 0.40 | 2 |
| strong | 1840 | normal | 2 | no | 0.03 | 18.83 | 1.17 | 2.63 | 8 | 0.63 | 1.33 | 5.04 | 0.44 | 0.49 | 0.37 | 0.20 | 0.17 | 0.30 | 2 |
| strong | 1840 | normal | 1 | no | 0.02 | 23.69 | 1.14 | 3.65 | 9.65 | 0.62 | 2.04 | 6.45 | 0.49 | 0.44 | 0.33 | 0.15 | 0.20 | 0.40 | 12 |
| strong | 1840 | normal | 4 | no | 0.02 | 17.8 | 1.16 | 2.5 | 7.77 | 0.61 | 1.2 | 4.77 | 0.44 | 0.52 | 0.39 | 0.19 | 0.15 | 0.28 | 2 |
| strong | 1840 | normal | 5 | no | 0.01 | 18.26 | 1.11 | 2.43 | 7.73 | 0.59 | 1.16 | 4.79 | 0.45 | 0.52 | 0.38 | 0.19 | 0.15 | 0.28 | 2 |
| strong | 1900 | normal | 1 | no | 0.05 | 73.01 | 4.62 | 14.48 | 17.7 | 2.56 | 7.43 | 9.5 | 0.41 | 0.49 | 0.46 | 0.27 | 0.29 | 0.43 | 4 |
| strong | 1900 | normal | 3 | no | 0.05 | 83.93 | 4.01 | 16.99 | 20.54 | 2.08 | 9.31 | 11.5 | 0.41 | 0.45 | 0.44 | 0.27 | 0.33 | 0.47 | 4 |
| strong | 1900 | normal | 2 | no | 0.05 | 61.71 | 4.2 | 12.06 | 17.18 | 2.17 | 5.74 | 8.8 | 0.4 | 0.52 | 0.49 | 0.29 | 0.26 | 0.37 | 11 |
| strong | 1900 | normal | 5 | no | 0.06 | 59.92 | 4.11 | 10.2 | 17.69 | 2.1 | 4.46 | 9.67 | 0.45 | 0.56 | 0.45 | 0.25 | 0.21 | 0.43 | 12 |
| strong | 1900 | normal | 4 | no | 0.03 | 86.02 | 4.65 | 17.43 | 20.3 | 2.68 | 9.47 | 11.24 | 0.46 | 0.46 | 0.45 | 0.25 | 0.33 | 0.48 | 10 |

## S4 (two 100k+ towns, three 10-20k towns between; double track, 3 seeds, 2 years; `ALL=1 npx tsx tools/bench/explore.ts S4 <year> 3 2`)

Best fleet of each mix by net profit after a 5 % capital charge, main (Phase 65, before) vs this branch.

| year | mix | best cars main / branch | net $k/yr main | net $k/yr branch | change |
|---|---|---|---|---|---|
| 1840 | 1express+1local | 8 / 8 | 469 | 506 | +8 % |
| 1840 | 1express+2local | 8 / 8 | 690 | 760 | +10 % |
| 1840 | 2express+1local | 8 / 8 | 723 | 780 | +8 % |
| 1840 | 0express+2local | 8 / 8 | 445 | 487 | +9 % |
| 1840 | 2express+0local | 8 / 8 | 496 | 530 | +7 % |
| 1840 | 1express+0local | 8 / 8 | 251 | 265 | +6 % |
| 1840 | **best overall** | 2express+4local 6 cars / 6express+0local 8 cars | 1319 | 1512 | +15 % |
| 1870 | 1express+1local | 8 / 8 | 361 | 363 | +1 % |
| 1870 | 1express+2local | 8 / 8 | 539 | 552 | +2 % |
| 1870 | 2express+1local | 8 / 8 | 553 | 558 | +1 % |
| 1870 | 0express+2local | 8 / 8 | 352 | 357 | +1 % |
| 1870 | 2express+0local | 8 / 8 | 375 | 375 | +0 % |
| 1870 | 1express+0local | 8 / 8 | 187 | 187 | +0 % |
| 1870 | **best overall** | 6express+0local 8 cars / 6express+0local 8 cars | 1094 | 1100 | +1 % |
| 1900 | 1express+1local | 6 / 6 | 1626 | 1653 | +2 % |
| 1900 | 1express+2local | 6 / 6 | 2275 | 2369 | +4 % |
| 1900 | 2express+1local | 6 / 6 | 2543 | 2577 | +1 % |
| 1900 | 0express+2local | 6 / 6 | 1366 | 1445 | +6 % |
| 1900 | 2express+0local | 6 / 6 | 1850 | 1851 | +0 % |
| 1900 | 1express+0local | 6 / 6 | 924 | 926 | +0 % |
| 1900 | **best overall** | 2express+4local 6 cars / 5express+1local 6 cars | 4009 | 5201 | +30 % |
| 1930 | 1express+1local | 6 / 6 | 1991 | 2148 | +8 % |
| 1930 | 1express+2local | 6 / 6 | 2649 | 2962 | +12 % |
| 1930 | 2express+1local | 6 / 6 | 2775 | 3380 | +22 % |
| 1930 | 0express+2local | 6 / 6 | 1490 | 1733 | +16 % |
| 1930 | 2express+0local | 6 / 6 | 2079 | 2503 | +20 % |
| 1930 | 1express+0local | 6 / 6 | 1221 | 1252 | +3 % |
| 1930 | **best overall** | 1express+5local 6 cars / 3express+3local 6 cars | 3902 | 5363 | +37 % |
