import { buyableLocomotivesIn } from "../../../src/data/trains";
for (const y of [1880, 1885])
  for (const l of buyableLocomotivesIn(y))
    console.log(y, l.id, l.type, "maxCars", l.maxCars, "kmh", l.maxSpeedKmh, "cost", l.cost, "pmOnly", (l as { passengerMailOnly?: boolean }).passengerMailOnly ?? false, "power", l.power);
