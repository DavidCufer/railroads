/**
 * Phase 89 (exploration, dev flag): what the station and train panels say under a prototype passenger model. A pure read of the
 * state: the numbers are the ones the simulation uses (`passengerRoutes`, the carried counters), nothing is estimated for the screen
 * except "another train adds about N", the lesser of the pair's missing demand and one train's trips.
 */
import { PAX, PAX_HOLD_DAYS } from "../data/passengerModels";
import type { GameState } from "../sim/state";
import { carriedLastMonth } from "../sim/stations/paxModels";
import { serviceRates, serviceKey } from "../sim/stations/waiting";
import { estimateRoundTripDays } from "../sim/trains/headway";
import { carCapacity } from "../sim/trains/capacity";
import type { Train } from "../sim/trains/types";
import { h } from "./h";
import { strings } from "./strings";

export interface PaxRowView {
  name: string;
  destination: number;
  demand: number;
  carried: number;
  ceiling: number;
  perWeek: number;
}

export interface PaxStationView {
  model: "route" | "service" | "ticket";
  rows: PaxRowView[];
  budget: number;
}

const r = (n: number): number => Math.max(0, Math.round(n));

export function paxStationView(state: GameState, stationId: number): PaxStationView | undefined {
  if (PAX.model === "today") return undefined;
  const eco = state.stationEconomy.get(stationId);
  if (!eco?.passengerRoutes || eco.passengerRoutes.length === 0) return undefined;
  const rates = serviceRates(state);
  const rows = [...eco.passengerRoutes]
    .sort((a, b) => b.perMonth - a.perMonth || a.cityId - b.cityId)
    .map((route) => ({
      name: state.cities.find((c) => c.id === route.cityId)?.name ?? "?",
      destination: route.destination,
      demand: route.perMonth,
      carried: carriedLastMonth(state, stationId, route.destination),
      ceiling: route.ceiling ?? route.perMonth,
      perWeek: 7 * (rates.get(serviceKey(stationId, route.destination)) ?? 0),
    }));
  return {
    model: PAX.model,
    rows,
    budget: rows.reduce((s, row) => s + row.demand, 0),
  };
}

function bar(fraction: number): HTMLElement {
  return h(
    "span",
    { className: "dest-bar-track" },
    h("span", {
      className: "dest-bar-fill",
      style: { width: `${Math.max(0, Math.min(1, fraction)) * 100}%` },
    }),
  );
}

/** The station panel's block under the passenger chip. */
export function renderPaxStation(view: PaxStationView): HTMLElement {
  const t = strings.paxModel;
  const title =
    view.model === "route"
      ? t.routeTitle
      : view.model === "service"
        ? t.serviceTitle
        : t.ticketTitle(r(view.budget));
  const rows = view.rows.slice(0, 4).map((row) => {
    const text =
      view.model === "route"
        ? t.routeRow(r(row.carried), r(row.demand))
        : view.model === "service"
          ? t.serviceRow(r(row.demand), r(row.ceiling))
          : t.ticketRow(
              r(row.demand),
              r((100 * row.demand) / Math.max(1, view.budget)),
              r(row.carried),
            );
    const fraction =
      view.model === "service"
        ? row.demand / Math.max(1, row.ceiling)
        : row.carried / Math.max(1, row.demand);
    return h(
      "div",
      { className: "dest-row", "data-testid": "pax-row" },
      h(
        "div",
        { className: "dest-row-head" },
        h("span", { className: "dest-name" }, row.name),
        h("span", { className: "dest-count" }, text),
      ),
      bar(fraction),
      view.model === "service"
        ? h("div", { className: "hint" }, t.serviceLevel(row.perWeek.toFixed(1)))
        : null,
    );
  });
  return h(
    "div",
    { className: "pax-model-block", "data-testid": "pax-model" },
    h("div", { className: "panel-row hint" }, `${t.names[view.model]} · ${title}`),
    ...rows,
    h(
      "div",
      { className: "hint" },
      view.model === "ticket" ? t.ticketHint : t.holds(PAX_HOLD_DAYS),
    ),
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

/** The train panel's block: for the train's first two stops, the pair's demand, what is carried and what another train adds. */
export function renderPaxTrain(state: GameState, train: Train): HTMLElement | null {
  if (PAX.model === "today") return null;
  if (!train.cars.some((c) => c.cargoType === "passengers")) return null;
  const stops = [...new Set(train.orders.map((o) => o.stationId))];
  if (stops.length < 2) return null;
  const t = strings.paxModel;
  const name = (id: number): string => state.stations.find((s) => s.id === id)?.name ?? "?";
  const rows: HTMLElement[] = [];
  for (let i = 0; i + 1 < stops.length && rows.length < 2; i++) {
    const a = stops[i] as number;
    const b = stops[i + 1] as number;
    const go = state.stationEconomy.get(a)?.passengerRoutes?.find((x) => x.destination === b);
    const back = state.stationEconomy.get(b)?.passengerRoutes?.find((x) => x.destination === a);
    const demand = (go?.perMonth ?? 0) + (back?.perMonth ?? 0);
    const carried = carriedLastMonth(state, a, b) + carriedLastMonth(state, b, a);
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
        { className: "dest-row", "data-testid": "pax-pair" },
        h(
          "div",
          { className: "dest-row-head" },
          h("span", { className: "dest-name" }, t.pairRow(name(a), name(b), r(carried), r(demand))),
        ),
        bar(carried / Math.max(1, demand)),
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
    { className: "pax-model-block", "data-testid": "pax-train" },
    h("div", { className: "panel-row hint" }, `${t.names[PAX.model]} · ${t.pairTitle}`),
    ...rows,
  );
}
