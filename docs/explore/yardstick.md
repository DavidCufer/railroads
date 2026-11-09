# Passenger yardstick (Phase 91)

What this is: a fixed set of small test railways, played for two years in 1842, 1870 and 1900 with the engine a player would own
then, and measured against the owner's complaints: stations always full, lots of trains between few cities, way too much money.
**No game rule or balance number was changed.** Bench: `tools/bench/yardstick.ts` (rows in `docs/explore/data/yardstick.jsonl`,
resumable), tables: `tools/bench/yardstickSummary.ts`, every train count in `docs/explore/data/yardstick-tables.md`.

## How to read it

- **Test lines.** P20 / P60: two large towns 20 / 60 tiles apart. T: five towns on one line (two cities, three small towns, 70
  tiles). H: a hub city with three branches of two towns. B: a thin branch of two small towns off a big city. Flat map, double track.
- **Trains.** 1842 Norris, 4 cars. 1870 American, 6 cars. 1900 Atlantic, 6 cars (its limit). Trains stop at every station on the
  line ("locals"); on T also 1 or 2 non-stop expresses between the two cities plus locals. 1 to 8 trains, 2 layouts each.
- **Carried** = people who arrived, as a share of what the line's routes would send in a year. Only stations the trains call at count.
- **Platform full** = share of station-months in the second year when the waiting pile was at its 20-day limit on at least half the days.
- **Net per train** = a train's own yearly profit after running costs (second year). Track is not counted (it is the same for any
  number of trains). **Pays back** = train price / net per train.
- Checked against the orchestrator's earlier bench on T: 1870, 6 trains carry 45-47 % (they said under half), about $310-330k a
  train (they said $320k); 1842, 6 locals carry about 55-60 % (60 %); 1900 with 5 cars, 1 / 3 / 6 locals carry 17 / 50 / 91 % (19 / 56 / 98).

## Summary in plain words

1. **Money: every ordinary train pays for itself in well under a year** (0.3 to 0.8 years; a train costs $48k in 1842, $120k in 1870, $273k in 1900 and earns $60k-800k a
   year). Only the thin branch B is slow (2.5-2.7 years in 1842 and 1870, 1.2 in 1900): there the train does earn its keep, but only just.
2. **Full platforms are the norm while a line is under-served.** With one train the platform is at its limit in 54-100 % of station-months
   in 1842 and 1870 on every line except the thin branch (35-49 %). They empty only when there are enough trains.
3. **"Lots of trains" is real for 1842 and 1870.** Even 8 locals do not reach 90 % of the people on a 60-tile pair, the five-town line or the hub
   (they carry 53-77 %), because the trains are slow and a pile holds only 20 days. In 1900 two trains are enough for a pair, four to six for a line.
4. **Speed changes everything.** The same 60-tile pair needs more than 8 trains in 1870 and 2 in 1900. People wait for a train, not for a seat.
5. **Express trains help only in 1900** (2 expresses + locals carry the two cities fully); earlier they carry little more than locals.

## Tables: where each line first carries 90 % of its people

"Then" means with that many trains. "1 train" is what a single train does. "Not by 8" = even 8 trains stay under 90 % (best share in brackets).

| line | year | trains to 90 % | platform full then | net per train then | pays back | 1 train: carried / full |
|---|---|---|---|---|---|---|
| P20 | 1842 | 3 | 0 % | $152k | 0.3 y | 40 % / 100 % |
| P20 | 1870 | 4 | 0 % | $251k | 0.5 y | 26 % / 100 % |
| P20 | 1900 | 2 | 0 % | $428k | 0.6 y | 62 % / 46 % |
| P60 | 1842 | not by 8 (64 %) | 25 % | $60k | 0.8 y | 25 % / 79 % |
| P60 | 1870 | not by 8 (71 %) | 25 % | $148k | 0.8 y | 19 % / 100 % |
| P60 | 1900 | 2 | 0 % | $783k | 0.3 y | 56 % / 50 % |
| T locals | 1842 | not by 8 (71 %) | 5 % | $172k | 0.3 y | 11 % / 93 % |
| T locals | 1870 | not by 8 (59 %) | 34 % | $309k | 0.4 y | 8 % / 100 % |
| T locals | 1900 | 6 | 0 % | $640k | 0.4 y | 20 % / 79 % |
| T 1 express + locals | 1842 / 1870 / 1900 | not by 8 (54 %) / not by 8 (55 %) / 6 | 27 / 22 / 0 % | $134k / $302k / $636k | 0.4 y | 24 / 18 / 53 % carried |
| T 2 expresses + locals | 1842 / 1870 / 1900 | not by 8 (63 %) / not by 8 (54 %) / 2 | 12 / 11 / 0 % | $166k / $307k / $826k | 0.3-0.4 y | 47 / 36 / 99 % carried |
| H | 1842 | not by 8 (53 %) | 22 % | $94k | 0.5 y | 37 % / 54 % |
| H | 1870 | not by 8 (59 %) | 12 % | $246k | 0.5 y | 26 % / 76 % |
| H | 1900 | 6 | 0 % | $438k | 0.6 y | 61 % / 11 % |
| B | 1842 | not by 8 (73 %) | 0 % | $19k | 2.5 y | 48 % / 35 % |
| B | 1870 | not by 8 (77 %) | 0 % | $44k | 2.7 y | 41 % / 49 % |
| B | 1900 | 2 | 0 % | $231k | 1.2 y | 83 % / 0 % |

(For the 1900 expresses, "2 expresses" means two trains that call at the two cities only: they carry everyone those two stops
send, which is why the share is so high. Every other train count and mix is in `yardstick-tables.md`.)

On T the best mix at 3-5 trains in 1900 is 1 express + locals, as the earlier bench found; in 1842 and 1870 locals only are as good.

## Candidates (bench only, nothing shipped): the distance exponent

Today the route demand falls as (20 tiles / distance) to the power **0.5** beyond 20 tiles. Candidates 1.0 and 2.0, same lines.
Pairs 20 tiles or closer do not change (P20 is identical). "Trains to 90 %" is of the people that exponent allows.

| line | year | exponent | people a year | trains to 90 % | platform full then | net per train | pays back |
|---|---|---|---|---|---|---|---|
| P60 | 1870 | 0.5 / 1 / 2 | 15,194 / 8,772 / 2,924 | not by 8 / not by 8 / 3 | 25 / 50 / 0 % | $148k / $56k / $95k | 0.8 / 2.2 / 1.3 y |
| P60 | 1900 | 0.5 / 1 / 2 | 14,844 / 8,570 / 2,857 | 2 / 2 / 2 | 0 % | $783k / $423k / $107k | 0.3 / 0.6 / 2.6 y |
| T | 1870 | 0.5 / 1 / 2 | 54,694 / 44,481 / 33,309 | not by 8 | 34 / 1 / 2 % | $309k / $293k / $157k | 0.4 / 0.4 / 0.8 y |
| T | 1900 | 0.5 / 1 / 2 | 53,435 / 44,088 / 33,439 | 6 / 4 / 4 | 0 % | $640k / $657k / $347k | 0.4 / 0.4 / 0.8 y |
| H | 1870 | 0.5 / 1 / 2 | 21,091 / 18,831 / 15,941 | not by 8 | 12 / 11 / 14 % | $246k / $207k / $157k | 0.5 / 0.6 / 0.8 y |
| B | 1870 | 0.5 / 1 / 2 | 12,156 / 11,047 / 9,563 | not by 8 | 0 % | $44k / $38k / $24k | 2.7 / 3.2 / 4.9 y |
| B | 1900 | 0.5 / 1 / 2 | 12,256 / 11,242 / 9,362 | 2 | 0 % | $231k / $186k / $136k | 1.2 / 1.5 / 2.0 y |

All years and lines: the "Candidates" section of `yardstick-tables.md` is the same table in full.

What it says: 1.0 takes about 40 % off a 60-tile pair and 15-20 % off the five-town line; 2.0 takes about 80 % off the 60-tile pair and
about 40 % off the five-town line. A longer line then needs fewer trains to be "full-ish", and long trains pay back in about 1-3 years instead
of under one. The 20-tile pair and short hops are untouched.

**Real-world basis.** Distance exponents of gravity models of passenger travel are mostly between about 1 and 2. A study of Chinese
intercity rail flows fits about 1.9 (and says rail values lie between 1 and 3), a regional trip-distribution study found 1.5, and
rail decays more slowly than road ([Spatial patterns of interurban passenger flows](https://arxiv.org/pdf/2201.04013),
[trip distribution, TRID 376890](https://trid.trb.org/View/376890)). The value depends on the model form and on whether distance is
kilometres or travel time, so these are rough guides, not a calibration for this game. 0.5 is below the usual range; 1.0 is the
common neutral choice; 2.0 is the steep end.

## What changing trains once at the hub would add (H, a size, not a model)

Same formula for pairs of towns on different branches (today only the hub and a branch's own towns are linked). The game caps a station at
1.5 times its own town total, and the small towns are already near that cap, so the cap swallows most of the new pairs.

| exponent | extra people a year, with the cap (as the game would) | without any cap |
|---|---|---|
| 0.5 (today) | +21 % | +57 % |
| 1.0 | +27 % | +55 % |
| 2.0 | +30 % | +51 % |

(1870 / 1900 on H: about 63,000 people a year today, so about +13,000 with the cap. 1842: about 21,000, +4,400.)

## Two estimates fixed (display and pacing only)

1. A train that passes through a station no longer counts as serving it in the "who takes the waiting people" split.
2. The stop time a train is expected to need now follows the cars really handled (cars with people, unloaded and refilled), not "every
   car twice". Against a measured round trip on a five-stop line the estimate is now within 7 % (before: 23-30 % too long on thin lines).
   The canary records (six starts) are exactly unchanged.

## Limits

Flat map, no terrain; trains of the same length per era; two layouts per line; the second year only (the first fills the piles);
net per train leaves out track and station cost. Fullness uses a 95 % threshold on the pile against its 20-day limit.
