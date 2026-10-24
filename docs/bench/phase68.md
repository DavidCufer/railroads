# Phase 68 bench (split sweep, before the item 2 prices; strong player Normal, central-eu, seeds 1-2; rev / operating profit $M at year 5 / 10 / 16)

Baseline (Phase 67 bench, same seeds): 1870 profit y16 8.22 / 7.93; 1900 12.45 / 8.08. Setting = SPLIT env 'splitSizeExponent,evenShare'.

```
strong normal 1870_0.5,0.1_1: rev 2.26 prof 1.23;rev 8.97 prof 4.77;rev 12.31 prof 7.12;
strong normal 1870_0.5,0.1_2: rev 2.35 prof 1.33;rev 9.54 prof 5.41;rev 12.04 prof 7.01;
strong normal 1870_0.6,0_1: rev 2.37 prof 1.34;rev 8.41 prof 4.42;rev 13.16 prof 7.77;
strong normal 1870_0.6,0_2: rev 2.57 prof 1.46;rev 6.77 prof 3.25;rev 12.23 prof 6.86;
strong normal 1870_0.8,0_1: rev 2.52 prof 1.45;rev 11.36 prof 6.90;rev 13.41 prof 8.37;
strong normal 1870_0.8,0_2: rev 2.67 prof 1.52;rev 9.11 prof 4.87;rev 13.47 prof 7.84;
strong normal 1870_1,0.2_1: rev 2.50 prof 1.47;rev 5.31 prof 2.30;rev 12.54 prof 6.88;
strong normal 1870_1,0.2_2: rev 2.49 prof 1.42;rev 9.30 prof 5.07;rev 13.15 prof 7.70;
strong normal 1900_0.5,0.1_1: rev 3.56 prof 2.10;rev 11.67 prof 5.54;rev 15.82 prof 7.17;
strong normal 1900_0.5,0.1_2: rev 3.45 prof 2.05;rev 10.16 prof 4.49;rev 16.02 prof 6.94;
strong normal 1900_0.6,0_1: rev 3.54 prof 1.91;rev 9.25 prof 3.82;rev 14.91 prof 6.37;
strong normal 1900_0.6,0_2: rev 3.21 prof 1.73;rev 9.40 prof 4.49;rev 17.29 prof 9.43;
strong normal 1900_0.8,0_1: rev 3.44 prof 1.76;rev 12.13 prof 5.59;rev 18.27 prof 9.69;
strong normal 1900_0.8,0_2: rev 3.94 prof 2.19;rev 14.75 prof 7.89;rev 20.83 prof 12.04;
strong normal 1900_1,0.2_1: rev 3.64 prof 2.06;rev 13.47 prof 6.83;rev 18.95 prof 10.26;
strong normal 1900_1,0.2_2: rev 3.80 prof 2.11;rev 9.67 prof 4.05;rev 14.79 prof 6.30;

S4 1900 (2 seeds, ALL=1) best fleet net k$/yr, setting: best
1900_0.6,0.jsonl configs 27 BEST 2express+4local (4081, 6, 6) | 2loc (1447, 6, 2) | 1e1l (1665, 6, 2)
1900_0.8,0.2.jsonl configs 27 BEST 3express+3local (4537, 6, 6) | 2loc (1459, 6, 2) | 1e1l (1666, 6, 2)
1900_0.8,0.jsonl configs 27 BEST 3express+3local (4748, 6, 6) | 2loc (1456, 6, 2) | 1e1l (1666, 6, 2)
1900_1,0.jsonl configs 27 BEST 5express+1local (5204, 6, 6) | 2loc (1459, 6, 2) | 1e1l (1666, 6, 2)
```

## Extended split sweep (item prices of Phase 68 included; strong Normal, seeds 1-2; one 1870 seed-2 / 0.2 run missing: killed by a worker restart)

```
strong normal 1870_1,0.2_1: rev 2.30 prof 1.37;rev 5.90 prof 2.87;rev 13.48 prof 7.85;
strong normal 1870_1,0.3_1: rev 2.21 prof 1.27;rev 5.04 prof 2.37;rev 13.15 prof 6.97;
strong normal 1870_1,0.3_2: rev 2.47 prof 1.47;rev 5.27 prof 2.48;rev 13.20 prof 7.39;
strong normal 1870_1,0.4_1: rev 2.20 prof 1.27;rev 7.87 prof 4.28;rev 10.80 prof 6.03;
strong normal 1870_1,0.4_2: rev 2.34 prof 1.35;rev 7.26 prof 3.77;rev 12.88 prof 7.69;
strong normal 1870_1,0.5_1: rev 2.05 prof 1.18;rev 5.74 prof 2.86;rev 13.84 prof 8.14;
strong normal 1870_1,0.5_2: rev 2.21 prof 1.25;rev 4.56 prof 2.07;rev 11.44 prof 5.47;
strong normal 1900_1,0.2_1: rev 4.00 prof 2.26;rev 11.40 prof 5.32;rev 15.79 prof 7.69;
strong normal 1900_1,0.2_2: rev 3.76 prof 2.28;rev 10.61 prof 5.19;rev 16.00 prof 8.27;
strong normal 1900_1,0.3_1: rev 3.46 prof 1.85;rev 12.45 prof 6.33;rev 17.49 prof 8.86;
strong normal 1900_1,0.3_2: rev 3.66 prof 2.00;rev 11.50 prof 5.29;rev 17.84 prof 9.14;
strong normal 1900_1,0.4_1: rev 3.33 prof 1.79;rev 10.49 prof 4.69;rev 15.65 prof 6.97;
strong normal 1900_1,0.4_2: rev 3.46 prof 1.89;rev 8.14 prof 3.54;rev 11.25 prof 3.53;
strong normal 1900_1,0.5_1: rev 3.29 prof 1.84;rev 9.06 prof 4.11;rev 13.23 prof 5.77;
strong normal 1900_1,0.5_2: rev 3.31 prof 1.85;rev 7.00 prof 2.81;rev 13.67 prof 5.90;
```

## Re-measure (item 3; raw rows; Phase 67 bench is the baseline)

Revenue and operating profit are those of the completed year (year 5 = the fifth year played). `-` = no data (bankrupt before that year). Settings: evenShare 0.3, Phase 68 prices.

| bot | start | diff | seed | bankrupt | min cash $M | final NW $M | revenue $M y5 | y10 | y16 | op profit $M y5 | y10 | y16 | op ratio y3 | y10 | y16 | return on capital y3 | y10 | y16 | cash>20% NW year (years from start) | laid up / returned |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| strong | 1840 | normal | 2 | no | 0.01 | 14.7 | 1.08 | 2.5 | 6.36 | 0.6 | 1.3 | 3.59 | 0.47 | 0.48 | 0.44 | 0.15 | 0.16 | 0.18 | 2 | 0 / 0 |
| strong | 1840 | normal | 3 | no | 0.03 | 15.39 | 1.23 | 2.76 | 6.7 | 0.7 | 1.45 | 3.94 | 0.45 | 0.47 | 0.41 | 0.17 | 0.17 | 0.20 | 2 | 0 / 0 |
| strong | 1840 | normal | 1 | no | 0.02 | 15.19 | 1.08 | 2.8 | 6.73 | 0.57 | 1.45 | 3.81 | 0.43 | 0.48 | 0.43 | 0.19 | 0.16 | 0.20 | 2 | 0 / 0 |
| strong | 1840 | normal | 4 | no | 0.01 | 14.66 | 1.14 | 2.4 | 6.41 | 0.62 | 1.19 | 3.61 | 0.44 | 0.5 | 0.44 | 0.18 | 0.15 | 0.20 | 2 | 0 / 0 |
| strong | 1840 | normal | 5 | no | 0.01 | 18.09 | 0.88 | 2.73 | 8.64 | 0.4 | 1.58 | 5.76 | 0.4 | 0.42 | 0.33 | 0.22 | 0.22 | 0.25 | 2 | 0 / 0 |
| strong | 1840 | normal | 6 | no | 0.02 | 18.93 | 0.94 | 3.41 | 8.26 | 0.48 | 2.05 | 5.49 | 0.42 | 0.4 | 0.34 | 0.20 | 0.24 | 0.25 | 2 | 0 / 0 |
| strong | 1840 | normal | 7 | no | 0.02 | 15.64 | 1.14 | 2.78 | 6.97 | 0.61 | 1.45 | 4.15 | 0.43 | 0.48 | 0.4 | 0.18 | 0.17 | 0.21 | 2 | 0 / 0 |
| strong | 1840 | normal | 8 | no | 0.02 | 14.9 | 1.14 | 2.36 | 6.7 | 0.62 | 1.13 | 3.85 | 0.45 | 0.52 | 0.43 | 0.17 | 0.14 | 0.21 | 2 | 0 / 0 |
| strong | 1840 | normal | 9 | no | 0.01 | 15.17 | 1.07 | 2.45 | 6.73 | 0.57 | 1.19 | 3.89 | 0.45 | 0.51 | 0.42 | 0.17 | 0.15 | 0.21 | 2 | 0 / 0 |
| strong | 1840 | normal | 10 | no | 0.01 | 15.56 | 1.13 | 2.41 | 6.73 | 0.61 | 1.2 | 3.87 | 0.48 | 0.5 | 0.43 | 0.15 | 0.15 | 0.20 | 2 | 0 / 0 |
| strong | 1870 | normal | 2 | no | 0.02 | 32.79 | 2.47 | 5.27 | 13.2 | 1.47 | 2.48 | 7.39 | 0.48 | 0.53 | 0.44 | 0.22 | 0.18 | 0.21 | 3 | 0 / 0 |
| strong | 1870 | normal | 3 | no | 0.03 | 37.27 | 2.28 | 8.3 | 11.56 | 1.34 | 4.6 | 6.68 | 0.46 | 0.45 | 0.42 | 0.23 | 0.27 | 0.22 | 3 | 0 / 0 |
| strong | 1870 | normal | 1 | no | 0.03 | 27.4 | 2.21 | 5.04 | 13.15 | 1.27 | 2.37 | 6.97 | 0.47 | 0.53 | 0.47 | 0.22 | 0.18 | 0.20 | 3 | 0 / 0 |
| strong | 1870 | normal | 5 | no | 0.04 | 39.94 | 2.31 | 8.76 | 10.73 | 1.35 | 5.01 | 6.16 | 0.48 | 0.43 | 0.43 | 0.22 | 0.29 | 0.20 | 3 | 0 / 0 |
| strong | 1870 | normal | 4 | no | 0.04 | 36.43 | 2.19 | 5.36 | 14.5 | 1.25 | 2.54 | 8.78 | 0.47 | 0.53 | 0.39 | 0.22 | 0.18 | 0.26 | 3 | 0 / 0 |
| strong | 1870 | normal | 7 | no | 0.03 | 33.88 | 2.22 | 5.25 | 14.64 | 1.32 | 2.51 | 8.74 | 0.46 | 0.52 | 0.4 | 0.23 | 0.19 | 0.24 | 3 | 0 / 0 |
| strong | 1870 | normal | 6 | no | 0.02 | 39.57 | 2.33 | 8.53 | 12.67 | 1.38 | 4.7 | 7.26 | 0.47 | 0.45 | 0.43 | 0.22 | 0.25 | 0.22 | 3 | 0 / 0 |
| strong | 1870 | normal | 8 | no | 0.03 | 31.96 | 2.37 | 5.68 | 13.66 | 1.37 | 2.81 | 7.82 | 0.47 | 0.51 | 0.43 | 0.22 | 0.20 | 0.22 | 3 | 0 / 0 |
