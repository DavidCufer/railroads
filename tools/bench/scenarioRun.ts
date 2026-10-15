/**
 * Scripted runs of the Phase 46 scenarios (the "verified beatable run" of each, and the idle run that must lose).
 * `runScenario(id, "play")` builds what the goal needs with the game's own commands and runs the real tick loop until the
 * scenario ends; `"idle"` only runs the clock. The `panic1873` survival scenario is played by `goodPlayer.ts`
 * (`SCENARIO=panic1873 MAXPAIRS=2 KEEP=400000`). CLI: `tools/bench/scenarioBot.ts`.
 */
import { maxCarsOf } from "./legacyCars";
import {
  buildEngineShed,
  buildStation,
  buildTrack,
  buyTrain,
  computeBuildPlan,
  setOrders,
  takeLoan,
} from "../../src/sim/commands";
import { SCENARIOS, scenarioById, scenarioNewGameOptions } from "../../src/data/scenarios";
import { buyableLocomotivesIn } from "../../src/data/trains";
import { landPrices } from "../../src/sim/economy/land";
import { createGameState } from "../../src/sim/state";
import { advanceOneHour } from "../../src/sim/tick";
import { findBuildPath } from "../../src/sim/track/pathfind";
import { calendarFromTicks } from "../../src/sim/time";
import { netWorth } from "../../src/sim/finance/ledger";
import { fixWeightBridges } from "./fixBridges";
import type { CargoType } from "../../src/data/cargo";

interface Spot {
  x: number;
  y: number;
}

export interface BotResult {
  id: string;
  status: string;
  stars: number;
  reason?: string;
  endYear: number;
  netWorth: number;
  note: string;
}

export function runScenario(id: string, mode: "play" | "idle"): BotResult {
  const def = scenarioById(id)!;
  const state = createGameState(scenarioNewGameOptions(def));
  const W = state.map.width;
  const year = (): number => calendarFromTicks(state.startYear, state.ticks).year;
  const dist = (a: Spot, b: Spot): number => Math.hypot(a.x - b.x, a.y - b.y);
  const xy = (t: number): Spot => ({ x: t % W, y: Math.floor(t / W) });
  let note = "";

  /** Free land tiles around `at` (within `radius`), nearest to `toward` first. */
  function around(at: Spot, toward: Spot, radius: number, tiles?: number[]): number[] {
    const taken = new Set(state.trackGraph.allNodes());
    const out: Array<{ t: number; d: number }> = [];
    const cand = tiles ?? [];
    if (!tiles)
      for (let dy = -radius; dy <= radius; dy++)
        for (let dx = -radius; dx <= radius; dx++) {
          const x = at.x + dx;
          const y = at.y + dy;
          if (x < 1 || y < 1 || x >= W - 1 || y >= state.map.height - 1) continue;
          cand.push(y * W + x);
        }
    for (const t of cand) {
      if (taken.has(t)) continue;
      const iid = state.map.industryId[t];
      if (iid !== -1 && iid !== undefined) continue;
      out.push({ t, d: dist(xy(t), toward) });
    }
    return out.sort((a, b) => a.d - b.d).map((o) => o.t);
  }

  /** Track and two stations between two sets of candidate tiles; returns the two station ids. */
  function leg(
    from: number[],
    to: number[],
    types: ["station" | "terminal", "station" | "terminal"],
  ): [number, number] | null {
    const stationTiles = new Set(state.stations.map((s) => s.tile));
    for (const ta of from.slice(0, 8))
      for (const tb of to.slice(0, 8)) {
        const path = findBuildPath(state.map, ta, tb, year(), {
          respectTurns: { graph: state.trackGraph, stationTiles },
          land: landPrices(state),
        });
        if (!path || path.length < 4) continue;
        const plan = computeBuildPlan(state, path);
        if (!plan.valid) continue;
        if (state.cash < plan.cost + 200_000) {
          note += ` [leg too dear: ${Math.round(plan.cost / 1000)}k > cash ${Math.round(state.cash / 1000)}k]`;
          continue;
        }
        const before = state.cash;
        if (!buildTrack(state, path).ok) continue;
        // a leg may start from a station that already exists (one smelter station for both legs)
        const a = state.stations.some((s) => s.tile === ta)
          ? { ok: true }
          : buildStation(state, ta, types[0]);
        const b = buildStation(state, tb, types[1]);
        if (!a.ok || !b.ok) {
          state.cash = before;
          continue;
        }
        note += ` leg ${Math.round(dist(xy(ta), xy(tb)))} tiles $${Math.round((before - state.cash) / 1000)}k;`;
        return [
          state.stations.find((s) => s.tile === ta)!.id,
          state.stations.find((s) => s.tile === tb)!.id,
        ];
      }
    return null;
  }

  function loco(): { id: string; cars: number } {
    const all = buyableLocomotivesIn(year()).filter(
      (l) => l.type !== "electric" && !l.passengerMailOnly,
    );
    const strong = all.filter((l) => maxCarsOf(l) >= 6);
    const pool = (strong.length > 0 ? strong : all).sort(
      (p, q) => q.maxSpeedKmh - p.maxSpeedKmh || p.cost - q.cost,
    );
    return { id: pool[0]!.id, cars: Math.min(maxCarsOf(pool[0]!), 6) };
  }

  function trains(at: number, other: number, n: number, cargo: CargoType, shed = true): void {
    if (shed) buildEngineShed(state, at);
    const l = loco();
    for (let i = 0; i < n; i++) {
      if (!buyTrain(state, at, l.id, Array(l.cars).fill(cargo)).ok) break;
      const t = state.trains[state.trains.length - 1]!;
      setOrders(state, t.id, [
        { stationId: at, rule: "auto" },
        { stationId: other, rule: "auto" },
      ]);
    }
  }

  function cityTiles(name: string, toward: Spot): number[] {
    const c = state.cities.find((x) => x.name === name)!;
    const centre = { x: c.anchorX, y: c.anchorY };
    const near = [...c.tiles]
      .sort((p, q) => dist(xy(p), centre) - dist(xy(q), centre))
      .slice(0, 12);
    return around(
      centre,
      toward,
      0,
      near.sort((p, q) => dist(xy(p), toward) - dist(xy(q), toward)),
    );
  }

  if (mode === "play") {
    const g = def.goal;
    if (g.type === "connect") {
      const a = state.cities.find((c) => c.name === g.cities[0])!;
      const b = state.cities.find((c) => c.name === g.cities[1])!;
      const ids = leg(
        cityTiles(a.name, { x: b.anchorX, y: b.anchorY }),
        cityTiles(b.name, { x: a.anchorX, y: a.anchorY }),
        ["station", "station"],
      );
      if (ids) {
        const l = loco();
        for (let i = 0; i < 2; i++) {
          if (!buyTrain(state, ids[0], l.id, Array(l.cars).fill("passengers")).ok) break;
          setOrders(state, state.trains[state.trains.length - 1]!.id, [
            { stationId: ids[i as 0 | 1], rule: "auto" },
            { stationId: ids[(1 - i) as 0 | 1], rule: "auto" },
          ]);
        }
      }
    } else if (g.type === "deliver" && g.cargo === "coal") {
      const vienna = state.cities.find((c) => c.name === g.nearCity!.name)!;
      const vc = { x: vienna.anchorX, y: vienna.anchorY };
      const mill = state.industries
        .filter((i) => i.type === "port")
        .sort((p, q) => dist(p, vc) - dist(q, vc))[0]!;
      const mines = state.industries
        .filter((i) => i.type === "coalMine")
        .sort((p, q) => dist(p, vc) - dist(q, vc));
      note += ` mines ${mines.map((m) => Math.round(dist(m, vc))).join(",")};`;
      for (const mine of mines) {
        const ids = leg(around(mine, vc, 2), around(mill, mine, 2), ["terminal", "terminal"]);
        if (!ids) continue;
        trains(ids[0], ids[1], Number(process.env["TRAINS"] ?? 3), "coal");
        break;
      }
    } else if (g.type === "deliver") {
      // silver: mine -> smelter -> mint
      const find = (type: string) => state.industries.find((i) => i.type === type)!;
      const mine = find("silverMine");
      const plant = find("smelter");
      const sink = find("mint");
      const first = leg(around(mine, plant, 2), around(plant, mine, 2), ["terminal", "terminal"]);
      const taken = new Set(state.stations.map((s) => s.tile));
      const second = leg(
        around(plant, sink, 2).filter((t) => !taken.has(t)),
        around(sink, plant, 2),
        ["terminal", "station"],
      );
      if (first && second) {
        trains(first[0], first[1], Number(process.env["ORE"] ?? 2), "silverOre");
        trains(second[0], second[1], Number(process.env["BARS"] ?? 2), "silverBars");
      }
    }
  }

  for (
    let h = 0;
    h < Number(process.env["YEARS"] ?? 14) * 360 * 24 && state.scenario!.status === "active";
    h++
  ) {
    advanceOneHour(state);
    if (h % (30 * 24) === 0) fixWeightBridges(state);
    if (process.env["POS"] && h % (5 * 24) === 0 && h < 400 * 24)
      console.log(
        h / 24,
        state.trains
          .map(
            (t) =>
              `${t.status}@${t.renderToX.toFixed(0)},${t.currentOrderIndex},${Math.round(t.speed ?? -1)}`,
          )
          .join(" "),
      );
    if (process.env["TRACE"] && h % (90 * 24) === 0)
      console.log(
        year(),
        `cash ${Math.round(state.cash / 1000)}k loans ${Math.round(state.finance.loans / 1000)}k progress ${Math.round(state.scenario!.progress)}`,
        state.trains.map((t) => t.status[0]).join(""),
        [...state.stationCargo.entries()]
          .map(
            ([id, p]) =>
              `${id}:` +
              Object.entries(p)
                .filter(([, v]) => v!.amount >= 1)
                .map(([k, v]) => `${k}=${Math.round(v!.amount)}`)
                .join("/"),
          )
          .join(" "),
        [...state.industryEconomy.entries()]
          .filter(([, e]) =>
            Object.keys(e.inputStock).some((k) => (e.inputStock as Record<string, number>)[k]! > 0),
          )
          .map(([id, e]) => `ind${id}:${JSON.stringify(e.inputStock)}`)
          .join(" "),
      );
    if (mode === "play" && h % (30 * 24) === 0 && state.cash < 100_000) takeLoan(state, 100_000);
  }
  if (process.env["DUMP"])
    for (const t of state.trains)
      console.log(
        JSON.stringify({
          status: t.status,
          order: t.currentOrderIndex,
          orders: t.orders,
          cars: t.cars.map((c) => [c.cargoType, c.loadedUnits]),
          x: t.renderToX,
          y: t.renderToY,
          route: t.route?.length,
          stations: state.stations.map((st) => [st.id, st.tile % W, Math.floor(st.tile / W)]),
        }),
      );
  const run = state.scenario!;
  return {
    id,
    status: run.status,
    stars: run.stars,
    ...(run.reason ? { reason: run.reason } : {}),
    endYear: calendarFromTicks(state.startYear, run.endTick ?? state.ticks).year,
    netWorth: netWorth(state),
    note: `${note} progress ${Math.round(run.progress)}`,
  };
}
