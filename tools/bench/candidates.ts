/** PLAN Phase 51/62: how many destination towns are in range of a town and the share of its trips each takes (the
 * radiation model, `destinationShares`). `npx tsx tools/bench/candidates.ts [year=1842] [Venice,Milan,Ljubljana]` */
import { travelRangeTiles } from "../../src/data/economy";
import { createGameState } from "../../src/sim/state";
import { destinationShares } from "../../src/sim/stations/passengerFlows";
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
  const cands = state.cities
    .filter((c) => c.id !== src.id)
    .map((c) => ({
      id: c.id,
      population: c.population,
      distance: octileTileDistance(at(src), at(c), w),
    }))
    .filter((c) => c.distance <= travelRangeTiles(year));
  const shares = destinationShares(cands);
  const total = [...shares.values()].reduce((a, b) => a + b, 0);
  const rows = [...shares]
    .sort((a, b) => b[1] - a[1])
    .map(([id, s]) => {
      const c = state.cities.find((x) => x.id === id)!;
      return `${c.name}(${c.population}) ${Math.round(s * 100)}%`;
    });
  console.log(
    `${year} ${nm}(${src.population}): ${shares.size} in range, total ${Math.round(total * 100)}%: ${rows.join(", ")}`,
  );
}
