/**
 * Train UI (SPEC §7, PLAN Phase 6): the Buy Train dialog (loco list, car picker, tap-the-map
 * orders editor), the per-train management panel (status/orders/consist/sell), and the train list.
 * Bodies scroll and the action row stays pinned as `openPanel`'s `footer` (see src/ui/panel.ts),
 * a real flex sibling outside the scrollport, so everything still fits an 800×360 view.
 */
import { CARGO, CARGO_TYPES, type CargoType } from "../data/cargo";
import {
  locomotiveById,
  locomotivesAvailableIn,
  NEW_LOCOMOTIVE_BADGE_YEARS,
  STEAM_PHASE_OUT_YEAR,
  type LocomotiveDef,
} from "../data/trains";
import {
  buyTrain,
  computeBuyTrainPlan,
  computeReplaceLocoPlan,
  computeSellTrainPlan,
  replaceLocomotive,
  sellTrain,
  setOrders,
} from "../sim/commands";
import type { GameState } from "../sim/state";
import { calendarFromTicks } from "../sim/time";
import { getTrainRuntime, isElectrificationOnlyBlocker } from "../sim/trains";
import type { LoadingRule, Train, TrainCar, TrainOrder } from "../sim/trains/types";
import { chipTextColor, row } from "./infoPanels";
import { h } from "./h";
import { closePanel, openPanel } from "./panel";
import { strings } from "./strings";
import { formatMoney } from "./format";
import { showToast } from "./toast";

const LOADING_RULES: readonly LoadingRule[] = ["auto", "fullLoad", "unloadOnly", "passThrough"];

function currentYear(state: GameState): number {
  return calendarFromTicks(state.startYear, state.ticks).year;
}

/** SPEC §7.3: "clear reason in the UI: 'Route not electrified'" — checked only when the train is
 * actually stuck with no route and its locomotive is electric; a route that fails for any other
 * reason (a genuinely disconnected network, a wooden bridge too weak for it) falls back to the
 * plain "No route ⚠" status text instead. */
function electrifiedRouteBlocked(state: GameState, train: Train, loco: LocomotiveDef): boolean {
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

/** A car chip showing its current load (SPEC §10.2's "current load" in the train panel) — solid
 * cargo color when loaded, dimmed and labeled "Empty" otherwise. */
function carChip(car: TrainCar): HTMLElement {
  const def = CARGO[car.cargoType];
  const label = car.loaded ? def.name : `${strings.trains.empty} (${def.name})`;
  return h(
    "span",
    {
      className: `chip${car.loaded ? "" : " chip-dim"}`,
      style: { background: def.color, color: chipTextColor(def.color) },
    },
    label,
  );
}

export interface BuyTrainHandlers {
  /** Puts the map into "tap a station to add it as a stop" mode; `onPicked` fires once, with the
   * tapped station's id, then picking mode ends on its own. */
  pickStationOnMap: (onPicked: (stationId: number) => void) => void;
  /** Cancels an active `pickStationOnMap` early (toggled off, or the panel closed). */
  cancelPickStationOnMap: () => void;
  onBought?: (trainId: number) => void;
}

/** Opens the "Buy Train" dialog for a station already confirmed to have an Engine Shed. */
export function openBuyTrainPanel(
  container: HTMLElement,
  state: GameState,
  stationId: number,
  handlers: BuyTrainHandlers,
): void {
  const year = currentYear(state);
  const available = locomotivesAvailableIn(year);
  let selectedLoco: LocomotiveDef | undefined = available[available.length - 1];
  let cars: CargoType[] = [];
  const orders: TrainOrder[] = [];
  let picking = false;

  const locoListEl = h("div", { className: "train-loco-list" });
  const carPickerEl = h("div", { className: "train-car-picker" });
  const carListEl = h("div", { className: "train-car-list" });
  const ordersListEl = h("div", { className: "train-orders-list" });
  const pickBtn = h("button", { className: "train-pick-station-btn" });
  const buyBtn = h("button", { className: "panel-action-build" });
  const cancelBtn = h(
    "button",
    {
      className: "panel-action-cancel",
      "aria-label": strings.ui.close,
      onClick: () => closePanel(),
    },
    strings.station.cancel,
  );

  function stationName(id: number): string {
    return state.stations.find((s) => s.id === id)?.name ?? "?";
  }

  function render(): void {
    locoListEl.replaceChildren(
      ...available.map((loco) =>
        h(
          "button",
          {
            className: `train-loco-btn${selectedLoco?.id === loco.id ? " active" : ""}`,
            onClick: () => {
              selectedLoco = loco;
              if (loco.passengerMailOnly)
                cars = cars.filter((c) => c === "passengers" || c === "mail");
              if (cars.length > loco.maxCars) cars = cars.slice(0, loco.maxCars);
              render();
            },
          },
          h(
            "span",
            { className: "train-loco-name" },
            `${loco.name} (${strings.trains.locoTypes[loco.type]})`,
            loco.introYear + NEW_LOCOMOTIVE_BADGE_YEARS >= year &&
              h("span", { className: "train-loco-new-badge" }, strings.trains.newBadge),
          ),
          h(
            "span",
            { className: "train-loco-stats" },
            `${loco.maxSpeedKmh} km/h · ${loco.maxCars} cars · ${formatMoney(loco.cost)}`,
          ),
        ),
      ),
    );

    const loco = selectedLoco;
    carPickerEl.replaceChildren(
      ...CARGO_TYPES.filter(
        (c) =>
          CARGO[c].era <= year && (!loco?.passengerMailOnly || c === "passengers" || c === "mail"),
      ).map((c) =>
        h(
          "button",
          {
            className: "train-car-add-btn",
            disabled: !loco || cars.length >= loco.maxCars,
            style: { background: CARGO[c].color },
            onClick: () => {
              cars.push(c);
              render();
            },
          },
          CARGO[c].name,
        ),
      ),
    );
    carListEl.replaceChildren(
      ...cars.map((c, i) =>
        h(
          "button",
          {
            className: "train-car-chip",
            style: { background: CARGO[c].color },
            onClick: () => {
              cars.splice(i, 1);
              render();
            },
          },
          `${CARGO[c].name} ✕`,
        ),
      ),
    );

    ordersListEl.replaceChildren(
      ...orders.map((o, i) =>
        h(
          "div",
          { className: "train-order-row" },
          h("span", { className: "train-order-label" }, `${i + 1}. ${stationName(o.stationId)}`),
          h(
            "button",
            {
              className: "train-order-rule-btn",
              onClick: () => {
                const idx = LOADING_RULES.indexOf(o.rule);
                o.rule = LOADING_RULES[(idx + 1) % LOADING_RULES.length] as LoadingRule;
                render();
              },
            },
            strings.trains.loadingRules[o.rule],
          ),
          h(
            "button",
            {
              className: "train-order-remove-btn",
              "aria-label": strings.ui.close,
              onClick: () => {
                orders.splice(i, 1);
                render();
              },
            },
            "✕",
          ),
        ),
      ),
    );
    pickBtn.textContent = picking ? strings.trains.tapAStation : strings.trains.addStop;
    pickBtn.classList.toggle("active", picking);
    pickBtn.disabled = orders.length >= 8;

    const plan = selectedLoco
      ? computeBuyTrainPlan(state, selectedLoco.id, cars)
      : { cost: 0, valid: false };
    const affordable = plan.cost <= state.cash;
    const ordersOk = orders.length >= 2 && orders.length <= 8;
    buyBtn.textContent = `${strings.trains.buy} (${formatMoney(plan.cost)})`;
    buyBtn.disabled = !plan.valid || !affordable || !ordersOk;
  }

  pickBtn.addEventListener("click", () => {
    if (picking) {
      picking = false;
      handlers.cancelPickStationOnMap();
      render();
      return;
    }
    picking = true;
    render();
    handlers.pickStationOnMap((pickedStationId) => {
      picking = false;
      if (orders.length < 8) orders.push({ stationId: pickedStationId, rule: "auto" });
      render();
    });
  });

  buyBtn.addEventListener("click", () => {
    if (!selectedLoco) return;
    const bought = buyTrain(state, stationId, selectedLoco.id, cars);
    if (!bought.ok) {
      showToast(container, strings.build.reasons[bought.reason], "warn");
      return;
    }
    const train = state.trains[state.trains.length - 1];
    if (train) {
      const result = setOrders(state, train.id, orders);
      if (!result.ok) showToast(container, strings.build.reasons[result.reason], "warn");
      handlers.onBought?.(train.id);
    }
    closePanel();
  });

  openPanel(container, {
    title: strings.trains.buyTitle,
    body: [
      h("div", { className: "panel-section-title" }, strings.trains.locomotive),
      locoListEl,
      h("div", { className: "panel-section-title" }, strings.trains.cars),
      carPickerEl,
      carListEl,
      h("div", { className: "panel-section-title" }, strings.trains.orders),
      ordersListEl,
      pickBtn,
    ],
    footer: [buyBtn, cancelBtn],
    onClose: () => {
      picking = false;
      handlers.cancelPickStationOnMap();
    },
  });

  render();
}

/** Opens the management panel for an existing train: status, consist, orders, sell. */
export function openTrainPanel(container: HTMLElement, state: GameState, trainId: number): void {
  const render = (): void => {
    const train = state.trains.find((t) => t.id === trainId);
    if (!train) return;
    const loco = locomotiveById(train.locoModelId);

    const body: Node[] = [
      row(strings.trains.status, strings.trains.statusNames[train.status]),
      ...(loco && electrifiedRouteBlocked(state, train, loco)
        ? [
            h(
              "div",
              { className: "panel-row train-route-warning" },
              strings.trains.routeNotElectrified,
            ),
          ]
        : []),
      row(strings.trains.locomotive, loco?.name ?? "?"),
      row(strings.trains.speed, `${Math.round(train.speed)} km/h`),
      h("div", { className: "panel-section-title" }, strings.trains.consist),
      h(
        "div",
        { className: "panel-row", style: { flexWrap: "wrap" } },
        ...(train.cars.length > 0 ? train.cars.map((c) => carChip(c)) : ["—"]),
      ),
      h("div", { className: "panel-section-title" }, strings.trains.orders),
      ...(train.orders.length > 0
        ? train.orders.map((o, i) =>
            row(
              `${i + 1}.`,
              `${state.stations.find((s) => s.id === o.stationId)?.name ?? "?"} (${strings.trains.loadingRules[o.rule]})`,
            ),
          )
        : [h("div", { className: "panel-row" }, "—")]),
    ];

    const sellPlan = computeSellTrainPlan(state, trainId);
    const sellBtn = h(
      "button",
      {
        className: "panel-action-build train-sell-btn",
        onClick: () => {
          const result = sellTrain(state, trainId);
          if (!result.ok) {
            showToast(container, strings.build.reasons[result.reason], "warn");
            return;
          }
          closePanel();
        },
      },
      `${strings.trains.sell} (+${formatMoney(sellPlan.refund)})`,
    );
    const replaceBtn = h(
      "button",
      {
        className: "panel-action-cancel train-replace-btn",
        onClick: () => openReplaceLocoPanel(container, state, trainId),
      },
      strings.trains.replace,
    );

    openPanel(container, { title: train.name, body, footer: [replaceBtn, sellBtn] });
  };

  render();
}

/** Opens the locomotive picker for `trainId`'s "Replace Locomotive" action (SPEC §7.6: pay the new
 * loco's price minus a trade-in credit for the old one, keep cars and orders). Tapping a model
 * replaces immediately (no separate confirm bar, matching the Station upgrade button's flow). */
function openReplaceLocoPanel(container: HTMLElement, state: GameState, trainId: number): void {
  const year = currentYear(state);
  const available = locomotivesAvailableIn(year).filter(
    (l) => l.type !== "steam" || year <= STEAM_PHASE_OUT_YEAR,
  );

  const list = h("div", { className: "train-loco-list" });
  list.replaceChildren(
    ...available.map((loco) => {
      const plan = computeReplaceLocoPlan(state, trainId, loco.id);
      const btn = h(
        "button",
        {
          className: "train-loco-btn",
          disabled: !plan.valid || plan.netCost > state.cash,
          onClick: () => {
            const result = replaceLocomotive(state, trainId, loco.id);
            if (!result.ok) {
              showToast(container, strings.build.reasons[result.reason], "warn");
              return;
            }
            openTrainPanel(container, state, trainId);
          },
        },
        h(
          "span",
          { className: "train-loco-name" },
          `${loco.name} (${strings.trains.locoTypes[loco.type]})`,
          loco.introYear + NEW_LOCOMOTIVE_BADGE_YEARS >= year &&
            h("span", { className: "train-loco-new-badge" }, strings.trains.newBadge),
        ),
        h(
          "span",
          { className: "train-loco-stats" },
          plan.valid
            ? `${formatMoney(plan.netCost)} (${strings.trains.tradeInCredit} ${formatMoney(plan.tradeInValue)})`
            : "—",
        ),
      );
      return btn;
    }),
  );

  const cancelBtn = h(
    "button",
    {
      className: "panel-action-cancel",
      "aria-label": strings.ui.close,
      onClick: () => openTrainPanel(container, state, trainId),
    },
    strings.station.cancel,
  );

  openPanel(container, {
    title: strings.trains.replaceTitle,
    body: [list],
    footer: [cancelBtn],
  });
}

/** Opens the train list; tapping a row focuses the camera on that train (via `onFocus`) and opens
 * its management panel. */
export function openTrainListPanel(
  container: HTMLElement,
  state: GameState,
  onFocus: (trainId: number) => void,
): void {
  const body: Node[] =
    state.trains.length === 0
      ? [h("div", { className: "panel-row" }, strings.trains.none)]
      : state.trains.map((t) =>
          h(
            "button",
            {
              className: "train-list-row",
              onClick: () => {
                onFocus(t.id);
                openTrainPanel(container, state, t.id);
              },
            },
            h("span", null, t.name),
            h("span", { className: "train-list-status" }, strings.trains.statusNames[t.status]),
          ),
        );

  openPanel(container, { title: strings.trains.listTitle, body });
}
