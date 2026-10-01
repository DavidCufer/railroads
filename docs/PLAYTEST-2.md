# Playtest 2 (work in progress — written stage by stage)

Build under test: `origin/main` after Phase 29. Headless Chromium 800×360, `?debug=1`, Vite dev server, driven by a small Playwright
server that evaluates scripts in the page (`window.__game` debug API plus the game's own `findBuildPath`). Scratch scripts live in a
gitignored `.scratch/` folder. Honest limits: track, stations and trains were mostly placed through the debug commands (same command
layer the UI uses), not by finger; I opened the real UI only to read panels and screenshots.

## Game 1 — Central Europe, 1840, Normal, 1840–1870 (seed 1)

Opening: Milan–Venice (59 tiles, $147k) + two stations ($45k each) + 2 Norris with 3 pax + 2 mail cars ($60k each).

| Jan of | Cash | Net worth | Revenue (previous year) | Op. cost | Repairs | Trains | Stations |
|---|---|---|---|---|---|---|---|
| 1841 | $0.77M | $1.01M | $143k | $15k | – | 2 | 2 |
| 1852 | $1.3M | $3.0M | $0.40M | $116k | $11k | 14 | 9 |
| 1853 | $1.5M | $3.5M | $0.76M | $149k | $13k | 16 | 10 |
| 1855 | $2.3M | $4.7M | $0.98M | $189k | $8k | 20 | 12 |
| 1858 | $4.2M | $7.2M | $1.34M | $258k | $11k | 26 | 15 |
| 1860 | $5.8M | $9.1M | $1.41M | $305k | $15k | 30 | 17 |
| 1862 | $7.4M | $11.0M | $1.52M | $366k | $36k | 34 | 19 |
| 1865 | $9.9M | $14.0M | $1.73M | $431k | $41k | 40 | 22 |
| 1868 | $13.5M | $17.0M | $1.64M | $449k | $28k | 40 | 22 |
| 1870 | $15.7M | $19.1M | $1.61M | $467k | $37k | 40 | 22 |

Policy: every January, if cash allowed, connect the best unconnected city (population ÷ distance) with 2 trains of the newest engine
(3 pax + 2 mail cars for a Norris), repair washed-out bridges when I noticed.

- Money is no longer a problem in 1840: **$1.0M → $19.1M net worth in 30 years** (PT1: $0.93M → $4.7M). 1841 already made $143k from 2 Norris on 290 km.
- **Washed-out wooden bridges silently cut lines.** Munich–Prague (washout in 1846, $270k of track and two trains idle for 5 years) and Strasbourg (1861, took 3 lines / 10 trains
  with it, idle for 9 years in my run). Only a single "washout" news item and the ⚠ chip said so. See Bugs.
- Station tap target: a city's `anchor` tile is not always buildable (Dresden, Vienna): 8 tiles of the city footprint had to be tried.

## Game 2 — random medium map (seed 7, 256×192), 1830, Normal, 1830–1855

Same map as PT1 game 2 (Ashtown 86k, Woodfield 90k). Opening: Ashtown–Northford (30 tiles, $78k) + 2 Stations ($40k each) + 2 Grasshoppers ($32k with cars).

| Jan of | Cash | Net worth | Revenue (prev. year) | Op. cost | Repairs | Trains | Stations |
|---|---|---|---|---|---|---|---|
| 1831 | $0.79M | $0.93M | $19k | $8k | 0 | 2 | 2 |
| 1836 | $0.79M | $1.00M | $45k | $15k | $1k | 5 | 2 |
| 1838 | $0.38M | $0.90M | $92k | $45k | $10k | 9 | 4 |
| 1840 | $0.53M | $1.00M | $124k | $43k | $7k | 9 | 4 |
| 1843 | $0.43M | $1.08M | $109k | $63k | $14k | 11 | 5 |
| 1845 | $0.67M | $1.27M | $179k | $60k | $7k | 11 | 5 |
| 1848 | $0.24M | $1.34M | $226k | $104k | $15k | 17 | 8 |
| 1850 | $0.51M | $1.53M | $228k | $101k | $7k | 17 | 8 |
| 1853 | $0.39M | $1.73M | $332k | $144k | $20k | 21 | 10 |
| 1855 | $0.43M | $1.92M | $343k | $158k | $16k | 23 | 11 |

- After 25 years the company is worth **$1.92M (192 % of the start)** vs PT1 $0.65M (65 %). So 1830 is now *viable*, but the first 10 years are still very slow:
  the two Grasshoppers earn $14k and $8k a year, and 3 more on the same line add only $11–21k a year in total (each earns $5–8k, costs $2–4k).
- Only the Grasshopper exists until the Planet (1832) and the Norris (1838); the Norris is the first engine that makes the economy "work".

## Game 3 — random medium map (seed 11), 1900, Hard, 1900–1920

Opening: Wolfmerehaven (138k) – Wolflandridge (61k), 23 tiles: track $105k, 2 Stations $88k each, 1 Atlantic with 3 pax + 3 mail cars $240k (cash left $77k).

| Jan of | Cash | Net worth | Revenue (prev. year) | Op. cost | Taxes | Trains | Stations |
|---|---|---|---|---|---|---|---|
| 1901 | $0.62M | $1.03M | $616k | $87k | $58k | 1 | 2 |
| 1902 | $0.98M | $1.63M | $720k | $111k | $67k | 2 | 2 |
| 1903 | $1.1M | $2.0M | $694k | $132k | $64k | 3 | 3 |
| 1905 | $1.0M | $2.7M | $727k | $191k | $66k | 5 | 5 |
| 1908 | $2.3M | $4.2M | $860k | $243k | $77k | 6 | 6 |
| 1911 | $4.2M | $5.8M | $912k | $333k | $149k | 6 | 6 |
| 1914 | $6.0M | $7.4M | $942k | $347k | $152k | 6 | 6 |
| 1917 | $7.9M | $8.9M | $979k | $350k | $161k | 6 | 6 |
| 1920 | $9.7M | $10.6M | $990k | $374k | $157k | 6 | 6 |

- One Atlantic earned **$616k in year 1** (cost $240k). Income tax on Hard starts in 1900 (≈9 % of profit), 1911+ ≈ 19 %.
- A second Atlantic on the same pair added only $74k (it shares the supply).
- Idle cash: $9.7M in 1920 with nothing left to build (all 6 towns ≥ 5k served).
- Same opening, 5 years, Easy / Normal / Hard: revenue identical on Normal and Hard ($616–650k a year); Hard pays $58–62k income tax a year (Normal 0 until 1910),
  so cash after 5 years is $5.1M / $3.7M / $2.9M. **Hard is "Normal minus ~20 %", not a different game.**
