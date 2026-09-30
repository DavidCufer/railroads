/**
 * Repair crews (Phase 26A). A breakdown stops the train where it is; a crew is dispatched from the
 * nearest station with an Engine Shed (or, if none, a slow crew from the nearest station) and drives
 * along the track to it. Repair time = dispatch + travel + fix. The crew is data on the train
 * (`train.repairCrew`), not a simulated vehicle: it reserves no blocks, so it can never deadlock;
 * the renderer draws it from `repairCrewPosition`.
 */
import {
  REPAIR_CREW_DISPATCH_DAYS,
  REPAIR_CREW_FAR_DISPATCH_DAYS,
  REPAIR_CREW_FAR_SPEED_MULT,
  REPAIR_CREW_MAX_TRAVEL_DAYS,
  REPAIR_CREW_VEHICLES,
  locomotiveById,
} from "../../data/trains";
import type { GameState } from "../state";
import { calendarFromTicks, HOURS_PER_DAY } from "../time";
import { findTrainRoute } from "./route";
import type { Train } from "./types";

export interface RepairCrew {
  /** Station the crew left from. */
  fromStationId: number;
  /** No Engine Shed anywhere: slow crew from the nearest station. */
  far: boolean;
  startTick: number;
  /** Ticks waiting at the base before leaving. */
  dispatchTicks: number;
  travelTicks: number;
  fixTicks: number;
  /** Tile nodes from the base to the train (both ends), for drawing. */
  path: number[];
  /** What the call-out cost (Economic model v2); absent in older saves. */
  cost?: { crewDays: number; wages: number; vehicle: number; parts: number; total: number };
}

export type RepairPhase =
  | { phase: "arriving"; stationId: number; daysLeft: number; far: boolean }
  | { phase: "repairing"; daysLeft: number };

export function crewVehicle(year: number): (typeof REPAIR_CREW_VEHICLES)[number] {
  let best: (typeof REPAIR_CREW_VEHICLES)[number] = REPAIR_CREW_VEHICLES[0];
  for (const v of REPAIR_CREW_VEHICLES) if (year >= v.fromYear) best = v;
  return best;
}

function trainNode(train: Train): number {
  return train.route[train.routeIndex] ?? train.route[0] ?? -1;
}

function pathLengthTiles(mapWidth: number, path: readonly number[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as number;
    const b = path[i] as number;
    total += Math.hypot(
      (a % mapWidth) - (b % mapWidth),
      Math.floor(a / mapWidth) - Math.floor(b / mapWidth),
    );
  }
  return total;
}

/** Plans the crew for a train that has just broken down; `fixDays` is the on-site repair time. */
export function planRepairCrew(state: GameState, train: Train, fixDays: number): RepairCrew | null {
  const node = trainNode(train);
  if (node < 0 || state.stations.length === 0) return null;
  const width = state.map.width;
  const nx = node % width;
  const ny = Math.floor(node / width);
  const dist = (tile: number): number =>
    Math.hypot((tile % width) - nx, Math.floor(tile / width) - ny);

  const sheds = state.stations.filter((s) => s.hasEngineShed);
  const far = sheds.length === 0;
  // No shed anywhere: the crew comes from the company's first station, from far away.
  let base = far
    ? (state.stations[0] as (typeof state.stations)[number])
    : (sheds[0] as (typeof sheds)[number]);
  if (!far) {
    for (const s of sheds) {
      if (dist(s.tile) < dist(base.tile) || (dist(s.tile) === dist(base.tile) && s.id < base.id))
        base = s;
    }
  }

  const loco = locomotiveById(train.locoModelId);
  let path = findTrainRoute(width, state.trackGraph, base.tile, node, {
    weightClass: loco?.weightClass ?? "light",
    electric: false,
    incomingDirection: -1,
    stationTiles: new Set(state.stations.map((s) => s.tile)),
  });
  if (!path) path = [base.tile, node]; // disconnected (e.g. track removed): as the crow flies
  const tiles = pathLengthTiles(width, path);

  const year = calendarFromTicks(state.startYear, state.ticks).year;
  const speed = crewVehicle(year).tilesPerDay * (far ? REPAIR_CREW_FAR_SPEED_MULT : 1);
  const travelDays = Math.min(REPAIR_CREW_MAX_TRAVEL_DAYS, tiles / speed);
  const dispatchDays = far ? REPAIR_CREW_FAR_DISPATCH_DAYS : REPAIR_CREW_DISPATCH_DAYS;
  return {
    fromStationId: base.id,
    far,
    startTick: state.ticks,
    dispatchTicks: Math.round(dispatchDays * HOURS_PER_DAY),
    travelTicks: Math.max(1, Math.round(travelDays * HOURS_PER_DAY)),
    fixTicks: Math.round(fixDays * HOURS_PER_DAY),
    path,
  };
}

export function crewTotalTicks(crew: RepairCrew): number {
  return crew.dispatchTicks + crew.travelTicks + crew.fixTicks;
}

export function repairPhase(state: GameState, train: Train): RepairPhase | null {
  const crew = train.repairCrew;
  if (!crew || train.breakdownTicksLeft <= 0) return null;
  const elapsed = state.ticks - crew.startTick;
  const arriveAt = crew.dispatchTicks + crew.travelTicks;
  if (elapsed < arriveAt) {
    return {
      phase: "arriving",
      stationId: crew.fromStationId,
      daysLeft: Math.max(1, Math.ceil((arriveAt - elapsed) / HOURS_PER_DAY)),
      far: crew.far,
    };
  }
  return {
    phase: "repairing",
    daysLeft: Math.max(1, Math.ceil(train.breakdownTicksLeft / HOURS_PER_DAY)),
  };
}

/** Where the crew is right now, in tile-centre coordinates, or null when it is waiting at its base,
 * has arrived and is working (drawn beside the train by the caller), or there is nothing to draw. */
export function repairCrewPosition(
  mapWidth: number,
  crew: RepairCrew,
  nowTick: number,
): { x: number; y: number; arrived: boolean } | null {
  const elapsed = nowTick - crew.startTick - crew.dispatchTicks;
  const p = crew.path;
  if (p.length === 0) return null;
  const at = (i: number): { x: number; y: number } => ({
    x: ((p[i] as number) % mapWidth) + 0.5,
    y: Math.floor((p[i] as number) / mapWidth) + 0.5,
  });
  if (elapsed <= 0) return { ...at(0), arrived: false };
  if (elapsed >= crew.travelTicks || p.length === 1) return { ...at(p.length - 1), arrived: true };
  // Walk the path by distance.
  const total = pathLengthTiles(mapWidth, p);
  let remaining = (elapsed / crew.travelTicks) * total;
  for (let i = 1; i < p.length; i++) {
    const a = at(i - 1);
    const b = at(i);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= len || i === p.length - 1) {
      const t = len === 0 ? 1 : Math.min(1, remaining / len);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, arrived: false };
    }
    remaining -= len;
  }
  return { ...at(p.length - 1), arrived: true };
}

/** Length of the crew's route in tiles (drives the call-out cost). */
export function crewDistanceTiles(mapWidth: number, crew: RepairCrew): number {
  return pathLengthTiles(mapWidth, crew.path);
}
