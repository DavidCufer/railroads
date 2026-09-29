/** Train status text and icons for the train panel, list rows and station rows (SPEC §7.3, §7.5). */
import { CARGO } from "../../data/cargo";
import type { LocomotiveDef } from "../../data/trains";
import type { GameState } from "../../sim/state";
import { getTrainRuntime, isElectrificationOnlyBlocker } from "../../sim/trains";
import type { Train } from "../../sim/trains/types";
import type { IconName } from "../icons";
import { formatSpeed, loadSettings } from "../settings";
import { strings } from "../strings";

/** SPEC §7.3: "clear reason in the UI: 'Route not electrified'" — checked only when the train is
 * actually stuck with no route and its locomotive is electric. */
export function electrifiedRouteBlocked(
  state: GameState,
  train: Train,
  loco: LocomotiveDef,
): boolean {
  if (train.status !== "noRoute" || loco.type !== "electric") return false;
  const order = train.orders[train.currentOrderIndex];
  const targetStation = order && state.stations.find((s) => s.id === order.stationId);
  if (!targetStation) return false;
  const runtime = getTrainRuntime(state);
  const start = train.route[train.routeIndex];
  if (start === undefined) return false;
  return isElectrificationOnlyBlocker(
    state.map.width,
    state.trackGraph,
    start,
    targetStation.tile,
    {
      weightClass: loco.weightClass,
      electric: true,
      incomingDirection: train.direction,
      stationTiles: runtime.stationTiles,
      blockPenalties: train.blockPenalties,
      edgeToBlock: runtime.partition.edgeToBlock,
    },
  );
}

/** SPEC §7.5: "the train panel says what they are waiting for" — names the station a waiting train
 * is trying to reach next, falling back to the plain status label when there is nothing to name. */
export function statusText(state: GameState, train: Train): string {
  const waiting =
    train.status === "waitingForBlock" ||
    train.status === "waitingForStation" ||
    (train.status === "stuck" && train.waitingOn !== undefined);
  if (waiting && train.waitingOn) {
    const w = train.waitingOn;
    const stationName = state.stations.find((s) => s.id === w.stationId)?.name;
    const names = w.trainIds
      .map((id) => state.trains.find((t) => t.id === id)?.name)
      .filter((n): n is string => n !== undefined);
    const who = names.length > 3 ? `${names.slice(0, 3).join(", ")}…` : names.join(", ");
    if (stationName && who) {
      return w.kind === "line"
        ? strings.trains.waitingForTrainOnLine(who, stationName)
        : strings.trains.waitingForTrainAtPlatform(stationName, who);
    }
  }
  const order = train.orders[train.currentOrderIndex];
  if (train.status === "noRoute" && order) {
    const name = state.stations.find((s) => s.id === order.stationId)?.name;
    if (name) return strings.trains.noRouteTo(name);
  }
  const targetName =
    train.waitingForStationId !== undefined
      ? state.stations.find((s) => s.id === train.waitingForStationId)?.name
      : undefined;
  if (targetName && train.status === "waitingForBlock") {
    return strings.trains.waitingForLineClear(targetName);
  }
  if (targetName && train.status === "waitingForStation") {
    return strings.trains.waitingForPlatform(targetName);
  }
  return strings.trains.statusNames[train.status];
}

export type StatusTone = "go" | "signal" | "muted" | "brass";

export interface StatusLine {
  icon: IconName;
  tone: StatusTone;
  text: string;
}

/** Average fill of the consist, 0..1 (0 with no cars). */
export function consistFill(train: Train): number {
  if (train.cars.length === 0) return 0;
  const sum = train.cars.reduce(
    (acc, c) => acc + Math.min(1, c.loadedUnits / CARGO[c.cargoType].capacity),
    0,
  );
  return sum / train.cars.length;
}

/** One line for the hero strip: icon + what the train is doing right now (STYLE §11.2). */
export function statusLine(state: GameState, train: Train): StatusLine {
  const stationName = (id: number | undefined): string | undefined =>
    id === undefined ? undefined : state.stations.find((s) => s.id === id)?.name;
  const order = train.orders[train.currentOrderIndex];
  switch (train.status) {
    case "moving": {
      const name = stationName(order?.stationId);
      const speed = formatSpeed(train.speed, loadSettings().units);
      return {
        icon: "trains",
        tone: "go",
        text: name ? strings.trains.panel.headingTo(name, speed) : speed,
      };
    }
    case "loading": {
      if (train.orders.length === 0) {
        return { icon: "info", tone: "muted", text: strings.trains.panel.noOrders };
      }
      const name = stationName(order?.stationId);
      const pct = Math.round(consistFill(train) * 100);
      const text =
        train.cars.length > 0 && pct > 0
          ? `${strings.trains.panel.loadingPct(pct)}${name ? ` · ${name}` : ""}`
          : name
            ? strings.trains.panel.atStation(name)
            : strings.trains.statusNames.loading;
      return { icon: "cargo", tone: "brass", text };
    }
    case "waitingForBlock":
    case "waitingForStation":
      return { icon: "signal", tone: "signal", text: statusText(state, train) };
    case "broken":
      return { icon: "wrench", tone: "signal", text: statusText(state, train) };
    default:
      return { icon: "warning", tone: "signal", text: statusText(state, train) };
  }
}
