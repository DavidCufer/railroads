/** Pure helpers for the train screens (no DOM): stat bars relative to the best engine on sale,
 * consist suggestions, roster grouping. Unit-tested in tests/ui/trainScreens.test.ts. */
import { CARGO, type CargoType } from "../../data/cargo";
import type { LocomotiveDef, LocomotiveType } from "../../data/trains";

export interface StatBars {
  speed: number;
  power: number;
  cars: number;
  /** 0..1 fill for the price and upkeep bars, relative to the dearest engine in the pool. */
  price: number;
  running: number;
}

function frac(value: number, best: number): number {
  return best <= 0 ? 0 : Math.max(0, Math.min(1, value / best));
}

/** Bars scaled against the best of `pool` (STYLE §11.1: "relative to the best engine available now"). */
export function statBars(loco: LocomotiveDef, pool: readonly LocomotiveDef[]): StatBars {
  const all = pool.length > 0 ? pool : [loco];
  const best = (pick: (l: LocomotiveDef) => number): number =>
    Math.max(pick(loco), ...all.map(pick));
  return {
    speed: frac(
      loco.maxSpeedKmh,
      best((l) => l.maxSpeedKmh),
    ),
    power: frac(
      loco.power,
      best((l) => l.power),
    ),
    cars: frac(
      loco.maxCars,
      best((l) => l.maxCars),
    ),
    price: frac(
      loco.cost,
      best((l) => l.cost),
    ),
    running: frac(
      loco.maintenancePerYear,
      best((l) => l.maintenancePerYear),
    ),
  };
}

export interface ConsistSuggestion {
  id: string;
  cars: CargoType[];
}

const PASSENGER_LIKE: readonly CargoType[] = ["passengers", "mail"];

/** Suggested consists for a station, from what it supplies per month (`supply`). Passenger stations
 * get a passengers + mail train, each freight cargo gets a train of its own car type sized to the
 * monthly supply. Falls back to a passenger train when the station supplies nothing yet. */
export function suggestConsists(
  supply: Partial<Record<CargoType, number>>,
  allowed: readonly CargoType[],
  maxCars: number,
): ConsistSuggestion[] {
  const ok = (c: CargoType): boolean => allowed.includes(c);
  const out: ConsistSuggestion[] = [];
  const cap = Math.max(1, maxCars);
  const passengers = supply.passengers ?? 0;
  const mail = supply.mail ?? 0;
  if (ok("passengers") && (passengers > 0 || Object.keys(supply).length === 0)) {
    const cars: CargoType[] = ["passengers", "passengers"];
    if (ok("mail") && (mail > 0 || passengers > 0)) cars.push("mail");
    out.push({ id: "passenger", cars: cars.slice(0, cap) });
  }
  const freight = (Object.keys(supply) as CargoType[])
    .filter((c) => !PASSENGER_LIKE.includes(c) && ok(c) && (supply[c] ?? 0) > 0)
    .sort((a, b) => (supply[b] ?? 0) / CARGO[b].capacity - (supply[a] ?? 0) / CARGO[a].capacity);
  for (const c of freight.slice(0, 2)) {
    const loads = Math.ceil((supply[c] ?? 0) / CARGO[c].capacity);
    const n = Math.max(2, Math.min(cap, 6, loads));
    out.push({ id: c, cars: Array.from({ length: Math.min(cap, n) }, () => c) });
  }
  return out.filter((s) => s.cars.length > 0).slice(0, 3);
}

/** "Coal ×3" style groups of a consist, in order of first appearance. */
export function groupCars(cars: readonly CargoType[]): Array<{ cargo: CargoType; count: number }> {
  const groups: Array<{ cargo: CargoType; count: number }> = [];
  for (const c of cars) {
    const g = groups.find((x) => x.cargo === c);
    if (g) g.count++;
    else groups.push({ cargo: c, count: 1 });
  }
  return groups;
}

/** Traction types with at least one locomotive in `pool` (filter chips only show what exists). */
export function tractionTypesIn(pool: readonly LocomotiveDef[]): LocomotiveType[] {
  const order: LocomotiveType[] = ["steam", "diesel", "electric"];
  return order.filter((t) => pool.some((l) => l.type === t));
}

/** Roster order: by introduction year, then name. */
export function rosterOrder(all: readonly LocomotiveDef[]): LocomotiveDef[] {
  return [...all].sort((a, b) => a.introYear - b.introYear || a.name.localeCompare(b.name));
}
