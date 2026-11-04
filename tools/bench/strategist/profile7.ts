import { createGameState } from "../../../src/sim/state";
import { scenarioById, scenarioNewGameOptions } from "../../../src/data/scenarios";
import { INDUSTRIES } from "../../../src/data/industries";
import { createStrongBot } from "../strongBot";
const mk = (): ReturnType<typeof createStrongBot> =>
  createStrongBot(createGameState(scenarioNewGameOptions(scenarioById("coalTrieste")!)));
const probe = mk();
const s = probe.state;
const tri = s.cities.find((c) => c.name === "Trieste")!;
console.log("Trieste", tri.anchorX, tri.anchorY);
for (const i of s.industries) {
  const d = Math.hypot(i.x - tri.anchorX, i.y - tri.anchorY);
  const cons = Object.keys(INDUSTRIES[i.type].consumes);
  const prod = Object.keys(INDUSTRIES[i.type].produces);
  if (i.type === "coalMine" || cons.includes("coal"))
    console.log(
      i.id,
      i.type,
      `(${i.x},${i.y})`,
      "dist to Trieste",
      d.toFixed(1),
      "consumes",
      cons.join(","),
      "produces",
      prod.join(","),
    );
}
for (const withGoal of [false, true]) {
  const b = mk();
  if (withGoal) {
    b.setGoalLabels(["freight coal"]);
    b.setDeliverGoal("coal", "Trieste", 8);
  }
  for (let m = 0; m < 2; m++) {
    b.monthA();
    b.monthB(m);
  }
  console.log("== withGoal", withGoal, "lines", b.lines.length);
  for (const l of b.candidateLabels()) console.log("  ", l);
}
