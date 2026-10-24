/** Phase 68 bench helper: env SPLIT="splitSizeExponent,evenShare" overrides the passenger split for a sweep. Import for the side effect. */
import { PAIR_DEMAND } from "../../src/data/economy";

if (process.env["SPLIT"]) {
  const [split, even] = process.env["SPLIT"].split(",").map(Number);
  Object.assign(PAIR_DEMAND, {
    splitSizeExponent: split ?? PAIR_DEMAND.splitSizeExponent,
    evenShare: even ?? PAIR_DEMAND.evenShare,
  });
}
