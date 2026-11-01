/**
 * Phase 78: which stations collect an industry's cargo. A works ships through the stations whose trains come for its
 * goods: pickups over the last ~90 days (`StationFlow.pickups`), or a train whose orders load that cargo there.
 */
import type { CargoType } from "../../data/cargo";
import type { GameState } from "../state";

export interface Pickups {
  /** station id -> cargo -> units loaded over the rolling window (absent = none). */
  history: ReadonlyMap<number, Partial<Record<CargoType, number>>>;
  /** station id -> cargo types some train's orders would load there (a stop that loads, with a car of that cargo). */
  ordered: ReadonlyMap<number, ReadonlySet<CargoType>>;
}

export function collectPickups(state: GameState): Pickups {
  const history = new Map<number, Partial<Record<CargoType, number>>>();
  for (const [id, flow] of state.stationFlow) {
    if (!flow.pickups) continue;
    const sums: Partial<Record<CargoType, number>> = {};
    for (const [cargo, months] of Object.entries(flow.pickups) as Array<[CargoType, number[]]>) {
      const total = months.reduce((a, b) => a + b, 0);
      if (total > 0) sums[cargo] = total;
    }
    history.set(id, sums);
  }
  const ordered = new Map<number, Set<CargoType>>();
  for (const train of state.trains) {
    const cargos = new Set(train.cars.map((c) => c.cargoType));
    for (const order of train.orders) {
      if (order.rule === "unloadOnly" || order.rule === "passThrough") continue;
      let set = ordered.get(order.stationId);
      if (!set) ordered.set(order.stationId, (set = new Set()));
      for (const c of cargos) set.add(c);
    }
  }
  return { history, ordered };
}

/** Shares (summing to 1) of `cargo` among the covering stations, per the Phase 78 rule. Pure and deterministic. */
export function outputShares(
  covering: readonly number[],
  cargo: CargoType,
  pickups: Pickups | undefined,
): Map<number, number> {
  const shares = new Map<number, number>(covering.map((id) => [id, 0]));
  const even = (ids: readonly number[]): Map<number, number> => {
    for (const id of ids) shares.set(id, 1 / ids.length);
    return shares;
  };
  if (covering.length <= 1 || !pickups) return even(covering);
  const collectors = covering.filter(
    (id) =>
      (pickups.history.get(id)?.[cargo] ?? 0) > 0 || pickups.ordered.get(id)?.has(cargo) === true,
  );
  if (collectors.length === 0) return even(covering); // nobody collects: the cargo waits, as before
  const weight = (id: number): number => pickups.history.get(id)?.[cargo] ?? 0;
  const withHistory = collectors.filter((id) => weight(id) > 0);
  if (withHistory.length === 0) return even(collectors);
  // A station whose orders load the cargo but has no history yet (a new line) counts as the average collector.
  const avg = withHistory.reduce((a, id) => a + weight(id), 0) / withHistory.length;
  const w = collectors.map((id) => (weight(id) > 0 ? weight(id) : avg));
  const total = w.reduce((a, b) => a + b, 0);
  collectors.forEach((id, i) => shares.set(id, (w[i] as number) / total));
  return shares;
}
