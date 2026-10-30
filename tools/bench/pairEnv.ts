/** Phase 68 bench helper: env SPLIT="splitSizeExponent,evenShare" overrides the passenger split for a sweep. Import for the side effect. */
import { PAIR_DEMAND, TRIPS_PER_HEAD_ANCHORS } from "../../src/data/economy";

if (process.env["SPLIT"]) {
  const [split, even] = process.env["SPLIT"].split(",").map(Number);
  Object.assign(PAIR_DEMAND, {
    splitSizeExponent: split ?? PAIR_DEMAND.splitSizeExponent,
    evenShare: even ?? PAIR_DEMAND.evenShare,
  });
}

// env TRIPS=<factor> scales the trips-per-head table uniformly (a game-scale sweep)
if (process.env["TRIPS"]) {
  const f = Number(process.env["TRIPS"]);
  // the table is readonly in the game; a bench sweep rewrites it in place before any run starts
  for (const a of TRIPS_PER_HEAD_ANCHORS as [number, number][]) a[1] *= f;
}
