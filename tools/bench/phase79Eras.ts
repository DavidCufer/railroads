/** Phase 79: the era tables a trunk line is judged by (indexes, fare of a 100 km journey, best engine). `npx tsx tools/bench/phase79Eras.ts` */
import "./p79Env";
import {
  PASSENGER_REAL_FARE_ANCHORS,
  fareIndex,
  interpolateYear,
  priceIndex,
  tripsPerHeadPerMonth,
  travelRangeTiles,
  wageIndex,
  handlingShare,
  competitionLoss,
  eraReferenceTilesPerDay,
} from "../../src/data/economy";
import { CARGO } from "../../src/data/cargo";
import { buyableLocomotivesIn } from "../../src/data/trains";
import { REVENUE_DISTANCE_TILES } from "../../src/data/cargo";
void PASSENGER_REAL_FARE_ANCHORS;
void interpolateYear;
console.log(
  "| year | price index | pax fare index (nominal) | real fare | wage index | trips/head/month | travel range tiles | fare 100 km one pax $ (before competition) | road/air competition loss at 100 km | fastest engine km/h | its price $k | its upkeep $k/yr | ref tiles/day |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|",
);
for (const y of [1840, 1850, 1856, 1860, 1870, 1880, 1886, 1900, 1910, 1916, 1930, 1950]) {
  const fare = CARGO.passengers.baseRate * (100 / 5 / REVENUE_DISTANCE_TILES) * fareIndex(y, "passengers");
  const locos = buyableLocomotivesIn(y).filter((l) => !l.passengerMailOnly || true);
  const best = locos.reduce((a, b) => (b.maxSpeedKmh > a.maxSpeedKmh ? b : a));
  console.log(
    `| ${y} | ${priceIndex(y).toFixed(2)} | ${fareIndex(y, "passengers").toFixed(2)} | ${(fareIndex(y, "passengers") / priceIndex(y)).toFixed(2)} | ${wageIndex(y).toFixed(2)} | ${tripsPerHeadPerMonth(y).toFixed(4)} | ${travelRangeTiles(y)} | ${fare.toFixed(2)} | ${competitionLoss(y, "passengers", 100, best.maxSpeedKmh).toFixed(2)} | ${best.maxSpeedKmh} (${best.name}) | ${((best.cost * priceIndex(y)) / 1000).toFixed(0)} | ${((best.maintenancePerYear * priceIndex(y)) / 1000).toFixed(1)} | ${eraReferenceTilesPerDay(y).toFixed(1)} |`,
  );
}
void handlingShare;
