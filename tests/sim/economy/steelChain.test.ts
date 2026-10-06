/** PLAN Phase 33 item 1: the player's Trieste steel chain on Central Europe 1840. */
import { describe, expect, it } from "vitest";
import { buildStation, buildTrack, buyTrain, setOrders } from "../../../src/sim/commands";
import { terrainId } from "../../../src/sim/map/terrain";
import { createGameState, type GameState } from "../../../src/sim/state";
import { advanceOneHour } from "../../../src/sim/tick";
import type { Station } from "../../../src/sim/stations/types";
import type { CargoType } from "../../../src/data/cargo";
import { getOrCreateIndustryEconomy, processorStatus } from "../../../src/sim/economy/processing";
import { INDUSTRIES, inputStorageCap } from "../../../src/data/industries";
import type { Industry, IndustryEconomyState } from "../../../src/sim/economy/types";
import { cargoGaps } from "../../../src/sim/trains/cargoGaps";
import type { Train } from "../../../src/sim/trains/types";

type Pt = [number, number];

function seg(a: Pt, b: Pt): Pt[] {
  const out: Pt[] = [];
  let [x, y] = a;
  while (x !== b[0] || y !== b[1]) {
    out.push([x, y]);
    x += Math.sign(b[0] - x);
    y += Math.sign(b[1] - y);
  }
  out.push(b);
  return out;
}

/** Central Europe 1840 with the terrain flattened (the real hills would only hide the chain behind a track-building problem). */
function chainGame(triesteX: number): {
  state: GameState;
  st: Record<string, Station | undefined>;
} {
  const state = createGameState({ seed: 1, region: "central-eu" });
  state.map.terrain.fill(terrainId("plain"));
  state.map.elevation.fill(0);
  const w = state.map.width;
  const t = (p: Pt): number => p[1] * w + p[0];
  const path: Pt[] = [
    ...seg([176, 207], [187, 218]),
    ...seg([187, 219], [187, 233]).slice(0),
    ...seg([186, 234], [174, 246]),
    ...seg([173, 246], [153, 246]),
  ];
  const r = buildTrack(state, path.map(t));
  if (!r.ok) throw new Error(`track: ${r.reason}`);
  const place = (p: Pt, type: "depot" | "station" | "terminal"): Station => {
    const b = buildStation(state, t(p), type);
    if (!b.ok) throw new Error(`station at ${p}: ${b.reason}`);
    return state.stations[state.stations.length - 1] as Station;
  };
  const st = {
    iron: place([176, 207], "depot"),
    coal: place([187, 223], "depot"),
    mill: place([153, 246], "station"),
    trieste: place([triesteX, 246], "station"),
  };
  return { state, st };
}

const CARS: CargoType[] = ["ironOre", "ironOre", "coal", "coal", "steel"];
const ORDER = ["iron", "coal", "mill", "trieste"] as const;
const MILL_ID = 63;

function runChain(triesteX: number, months: number) {
  const { state, st } = chainGame(triesteX);
  const iron = st["iron"] as Station;
  expect(buyTrain(state, iron.id, "norris-4-2-0", CARS).ok).toBe(true);
  const orders = ORDER.map((k) => ({ stationId: (st[k] as Station).id, rule: "auto" as const }));
  expect(setOrders(state, 0, orders).ok).toBe(true);
  for (let h = 0; h < 24 * 30 * months; h++) advanceOneHour(state);
  return { state, st, orders };
}

describe("Trieste steel chain, Central Europe 1840 (PLAN Phase 33)", () => {
  it("a Trieste stop that covers the Port accepts steel: the mill makes it, the car loads it, Trieste is paid", () => {
    const { state, st } = runChain(163, 9);
    const trieste = st["trieste"] as Station;
    expect(state.stationEconomy.get(trieste.id)?.accepts).toContain("steel");
    const mill = state.industries[MILL_ID] as Industry;
    expect(mill.type).toBe("steelMill");
    const status = processorStatus(state, mill);
    // 40 t of ore and 40 t of coal a delivery (38 + 38 here: the mines' piles) make as much steel.
    expect(status?.madeLast.steel ?? 0).toBeGreaterThan(30);
    expect(state.industryEconomy.get(MILL_ID)?.lastReport?.received.ironOre ?? 0).toBeGreaterThan(
      30,
    );
    expect(state.cargoDeliveredThisYear.steel ?? 0).toBeGreaterThan(0);
  });

  it("station results count cargo sent from a mine and delivered at the mill (PLAN Phase 34 item 1)", () => {
    const { state, st } = runChain(163, 9);
    const mine = state.stationFlow.get((st["iron"] as Station).id);
    const mill = state.stationFlow.get((st["mill"] as Station).id);
    const sent = (mine?.year.ironOre?.sent ?? 0) + (mine?.lastYear.ironOre?.sent ?? 0);
    expect(sent).toBeGreaterThan(0);
    const delivered =
      (mill?.year.ironOre?.delivered ?? 0) + (mill?.lastYear.ironOre?.delivered ?? 0);
    expect(delivered).toBeGreaterThan(0);
    const earned = (mine?.year.ironOre?.revenue ?? 0) + (mine?.lastYear.ironOre?.revenue ?? 0);
    expect(earned).toBeGreaterThan(0);
  });

  it("a full processor stockpile refuses the cargo: it stays on the train and is not paid (PLAYTEST-3 B2)", () => {
    const { state, st } = chainGame(163);
    const iron = st["iron"] as Station;
    expect(buyTrain(state, iron.id, "norris-4-2-0", CARS).ok).toBe(true);
    const orders = ORDER.map((k) => ({ stationId: (st[k] as Station).id, rule: "auto" as const }));
    expect(setOrders(state, 0, orders).ok).toBe(true);
    const mill = state.industries[MILL_ID] as Industry;
    const econ = getOrCreateIndustryEconomy(state, MILL_ID);
    const cap = inputStorageCap(INDUSTRIES.steelMill, "coal");
    econ.inputStock = { coal: cap, ironOre: cap };
    const revenueBefore = state.cash;
    let maxStock = 0;
    for (let h = 0; h < 24 * 28; h++) {
      econ.inputStock = { coal: cap, ironOre: cap }; // the mill never gets a chance to use any
      advanceOneHour(state);
      maxStock = Math.max(maxStock, econ.inputStock.coal ?? 0, econ.inputStock.ironOre ?? 0);
    }
    expect(maxStock).toBeLessThanOrEqual(cap);
    econ.inputStock = { coal: cap, ironOre: cap };
    expect(processorStatus(state, mill)?.full).toBe(true);
    expect(state.cargoDeliveredThisYear.coal ?? 0).toBe(0);
    expect(state.cargoDeliveredThisYear.ironOre ?? 0).toBe(0);
    expect(state.cash).toBeLessThanOrEqual(revenueBefore);
    expect(state.trains[0]?.currentOrderIndex).toBeGreaterThanOrEqual(3); // it called at the mill
    expect(state.trains[0]?.cars.some((c) => c.loadedUnits > 0 && c.cargoType === "coal")).toBe(
      true,
    );
  });

  it("a Trieste stop without the Port does not accept steel, so the steel car stays empty — and the planner says so", () => {
    const { state, st, orders } = runChain(166, 9);
    const trieste = st["trieste"] as Station;
    expect(state.stationEconomy.get(trieste.id)?.accepts).not.toContain("steel");
    const train = state.trains[0] as Train;
    expect(train.cars[4]?.cargoType).toBe("steel");
    expect(state.cargoDeliveredThisYear.steel ?? 0).toBe(0);
    expect(train.cars[4]?.loadedUnits).toBe(0);
    // The mill did make steel; it simply has nowhere to go.
    const mill = state.industries[MILL_ID] as Industry;
    expect(processorStatus(state, mill)?.madeLast.steel ?? 0).toBeGreaterThan(0);

    const gaps = cargoGaps(state, CARS, orders);
    expect(gaps.map((g) => g.cargo)).toEqual(["steel"]);
    const first = gaps[0]?.nearest[0];
    expect(first?.kind).toBe("industry");
    if (first?.kind === "industry") expect(first.type).toBe("port");
  });

  it("an input a train bound for the station carries is on the way, not missing (PLAN Phase 34 item 5)", () => {
    const { state, st } = chainGame(163);
    const mill = state.industries[MILL_ID] as Industry;
    const millStation = st["mill"] as Station;
    expect(processorStatus(state, mill, [millStation.id])?.missing.slice().sort()).toEqual([
      "coal",
      "ironOre",
    ]);
    expect(
      buyTrain(state, (st["iron"] as Station).id, "norris-4-2-0", ["ironOre", "ironOre"]).ok,
    ).toBe(true);
    const orders = ["iron", "mill"].map((k) => ({
      stationId: (st[k] as Station).id,
      rule: "auto" as const,
    }));
    expect(setOrders(state, 0, orders).ok).toBe(true);
    const status = processorStatus(state, mill, [millStation.id]);
    expect(status?.onTheWay).toEqual(["ironOre"]);
    expect(status?.missing).toEqual(["coal"]);
  });

  it("an 'any' recipe says it needs one of its inputs only when none arrived or is coming", () => {
    const { state } = chainGame(163);
    const plant = state.industries.find(
      (i) =>
        INDUSTRIES[i.type].recipeMode === "any" &&
        Object.keys(INDUSTRIES[i.type].consumes).length > 1,
    ) as Industry;
    expect(plant).toBeDefined();
    const status = processorStatus(state, plant, []);
    expect(status?.needsAny).toBe(true);
    const econ = getOrCreateIndustryEconomy(state, plant.id);
    econ.inputStock = { [Object.keys(INDUSTRIES[plant.type].consumes)[0] as CargoType]: 10 };
    const after = processorStatus(state, plant, []);
    expect(after?.needsAny).toBe(false);
    expect(after?.missing).toEqual([]);
  });

  it("names the missing input when one half of the recipe never arrives", () => {
    const { state } = chainGame(163);
    const mill = state.industries[MILL_ID] as Industry;
    const econ = state.industryEconomy.get(MILL_ID) as IndustryEconomyState;
    econ.inputStock = { coal: 40 };
    expect(processorStatus(state, mill)?.missing).toEqual(["ironOre"]);
    econ.inputStock = { coal: 40, ironOre: 40 };
    expect(processorStatus(state, mill)?.missing).toEqual([]);
  });
});
