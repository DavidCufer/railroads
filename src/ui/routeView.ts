/**
 * What the station and train panels say about route demand (Phase 90, SPEC 9.5d): for each route its people a month ("Y"), how
 * many of them boarded over about the last month ("X", never shown above Y), and what another train would add. A pure read of the
 * state: the numbers are the ones the simulation uses (`passengerRoutes`, `routeCarried`); only "another train adds about N"
 * is worked out for the screen, the lesser of the route's missing people and one more train's trips.
 */
import type { GameState } from "../sim/state";
import { carriedLastMonth } from "../sim/stations/routeCarried";
import { estimateRoundTripDays } from "../sim/trains/headway";
import { carCapacity } from "../sim/trains/capacity";
import type { Train } from "../sim/trains/types";
import { MAX_WAIT_DAYS } from "../data/economy";
import { h } from "./h";
import { strings } from "./strings";

export interface RouteRowView {
  name: string;
  destination: number;
  /** People a month the route sends. */
  demand: number;
  /** Boarded over about the last month, never above `demand`. */
  carried: number;
}

export interface RouteStationView {
  rows: RouteRowView[];
}

const r = (n: number): number => Math.max(0, Math.round(n));

/** The routes of a station, biggest first; undefined while no passenger train calls there. */
export function routeStationView(
  state: GameState,
  stationId: number,
): RouteStationView | undefined {
  const eco = state.stationEconomy.get(stationId);
  if (!eco?.passengerRoutes || eco.passengerRoutes.length === 0) return undefined;
  const rows = [...eco.passengerRoutes]
    .sort((a, b) => b.perMonth - a.perMonth || a.cityId - b.cityId)
    .map((route) => ({
      name: state.cities.find((c) => c.id === route.cityId)?.name ?? "?",
      destination: route.destination,
      demand: route.perMonth,
      carried: Math.min(route.perMonth, carriedLastMonth(state, stationId, route.destination)),
    }));
  return { rows };
}

export function routeBar(fraction: number): HTMLElement {
  return h(
    "span",
    { className: "dest-bar-track" },
    h("span", {
      className: "dest-bar-fill",
      style: { width: `${Math.max(0, Math.min(1, fraction)) * 100}%` },
    }),
  );
}

/** One route row: "Venice   carried 43 of 43" and a bar. */
export function routeRow(row: RouteRowView): HTMLElement {
  return h(
    "div",
    { className: "dest-row", "data-testid": "route-row" },
    h(
      "div",
      { className: "dest-row-head" },
      h("span", { className: "dest-name" }, row.name),
      h("span", { className: "dest-count" }, strings.routes.row(r(row.carried), r(row.demand))),
    ),
    routeBar(row.carried / Math.max(1, row.demand)),
  );
}

/** The station panel's block under the passenger chip. */
export function renderRouteStation(view: RouteStationView): HTMLElement {
  const t = strings.routes;
  return h(
    "div",
    { className: "route-block", "data-testid": "route-block" },
    h("div", { className: "panel-row hint" }, t.title),
    ...view.rows.slice(0, 4).map(routeRow),
    view.rows.length > 4
      ? h("div", { className: "hint" }, strings.station.reachMore(view.rows.length - 4))
      : null,
    h("div", { className: "hint" }, t.holds(MAX_WAIT_DAYS)),
  );
}

/** Passenger trains whose orders call at both stations. */
function trainsOnPair(state: GameState, a: number, b: number): Train[] {
  return state.trains.filter(
    (t) =>
      !t.laidUp &&
      t.cars.some((c) => c.cargoType === "passengers") &&
      t.orders.some((o) => o.stationId === a) &&
      t.orders.some((o) => o.stationId === b),
  );
}

/** The train panel's block: for the train's first two route legs, the pair's demand, what is carried and what another train adds. */
export function renderRouteTrain(state: GameState, train: Train): HTMLElement | null {
  if (!train.cars.some((c) => c.cargoType === "passengers")) return null;
  const stops = [...new Set(train.orders.map((o) => o.stationId))];
  if (stops.length < 2) return null;
  const t = strings.routes;
  const town = (id: number): string => {
    const cityId = state.stationEconomy.get(id)?.passengerTownId;
    return state.cities.find((c) => c.id === cityId)?.name ?? "?";
  };
  const rows: HTMLElement[] = [];
  for (let i = 0; i + 1 < stops.length && rows.length < 2; i++) {
    const a = stops[i] as number;
    const b = stops[i + 1] as number;
    const go = state.stationEconomy.get(a)?.passengerRoutes?.find((x) => x.destination === b);
    const back = state.stationEconomy.get(b)?.passengerRoutes?.find((x) => x.destination === a);
    const demand = (go?.perMonth ?? 0) + (back?.perMonth ?? 0);
    const carried = Math.min(demand, carriedLastMonth(state, a, b) + carriedLastMonth(state, b, a));
    const n = trainsOnPair(state, a, b).length;
    // one more train: its trips a month x seats, within what is still missing
    const seats = train.cars.reduce(
      (s, c) => s + (c.cargoType === "passengers" ? carCapacity(c) : 0),
      0,
    );
    const rt = Math.max(2, estimateRoundTripDays(state, train));
    const oneTrain = (30 / rt) * 2 * seats;
    const more = Math.min(oneTrain, Math.max(0, demand - carried));
    rows.push(
      h(
        "div",
        { className: "dest-row", "data-testid": "route-pair" },
        h(
          "div",
          { className: "dest-row-head" },
          h("span", { className: "dest-name" }, t.pairRow(town(a), town(b), r(carried), r(demand))),
        ),
        routeBar(carried / Math.max(1, demand)),
        h(
          "div",
          { className: "hint" },
          `${t.pairTrains(n)} · ${more < 2 ? t.full : t.pairMore(r(more))}`,
        ),
      ),
    );
  }
  if (rows.length === 0) return null;
  return h(
    "div",
    { className: "route-block", "data-testid": "route-train" },
    h("div", { className: "panel-row hint" }, t.pairTitle),
    ...rows,
  );
}
