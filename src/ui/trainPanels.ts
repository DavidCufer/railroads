/**
 * Train UI (SPEC §7, PLAN Phase 6): the Buy Train dialog (loco list, car picker, tap-the-map
 * orders editor), the per-train management panel (status/orders/consist/sell), and the train list.
 * Bodies scroll and the action row stays pinned as `openPanel`'s `footer` (see src/ui/panel.ts),
 * a real flex sibling outside the scrollport, so everything still fits an 800×360 view.
 */
import { CARGO, CARGO_TYPES, type CargoType } from "../data/cargo";
import {
  buyableLocomotivesIn,
  locomotiveById,
  NEW_LOCOMOTIVE_BADGE_YEARS,
  type LocomotiveDef,
} from "../data/trains";
import {
  buyTrain,
  computeBuyTrainPlan,
  computeEditConsistPlan,
  computeReplaceLocoPlan,
  computeSellTrainPlan,
  editConsist,
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
import { icon } from "./icons";
import { closePanel, openPanel } from "./panel";
import { strings } from "./strings";
import { formatMoney } from "./format";
import { showToast } from "./toast";
import { playSound } from "./sound";
import { formatSpeed, loadSettings } from "./settings";

const LOADING_RULES: readonly LoadingRule[] = ["auto", "fullLoad", "unloadOnly", "passThrough"];

function currentYear(state: GameState): number {
  return calendarFromTicks(state.startYear, state.ticks).year;
}

/** Buy Train/Edit Consist car-picker button label (PLAN Phase 16: "show capacity per car type",
 * e.g. "Passenger car · 40 seats") — passengers get "seats" specifically (an exception to the
 * general `CargoDef.unit`, which is "" for passengers so the general "N passengers" phrasing reads
 * naturally elsewhere without a redundant unit word). */
function carTypeLabel(cargo: CargoType): string {
  const def = CARGO[cargo];
  const capacity = cargo === "passengers" ? `${def.capacity} seats` : `${def.capacity} ${def.unit}`;
  return `${def.carLabel} · ${capacity}`;
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

/** SPEC §7.5: "the train panel says what they are waiting for" — names the station a
 * `waitingForBlock`/`waitingForStation` train is trying to reach next, falling back to the plain
 * status label when there's nothing to name (e.g. a target station just got bulldozed). */
function statusText(state: GameState, train: Train): string {
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

/** A car chip showing its current load (SPEC §10.2's "current load" in the train panel, PLAN Phase
 * 16: "each car shows cargo + fill... a small fill bar per car") — solid cargo color, "Empty" only
 * when truly empty, otherwise the fill as "Passengers 28 / 40"/"Coal 20 / 20 t" plus a thin bar. */
function carChip(car: TrainCar): HTMLElement {
  const def = CARGO[car.cargoType];
  const loaded = car.loadedUnits > 0;
  const label = loaded
    ? `${def.name} ${Math.round(car.loadedUnits)} / ${def.capacity}${def.unit ? ` ${def.unit}` : ""}`
    : `${strings.trains.empty} (${def.name})`;
  const pct = Math.max(0, Math.min(100, (car.loadedUnits / def.capacity) * 100));
  return h(
    "div",
    { className: "supply-chip-stack" },
    h(
      "span",
      {
        className: `chip${loaded ? "" : " chip-dim"}`,
        style: { background: def.color, color: chipTextColor(def.color) },
      },
      label,
    ),
    h(
      "div",
      { className: "cargo-bar-track mini" },
      h("div", {
        className: "cargo-bar-fill",
        style: { width: `${pct}%`, background: "var(--brass)" },
      }),
    ),
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
  const available = buyableLocomotivesIn(year);
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
    icon("close"),
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
            `${formatSpeed(loco.maxSpeedKmh, loadSettings().units)} · ${loco.maxCars} cars · ${formatMoney(loco.cost)}`,
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
          carTypeLabel(c),
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
          CARGO[c].name,
          icon("close", "icon-sm"),
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
            icon("close", "icon-sm"),
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
    playSound("whistle");
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

    const isProblemStatus =
      train.status === "noRoute" || train.status === "stuck" || train.status === "broken";
    const isWaiting = train.status === "waitingForBlock" || train.status === "waitingForStation";
    const body: Node[] = [
      h(
        "div",
        { className: "panel-row" },
        h("span", { className: "label" }, strings.trains.status),
        h(
          "span",
          { className: isProblemStatus ? "train-route-warning" : isWaiting ? "train-waiting" : "" },
          isProblemStatus ? icon("warning", "icon-sm") : null,
          isWaiting ? icon("signal", "icon-sm") : null,
          statusText(state, train),
        ),
      ),
      ...(loco && electrifiedRouteBlocked(state, train, loco)
        ? [
            h(
              "div",
              { className: "panel-row train-route-warning" },
              icon("warning", "icon-sm"),
              strings.trains.routeNotElectrified,
            ),
          ]
        : []),
      row(strings.trains.locomotive, loco?.name ?? "?"),
      row(strings.trains.speed, formatSpeed(train.speed, loadSettings().units)),
      h("div", { className: "panel-section-title" }, strings.trains.consist),
      h(
        "div",
        { className: "panel-row", style: { flexWrap: "wrap" } },
        ...(train.cars.length > 0 ? train.cars.map((c) => carChip(c)) : ["—"]),
      ),
      ...(train.pendingConsist
        ? [
            h(
              "div",
              { className: "panel-row train-consist-pending" },
              strings.trains.consistChangeQueued,
            ),
          ]
        : []),
      h(
        "div",
        { className: "action-grid" },
        h(
          "button",
          {
            className: "action-btn",
            onClick: () => openEditConsistPanel(container, state, trainId),
          },
          h(
            "span",
            { className: "action-btn-label" },
            icon("edit", "icon-sm"),
            strings.trains.editCars,
          ),
        ),
        h(
          "button",
          {
            className: "action-btn",
            onClick: () => openReplaceLocoPanel(container, state, trainId),
          },
          h(
            "span",
            { className: "action-btn-label" },
            icon("wrench", "icon-sm"),
            strings.trains.replace,
          ),
        ),
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
        className: "btn-danger train-sell-btn",
        onClick: (e: Event) => {
          // Two-tap confirm: selling is irreversible, so the first tap only arms the button.
          const btn = e.currentTarget as HTMLButtonElement;
          if (btn.dataset.armed !== "1") {
            btn.dataset.armed = "1";
            btn.textContent = strings.trains.sellConfirm;
            return;
          }
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

    openPanel(container, { title: train.name, body, footer: [sellBtn] });
  };

  render();
}

/** Opens the "Edit cars" dialog for an existing train (PLAN Phase 15): the same add/remove car
 * picker as the Buy Train dialog, seeded with the train's current consist. Confirming applies
 * immediately if the train is at a station right now, or queues it for the next stop otherwise
 * (`editConsist` in commands.ts decides which). */
function openEditConsistPanel(container: HTMLElement, state: GameState, trainId: number): void {
  const train = state.trains.find((t) => t.id === trainId);
  if (!train) return;
  const loco = locomotiveById(train.locoModelId);
  const year = currentYear(state);
  let cars: CargoType[] = train.cars.map((c) => c.cargoType);

  const carPickerEl = h("div", { className: "train-car-picker" });
  const carListEl = h("div", { className: "train-car-list" });
  const confirmBtn = h("button", { className: "panel-action-build" });
  const cancelBtn = h(
    "button",
    {
      className: "panel-action-cancel",
      "aria-label": strings.ui.close,
      onClick: () => openTrainPanel(container, state, trainId),
    },
    icon("close"),
  );

  function render(): void {
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
          carTypeLabel(c),
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
          CARGO[c].name,
          icon("close", "icon-sm"),
        ),
      ),
    );

    const plan = computeEditConsistPlan(state, trainId, cars);
    const affordable = plan.netCost <= state.cash;
    confirmBtn.textContent = `${strings.trains.confirm} (${formatMoney(plan.netCost)})`;
    confirmBtn.disabled = !plan.valid || !affordable;
  }

  confirmBtn.addEventListener("click", () => {
    const result = editConsist(state, trainId, cars);
    if (!result.ok) {
      showToast(container, strings.build.reasons[result.reason], "warn");
      return;
    }
    openTrainPanel(container, state, trainId);
  });

  openPanel(container, {
    title: strings.trains.editCarsTitle,
    body: [
      h("div", { className: "panel-section-title" }, strings.trains.cars),
      carPickerEl,
      carListEl,
      ...(train.status !== "loading"
        ? [
            h(
              "div",
              { className: "panel-row train-consist-pending" },
              strings.trains.consistChangeQueued,
            ),
          ]
        : []),
    ],
    footer: [confirmBtn, cancelBtn],
  });

  render();
}

/** Opens the locomotive picker for `trainId`'s "Replace Locomotive" action (SPEC §7.6: pay the new
 * loco's price minus a trade-in credit for the old one, keep cars and orders). Tapping a model
 * replaces immediately (no separate confirm bar, matching the Station upgrade button's flow). */
function openReplaceLocoPanel(container: HTMLElement, state: GameState, trainId: number): void {
  const year = currentYear(state);
  const available = buyableLocomotivesIn(year);

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
    icon("close"),
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
            h("span", { className: "train-list-status" }, statusText(state, t)),
          ),
        );

  openPanel(container, { title: strings.trains.listTitle, body });
}
