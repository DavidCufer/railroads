/**
 * Phase 31 item 1 (play-test 11): passengers must unload (and reload) at a middle stop of a 3-stop loop.
 */
import { describe, expect, it } from "vitest";
import { buildStation, buildTrack, buyTrain, setOrders } from "../../../src/sim/commands";
import { makeTestMap, makeTestState, tileAt } from "../track/helpers";
import { advanceOneHour } from "../../../src/sim/tick";
import type { City } from "../../../src/sim/economy/types";
import type { GameState } from "../../../src/sim/state";

export function lineWithStops(n: number, gap: number, year: number, pop = 60_000) {
  const width = gap * (n - 1) + 4;
  const rows = Array.from({ length: 4 }, () => Array.from({ length: width }, () => "p").join(""));
  const map = makeTestMap(rows);
  const state = makeTestState(map, { startYear: year });
  state.cash = 1e12;
  const xs = Array.from({ length: n }, (_, i) => 1 + i * gap);
  xs.forEach((ox, id) => {
    const ts = [
      tileAt(map, ox, 0),
      tileAt(map, ox + 1, 0),
      tileAt(map, ox, 1),
      tileAt(map, ox + 1, 1),
    ];
    for (const t of ts) map.cityId[t] = id;
    const city: City = {
      id,
      name: `C${id}`,
      tier: "city",
      population: pop,
      anchorX: ox,
      anchorY: 0,
      tiles: ts,
      coastal: false,
    };
    state.cities.push(city);
  });
  const path = Array.from({ length: xs[n - 1]! - xs[0]! + 1 }, (_, i) =>
    tileAt(map, xs[0]! + i, 2),
  );
  expect(buildTrack(state, path).ok).toBe(true);
  for (const x of xs) expect(buildStation(state, tileAt(map, x, 2), "station").ok).toBe(true);
  return { state, stationIds: state.stations.map((s) => s.id) };
}

interface Snap {
  tick: number;
  cars: Array<{ units: number; tile?: number; at?: number }>;
  order: number;
}

/** Runs `days` and returns every stop where a car that could have been delivered here was carried on. */
export function missedUnloads(state: GameState, days: number): string[] {
  const bad: string[] = [];
  const snaps = new Map<number, Snap>();
  const prev = new Map<number, string>();
  for (let i = 0; i < days * 24; i++) {
    advanceOneHour(state);
    for (const t of state.trains) {
      const was = prev.get(t.id);
      prev.set(t.id, t.status);
      if (t.status === "loading" && was !== "loading") {
        snaps.set(t.id, {
          tick: state.ticks,
          order: t.callingIndex ?? t.currentOrderIndex,
          cars: t.cars.map((c) => ({
            units: c.loadedUnits,
            ...(c.loadedTile !== undefined ? { tile: c.loadedTile } : {}),
            ...(c.loadedTick !== undefined ? { at: c.loadedTick } : {}),
          })),
        });
      }
      if (was === "loading" && t.status !== "loading" && t.status !== "waitingForStation") {
        const snap = snaps.get(t.id);
        if (!snap) continue;
        const order = t.orders[snap.order]!;
        const st = state.stations.find((x) => x.id === order.stationId)!;
        const acc = state.stationEconomy.get(st.id)?.accepts ?? [];
        snap.cars.forEach((c, k) => {
          const car = t.cars[k]!;
          if (c.units <= 0 || c.tile === st.tile || order.rule !== "auto") return;
          if (!acc.includes(car.cargoType)) return;
          if (car.loadedUnits > 0 && car.loadedTick === c.at)
            bad.push(
              `tick ${state.ticks} train ${t.id} stop ${snap.order} (st${st.id}) car ${k} ${car.cargoType} kept ${c.units}`,
            );
        });
      }
    }
  }
  return bad;
}

describe("middle stop (Phase 31)", () => {
  it("Trieste - Venice - Ljubljana loop: the middle stop is served on both passes and earns", () => {
    const { state, stationIds } = lineWithStops(3, 12, 1840);
    expect(
      buyTrain(state, stationIds[0]!, "norris-4-2-0", [
        "passengers",
        "passengers",
        "passengers",
        "mail",
        "mail",
      ]).ok,
    ).toBe(true);
    const t = state.trains[0]!;
    expect(
      setOrders(
        state,
        t.id,
        stationIds.map((id) => ({ stationId: id, rule: "auto" as const })),
      ).ok,
    ).toBe(true);
    const delivered = new Map<string, number>();
    const stops = new Map<number, number>();
    let was = "";
    for (let i = 0; i < 24 * 200; i++) {
      advanceOneHour(state);
      if (t.status === "loading" && was !== "loading") {
        const id = t.orders[t.callingIndex ?? t.currentOrderIndex]!.stationId;
        stops.set(id, (stops.get(id) ?? 0) + 1);
      }
      was = t.status;
      for (const e of state.pendingDeliveries) {
        const key = `${e.stationId}:${e.cargoType}`;
        delivered.set(key, (delivered.get(key) ?? 0) + (e.units ?? 0));
      }
      state.pendingDeliveries.length = 0;
    }
    for (const id of stationIds) {
      expect(delivered.get(`${id}:passengers`) ?? 0, `passengers at ${id}`).toBeGreaterThan(0);
      expect(delivered.get(`${id}:mail`) ?? 0, `mail at ${id}`).toBeGreaterThan(0);
    }
    // Venice (the middle stop) is called at on the way back too: about twice the visits of an end (1.5x allows for the loop in progress).
    expect(stops.get(stationIds[1]!)!).toBeGreaterThan(1.5 * stops.get(stationIds[0]!)!);
  });

  it("a station the route runs through is a stop only when it is in the orders and not Pass through", () => {
    const { state, stationIds } = lineWithStops(3, 12, 1840);
    buyTrain(state, stationIds[0]!, "norris-4-2-0", ["passengers", "passengers", "mail"]);
    const t = state.trains[0]!;
    // A - C only: B is just a through station.
    setOrders(
      state,
      t.id,
      [stationIds[0]!, stationIds[2]!].map((id) => ({ stationId: id, rule: "auto" as const })),
    );
    let called = false;
    for (let i = 0; i < 24 * 80; i++) {
      advanceOneHour(state);
      if (t.callingIndex !== undefined) called = true;
    }
    expect(called).toBe(false);
    // Ordered, but Pass through: still not a stop.
    setOrders(state, t.id, [
      { stationId: stationIds[0]!, rule: "auto" },
      { stationId: stationIds[1]!, rule: "passThrough" },
      { stationId: stationIds[2]!, rule: "auto" },
    ]);
    for (let i = 0; i < 24 * 80; i++) {
      advanceOneHour(state);
      if (t.callingIndex !== undefined) called = true;
    }
    expect(called).toBe(false);
  });

  it("property: random 2-4 stop routes never carry a loaded car past a stop that accepts its cargo", () => {
    for (let seed = 1; seed <= 24; seed++) {
      const n = 2 + (seed % 3);
      const { state, stationIds } = lineWithStops(
        n,
        6 + (seed % 5) * 3,
        seed % 2 ? 1840 : 1900,
        20_000 + seed * 9_000,
      );
      for (const s of state.stations) s.hasEngineShed = true;
      const loco = seed % 2 ? "norris-4-2-0" : "atlantic-4-4-2";
      const cars =
        seed % 3 === 0
          ? ["passengers", "passengers", "mail"]
          : ["passengers", "passengers", "passengers", "mail", "mail"];
      const trains = 1 + (seed % 2);
      for (let k = 0; k < trains; k++) {
        const bought = buyTrain(state, stationIds[(k * 2) % n]!, loco, cars as never);
        expect(bought, `seed ${seed} ${loco}`).toMatchObject({ ok: true });
        const t = state.trains[state.trains.length - 1]!;
        const ids = k % 2 ? [...stationIds].reverse() : stationIds;
        expect(
          setOrders(
            state,
            t.id,
            ids.map((id) => ({ stationId: id, rule: "auto" as const })),
          ).ok,
        ).toBe(true);
      }
      expect(missedUnloads(state, 150), `seed ${seed}`).toEqual([]);
    }
  });
});
