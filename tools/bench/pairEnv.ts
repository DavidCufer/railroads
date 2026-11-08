/** Bench helper (import for the side effect): env TRIPS=<factor> scales the trips-per-head table. (The Phase 68 SPLIT sweep went with the gravity model.) */
import { TRIPS_PER_HEAD_ANCHORS } from "../../src/data/economy";

// env TRIPS=<factor> scales the trips-per-head table uniformly (a game-scale sweep)
if (process.env["TRIPS"]) {
  const f = Number(process.env["TRIPS"]);
  // the table is readonly in the game; a bench sweep rewrites it in place before any run starts
  for (const a of TRIPS_PER_HEAD_ANCHORS as [number, number][]) a[1] *= f;
}
