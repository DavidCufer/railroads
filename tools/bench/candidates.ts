/** PLAN Phase 51 item 2: how many destination towns are in range of a town (the candidates `capShares` splits over) and
 * the share each takes. `npx tsx tools/bench/candidates.ts [year=1842] [Venice,Milan,Ljubljana]` */
import { PAIR_DEMAND, travelRangeTiles } from "../../src/data/economy";
import { createGameState } from "../../src/sim/state";
import { capShares } from "../../src/sim/stations/passengerFlows";
import { octileTileDistance } from "../../src/sim/trains/geometry";

const year = Number(process.argv[2] ?? 1842);
const names = (process.argv[3] ?? "Venice,Milan,Ljubljana").split(",");
const state = createGameState({
  seed: 1,
  region: "central-eu",
  startYear: year,
  difficulty: "normal",
});
const w = state.map.width;
for (const nm of names) {
  const src = state.cities.find((c) => c.name === nm)!;
  const at = (c: typeof src) => c.anchorY * w + c.anchorX;
  const weights = new Map<number, number>();
  for (const c of state.cities) {
    if (c.id === src.id) continue;
    const d = octileTileDistance(at(src), at(c), w);
    if (d <= travelRangeTiles(year))
      weights.set(c.id, c.population / Math.max(PAIR_DEMAND.minDistanceTiles, d));
  }
  const shares = capShares(weights, PAIR_DEMAND.maxShare);
  const rows = [...shares]
    .sort((a, b) => b[1] - a[1])
    .map(([id, s]) => `${state.cities.find((c) => c.id === id)!.name} ${Math.round(s * 100)}%`);
  console.log(`${year} ${nm}: ${shares.size} candidates in range: ${rows.join(", ")}`);
}
