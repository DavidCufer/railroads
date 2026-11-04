import { createGameState } from "../../../src/sim/state";
import { scenarioById, scenarioNewGameOptions } from "../../../src/data/scenarios";
import { INDUSTRIES } from "../../../src/data/industries";
const s = createGameState(scenarioNewGameOptions(scenarioById("coalTrieste")!));
const tri = s.cities.find((c) => c.name === "Trieste")!;
for (const i of s.industries)
  if (i.type === "port")
    console.log(
      i.id,
      "port",
      `(${i.x},${i.y})`,
      "dist",
      Math.hypot(i.x - tri.anchorX, i.y - tri.anchorY).toFixed(1),
      JSON.stringify(INDUSTRIES[i.type].consumes),
    );
