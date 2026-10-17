/** PLAN Phase 51 item 3(a), geometry fixed in Phase 53: a multi-stop line along a chain of towns against point-to-point shuttles over the same
 * towns, with the same trains and cars. Prints profit per train, average load while moving and average waiting
 * at each station. `npx tsx tools/bench/multistop.ts [trains=6] [years=2] [start=1842]`;
 * env `SPACE` (space trains evenly), `DIAG`, `TOWNS` (comma list, default Milan,Venice,Trieste,Ljubljana), `LOCO`, `CARS`, `SEEDS`. */
import * as commands from "../../src/sim/commands";
import { createGameState } from "../../src/sim/state";
import { advanceOneHour } from "../../src/sim/tick";
import { findBuildPath } from "../../src/sim/track/pathfind";
import { booksProfit } from "../../src/sim/trains/profit";
import { HOURS_PER_DAY, DAYS_PER_YEAR } from "../../src/sim/time";

const [, , nArg = "6", yrsArg = "2", y0 = "1842"] = process.argv;
const n = Number(nArg);
const years = Number(yrsArg);
const startYear = Number(y0);
const TOWNS = (process.env["TOWNS"] ?? "Milan,Venice,Trieste,Ljubljana").split(",");
const LOCO = process.env["LOCO"] ?? "norris-4-2-0";
const NCARS = Number(process.env["CARS"] ?? 5);

interface Result {
  profitPerTrain: number;
  revenue: number;
  load: number;
  moving: number;
  waiting: number[];
  lost: number;
  delivered: number;
  fare: number;
}

function run(mode: "multi" | "shuttles", seed: number): Result {
  const state = createGameState({ seed, region: "central-eu", startYear, difficulty: "normal" });
  state.cash = 50_000_000;
  const ok = (r: unknown) => (r as { ok: boolean }).ok;
  const w = state.map.width;
  const cities = TOWNS.map((nm) => {
    const c = state.cities.find((x) => x.name === nm);
    if (!c) throw new Error("no town " + nm);
    return c;
  });
  const ctr = (c: { anchorX: number; anchorY: number }) => c.anchorY * w + c.anchorX;
  const legLen: number[] = [];
  const lineTiles: number[] = [];
  /** Town index -> tiles a station of that town may use when the next leg branches off short of the town. */
  const beforeJunction = new Map<number, number[]>();
  let prev: number[] | undefined;
  for (let i = 0; i + 1 < cities.length; i++) {
    let p: number[] | undefined;
    if (!prev) {
      p = findBuildPath(state.map, ctr(cities[0]!), ctr(cities[1]!), startYear, {}) ?? undefined;
      if (!p || !ok(commands.buildTrack(state, p))) throw new Error("track 0");
    } else {
      // Phase 53: the next leg continues from the previous town's tile, so that town's station stands ON the line (a
      // through station). The Phase 51 version joined the leg a few tiles short of the town, which left Venice on a
      // spur: a train had to run to the end of the line to turn round before it could go on to Trieste, and through
      // passengers rode 3-5x their distance (see PROGRESS Phase 53).
      p =
        findBuildPath(state.map, ctr(cities[i]!), ctr(cities[i + 1]!), startYear, {}) ?? undefined;
      if (!p || !ok(commands.buildTrack(state, p))) {
        // a sharp turn at the platform is refused: leave the old line a few tiles short of the town, as before
        p = undefined;
        for (let k = prev.length - 4; k >= 3 && !p; k--) {
          const q = findBuildPath(state.map, ctr(cities[i + 1]!), prev[k]!, startYear, {});
          if (q && ok(commands.buildTrack(state, q))) {
            p = q;
            // the town's station must stand before the junction, or a train arriving from behind would have to
            // run on to the end of the line to turn round before it could take the branch
            beforeJunction.set(i, prev.slice(0, k + 1));
          }
        }
      }
      if (!p) throw new Error("track " + i);
    }
    if (!ok(commands.upgradeTrack(state, p))) throw new Error("double " + i);
    legLen.push(p.length);
    lineTiles.push(...p);
    prev = p;
  }
  // Phase 53: a town's station stands on the line, on the straight tile nearest its centre (a bend cannot take one).
  const stationTile = new Map<string, number>();
  for (const [ci, c] of cities.entries()) {
    const near = [...new Set(beforeJunction.get(ci) ?? [ctr(c), ...lineTiles])].sort(
      (a, b) =>
        Math.hypot((a % w) - c.anchorX, Math.floor(a / w) - c.anchorY) -
        Math.hypot((b % w) - c.anchorX, Math.floor(b / w) - c.anchorY),
    );
    const tile = near.find((t) => ok(commands.buildStation(state, t, "station")));
    if (tile === undefined) throw new Error("station " + c.name);
    stationTile.set(c.name, tile);
  }
  const stations = cities.map((c) =>
    state.stations.find((s) => s.tile === stationTile.get(c.name))!,
  );
  for (const s of stations) commands.buildEngineShed(state, s.id);
  const cars = Array.from({ length: NCARS }, () => "passengers" as const);
  const ids: number[] = [];
  const buy = (at: (typeof stations)[0], stops: typeof stations) => {
    const r = commands.buyTrain(state, at.id, LOCO, cars);
    if (!ok(r)) throw new Error("train " + JSON.stringify(r));
    const t = state.trains[state.trains.length - 1]!;
    commands.setOrders(
      state,
      t.id,
      stops.map((s) => ({ stationId: s.id, rule: "auto" as const })),
    );
    ids.push(t.id);
  };
  const k = stations.length;
  if (mode === "multi") {
    // out and back along the chain, each intermediate station served both ways
    const cycle = [...stations, ...stations.slice(1, -1).reverse()];
    for (let i = 0; i < n; i++) {
      const rot = Math.floor((i * cycle.length) / n); // spread the starts around the cycle
      buy(stations[0]!, [...cycle.slice(rot), ...cycle.slice(0, rot)]);
    }
  } else {
    // trains split over the legs by leg length (at least one each)
    const total = legLen.reduce((a, b) => a + b, 0);
    const per = legLen.map((l) => Math.max(1, Math.round((n * l) / total)));
    while (per.reduce((a, b) => a + b, 0) > n) per[per.indexOf(Math.max(...per))]!--;
    while (per.reduce((a, b) => a + b, 0) < n) per[per.indexOf(Math.min(...per))]!++;
    for (let leg = 0; leg < k - 1; leg++)
      for (let i = 0; i < per[leg]!; i++) buy(stations[leg]!, [stations[leg]!, stations[leg + 1]!]);
  }
  // SPACE=1: the player's "Space trains evenly" on every line of two or more trains (multi: the whole fleet; shuttles: each leg)
  if (process.env["SPACE"]) {
    const groups = new Map<string, number[]>();
    for (const id of ids) {
      const t = state.trains.find((x) => x.id === id)!;
      const key = [...t.orders.map((o) => o.stationId)].sort((a, b) => a - b).join(",");
      groups.set(key, [...(groups.get(key) ?? []), id]);
    }
    for (const g of groups.values()) if (g.length > 1) commands.spaceTrainsEvenly(state, g);
  }
  const waitSum = stations.map(() => 0);
  let days = 0;
  const loadSum = new Map<number, [number, number]>();
  let lost = 0;
  for (let i = 0; i < years * DAYS_PER_YEAR * HOURS_PER_DAY; i++) {
    advanceOneHour(state);
    if (i % HOURS_PER_DAY === 0) {
      days++;
      stations.forEach((s, j) => {
        waitSum[j]! += state.stationCargo.get(s.id)?.passengers?.amount ?? 0;
      });
    }
    for (const t of state.trains) {
      if (t.status !== "moving") continue;
      const used = t.cars.reduce((u, c) => u + c.loadedUnits, 0);
      const e = loadSum.get(t.id) ?? [0, 0];
      e[0] += used / (t.cars.length * 40);
      e[1] += 1;
      loadSum.set(t.id, e);
    }
  }
  // last full year of the stations' ledgers: people delivered, their average fare, people turned away
  let delivered = 0;
  let deliveredRevenue = 0;
  for (const st of stations) {
    const p = state.stationFlow.get(st.id)?.lastYear.passengers;
    delivered += p?.delivered ?? 0;
    deliveredRevenue += p?.deliveredRevenue ?? 0;
    lost += p?.lostUnits ?? 0;
  }
  if (process.env["DIAG"] && seed === 1)
    for (const st of stations) {
      const e = state.stationEconomy.get(st.id);
      const routes = e?.passengerRoutes ?? [];
      const by = (c: number) =>
        Math.round(routes.filter((r) => r.changes === c).reduce((a, r) => a + r.perMonth, 0));
      console.log(
        `  ${mode} ${st.name}: demand ${Math.round(e?.passengerDemand ?? 0)} generated ${Math.round(e?.supply.passengers ?? 0)} a month; by changes 0/1/2/3: ${by(0)}/${by(1)}/${by(2)}/${by(3)}`,
      );
    }
  let profit = 0;
  let revenue = 0;
  let load = 0;
  let moving = 0;
  for (const id of ids) {
    const t = state.trains.find((x) => x.id === id)!;
    const yrs = Math.max(0.25, (state.ticks - t.purchaseTick) / HOURS_PER_DAY / DAYS_PER_YEAR);
    profit += booksProfit(t.profit.lifetime) / yrs;
    revenue += t.profit.lifetime.revenue / yrs;
    const e = loadSum.get(id);
    load += e && e[1] ? e[0] / e[1] : 0;
    moving += e ? e[1] / (years * DAYS_PER_YEAR * HOURS_PER_DAY) : 0;
  }
  return {
    profitPerTrain: profit / ids.length,
    revenue,
    load: load / ids.length,
    moving: moving / ids.length,
    waiting: waitSum.map((x) => x / Math.max(1, days)),
    lost,
    delivered,
    fare: delivered > 0 ? deliveredRevenue / delivered : 0,
  };
}

const SEEDS = Array.from({ length: Number(process.env["SEEDS"] ?? 3) }, (_, i) => i + 1);
for (const mode of ["multi", "shuttles"] as const) {
  const runs = SEEDS.map((s) => run(mode, s));
  const avg = (f: (r: Result) => number) => runs.reduce((a, r) => a + f(r), 0) / runs.length;
  console.log(
    `${startYear} ${TOWNS.join("-")} ${n} ${LOCO} x${NCARS} ${mode}: profit/train/yr ${Math.round(avg((r) => r.profitPerTrain) / 1000)}k, revenue/yr ${Math.round(avg((r) => r.revenue) / 1000)}k, avg load ${Math.round(avg((r) => r.load) * 100)} %, moving ${Math.round(avg((r) => r.moving) * 100)} % of the time, delivered/yr ${Math.round(avg((r) => r.delivered))} at $${Math.round(avg((r) => r.fare))} each, unserved/yr ${Math.round(avg((r) => r.lost))}, avg waiting ${TOWNS.map((t, j) => `${t} ${Math.round(avg((r) => r.waiting[j]!))}`).join(", ")}`,
  );
}
