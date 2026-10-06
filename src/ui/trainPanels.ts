/**
 * Train UI (STYLE §11.2): the per-train panel (side-view hero strip with fill meters, status line,
 * Route / Stats tabs, action-bar footer), the Edit cars sheet (reuses the consist builder), the
 * Replace-locomotive picker and the train list. The buy wizard lives in `buyTrainWizard.ts`.
 */
import { repairPhase } from "../sim/trains/repairCrew";
import { CARGO, type CargoType } from "../data/cargo";
import {
  buyableLocomotivesIn,
  locomotiveById,
  NEW_LOCOMOTIVE_BADGE_YEARS,
  type LocomotiveDef,
} from "../data/trains";
import {
  computeEditConsistPlan,
  computeReplaceLocoPlan,
  computeSellTrainPlan,
  editConsist,
  replaceLocomotive,
  sellTrain,
  setOrderGap,
  setOrderRule,
  spaceTrainsEvenly,
  setOrders,
} from "../sim/commands";
import type { GameState } from "../sim/state";
import { calendarFromTicks, DAYS_PER_YEAR, HOURS_PER_DAY } from "../sim/time";
import { getTrainRuntime, isElectrificationOnlyBlocker } from "../sim/trains";
import { passedOrderStops } from "../sim/trains/passedStops";
import { undeliverableCars } from "../sim/trains/undeliverable";
import { cargoGaps } from "../sim/trains/cargoGaps";
import { cargoGapLine } from "./cargoGapNote";
import { monthlyBreakdownChance } from "../sim/trains/breakdown";
import { mechanicalAgeYears } from "../sim/trains/ageing";
import {
  carsUpkeepPerYear,
  locoRunningCostPerYear,
  trainCompetition,
  trainWagesPerYear,
} from "../sim/finance/costs";
import { trainCrewSize } from "../data/economy";
import { lineSummaries } from "../sim/finance/lines";
import { booksProfit, trainProfitPerYear, trainProfitStatus } from "../sim/trains/profit";
import type { Train, TrainCar, TrainOrder } from "../sim/trains/types";
import { cardList, cardRow } from "./components/cardRow";
import { emptyState } from "./components/emptyState";
import { footerButton } from "./components/footer";
import { meter, pips } from "./components/meter";
import { section } from "./components/section";
import { statRow, statTile } from "./components/statTile";
import { stackedBar } from "./components/charts";
import { tabs } from "./components/tabs";
import { consistBuilder } from "./consistBuilder";
import { formatMoney } from "./format";
import { chipTextColor } from "./infoPanels";
import { flashLast, h } from "./h";
import { icon, type IconName } from "./icons";
import { closePanel, openPanel } from "./panel";
import { routeTimeline, type TimelineMarker } from "./routeTimeline";
import { openSheet } from "./sheet";
import { formatSpeed, loadSettings } from "./settings";
import { strings } from "./strings";
import { showToast } from "./toast";
import { consistStrip, locoArt, tractionIcon, wheelGlyphEl } from "./trainArt";
import type { Tone } from "./components/tone";

export { openBuyTrainPanel, type BuyTrainHandlers } from "./buyTrainWizard";

/** Map-pick hooks for adding stops to an existing train from its Route tab (set once by main). */
export interface StationPickHooks {
  pickStationOnMap: (onPicked: (stationId: number) => void) => void;
  cancelPickStationOnMap: () => void;
}
let pickHooks: StationPickHooks | null = null;
export function setStationPickHooks(hooks: StationPickHooks): void {
  pickHooks = hooks;
}

function currentYear(state: GameState): number {
  return calendarFromTicks(state.startYear, state.ticks).year;
}

/** SPEC §7.3: "clear reason in the UI: 'Route not electrified'" — checked only when the train is
 * actually stuck with no route and its locomotive is electric. */
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
 * `waitingForBlock`/`waitingForStation` train is trying to reach next. */
export function statusText(state: GameState, train: Train): string {
  if (train.inYardOf !== undefined && train.status === "waitingForStation") {
    const yard = state.stations.find((s) => s.id === train.inYardOf);
    if (yard) {
      // Platforms go to the oldest yard arrival first (sim/trains/movement.ts): count those ahead.
      const since = train.yardSince ?? 0;
      const ahead = state.trains.filter(
        (t) =>
          t !== train &&
          t.inYardOf === yard.id &&
          ((t.yardSince ?? 0) < since || ((t.yardSince ?? 0) === since && t.id < train.id)),
      ).length;
      return strings.trains.waitingInYard(yard.name, ahead);
    }
  }
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
  if (train.crossingWait && train.status === "moving") {
    const names = train.crossingWait.trainIds
      .map((id) => state.trains.find((t) => t.id === id)?.name)
      .filter((n): n is string => n !== undefined);
    if (names.length > 0) return strings.trains.waitingAtCrossing(names.slice(0, 3).join(", "));
  }
  const repair = train.status === "broken" ? repairPhase(state, train) : null;
  if (repair?.phase === "arriving") {
    const from = stationName(state, repair.stationId);
    return repair.far
      ? strings.trains.repairArrivingFar(from, repair.daysLeft)
      : strings.trains.repairArriving(from, repair.daysLeft);
  }
  if (repair?.phase === "repairing") return strings.trains.repairing(repair.daysLeft);
  const order = train.orders[train.currentOrderIndex];
  const orderStation = order && state.stations.find((s) => s.id === order.stationId)?.name;
  if (train.status === "noRoute" && orderStation) return strings.trains.noRouteTo(orderStation);
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
  if (train.status === "moving" && orderStation) {
    return strings.trains.panel.moving(
      orderStation,
      formatSpeed(train.speed, loadSettings().units),
    );
  }
  if (train.status === "loading" && orderStation) {
    return strings.trains.panel.atStop(orderStation);
  }
  return strings.trains.statusNames[train.status];
}

const STATUS_ICON: Record<Train["status"], { icon: IconName; tone: Tone }> = {
  moving: { icon: "arrowRight", tone: "steel" },
  loading: { icon: "cargo", tone: "brass" },
  waitingForBlock: { icon: "signal", tone: "signal" },
  waitingForStation: { icon: "signal", tone: "signal" },
  noRoute: { icon: "warning", tone: "signal" },
  stuck: { icon: "warning", tone: "signal" },
  broken: { icon: "wrench", tone: "signal" },
};

function stationName(state: GameState, id: number): string {
  return state.stations.find((s) => s.id === id)?.name ?? strings.fallback.station;
}

/** Status line under the hero: icon + text (+ the electrification reason when that is why). */
/** "1 warning ▸" — collapsed by default; the notes show when opened. Nothing when there are none. */
function warningsLine(
  notes: HTMLElement[],
  open: boolean,
  setOpen: (open: boolean) => void,
): HTMLElement | null {
  if (notes.length === 0) return null;
  return h(
    "div",
    { className: "warn-fold", "data-testid": "warn-fold" },
    h(
      "button",
      {
        className: "warn-fold-toggle",
        "aria-expanded": String(open),
        onClick: () => setOpen(!open),
      },
      icon("warning", "icon-xs"),
      `${strings.trains.cargoGap.warnings(notes.length)} ${open ? "▾" : "▸"}`,
    ),
    ...(open ? notes : []),
  );
}

function statusLine(state: GameState, train: Train, loco: LocomotiveDef | undefined): HTMLElement {
  const st = STATUS_ICON[train.status];
  const kids: Array<Node | string> = [
    icon(st.icon, `icon-sm tone-${st.tone}`),
    h("span", { className: "train-status-text" }, statusText(state, train)),
  ];
  if (loco && electrifiedRouteBlocked(state, train, loco)) {
    kids.push(h("span", { className: "train-route-warning" }, strings.trains.routeNotElectrified));
  }
  if (train.pendingConsist) {
    kids.push(
      h("span", { className: "train-consist-pending" }, strings.trains.consistChangeQueued),
    );
  }
  const problem =
    train.status === "noRoute" || train.status === "stuck" || train.status === "broken";
  const waiting = train.status === "waitingForBlock" || train.status === "waitingForStation";
  return h(
    "div",
    {
      className: `train-status-line${problem ? " problem" : ""}${waiting ? " train-waiting" : ""}`,
      "data-testid": "train-status",
    },
    ...kids,
  );
}

/** "Coal 20 / 40 t" in the cargo colour; dimmed "Empty" when nothing is loaded. */
function carLoadChip(car: TrainCar): HTMLElement {
  const def = CARGO[car.cargoType];
  const loaded = car.loadedUnits > 0;
  const label = loaded
    ? `${def.name} ${Math.round(car.loadedUnits)} / ${def.capacity}${def.unit ? ` ${def.unit}` : ""}`
    : `${strings.trains.empty} (${def.name})`;
  return h(
    "span",
    {
      className: `chip${loaded ? "" : " chip-dim"}`,
      style: { background: def.color, color: chipTextColor(def.color) },
    },
    label,
  );
}

function heroStrip(state: GameState, train: Train): HTMLElement {
  return h(
    "div",
    { className: "train-hero" },
    consistStrip({
      locoId: train.locoModelId,
      cars: train.cars.map((c) => ({
        cargoType: c.cargoType,
        fill01: c.loadedUnits / CARGO[c.cargoType].capacity,
        loaded: c.loadedUnits > 0,
      })),
      year: currentYear(state),
      height: 40,
      fillMeters: true,
    }),
  );
}

function timelineMarker(train: Train): TimelineMarker | undefined {
  if (train.orders.length === 0) return undefined;
  return train.status === "loading"
    ? { kind: "at", index: train.currentOrderIndex }
    : { kind: "toward", index: train.currentOrderIndex };
}

// --- train panel ---------------------------------------------------------------------------------

type TrainTab = "route" | "stats";

/** Opens the management panel for an existing train. */
export function openTrainPanel(container: HTMLElement, state: GameState, trainId: number): void {
  let tab: TrainTab = "route";
  let armed = false;
  let picking = false;
  // Viewing a train must not edit it (Phase 31): map-tap adding is off until "Add stop" is tapped (the buy wizard's
  // route step is the only place it starts on).
  let pickEnabled = false;
  // The warnings line stays collapsed (Phase 34): one small "N warnings ▸" row, details on tap.
  let warningsOpen = false;

  const render = (): void => {
    const train = state.trains.find((t) => t.id === trainId);
    if (!train) return;
    const loco = locomotiveById(train.locoModelId);
    const p = strings.trains.panel;

    const heroHost = h("div", { className: "train-live" });
    const fillLive = (): void => {
      const t = state.trains.find((x) => x.id === trainId);
      if (!t) return;
      const stuck = [...undeliverableCars(state, t)];
      heroHost.replaceChildren(
        heroStrip(state, t),
        statusLine(state, t, loco),
        ...[
          warningsLine(
            [
              ...cargoGaps(
                state,
                t.cars.map((c) => c.cargoType),
                t.orders,
              ).map((gap) => cargoGapLine(state, gap)),
              ...stuck.map(([cargo, cars]) =>
                h(
                  "div",
                  { className: "cargo-gap-line undeliverable-chip" },
                  strings.trains.undeliverableChip(cars, CARGO[cargo].name.toLowerCase()),
                ),
              ),
            ],
            warningsOpen,
            (open) => {
              warningsOpen = open;
              fillLive();
            },
          ),
        ].filter((n): n is HTMLElement => n !== null),
      );
    };
    fillLive();

    const tabBody = h("div", { className: "train-tab-body" });
    const fillTab = (): void => {
      const t = state.trains.find((x) => x.id === trainId);
      if (!t) return;
      tabBody.replaceChildren(tab === "route" ? routeTab(t) : statsTab(t));
      if (tab !== "route") syncPicking(t);
    };

    const applyRule = (index: number, rule: TrainOrder["rule"]): void => {
      const result = setOrderRule(state, trainId, index, rule);
      if (!result.ok) showToast(container, strings.build.reasons[result.reason], "warn");
      fillTab();
    };

    const changeOrders = (next: TrainOrder[]): void => {
      const result = setOrders(state, trainId, next);
      if (!result.ok) showToast(container, strings.build.reasons[result.reason], "warn");
      fillTab();
    };

    /** Map-tap entry is explicit here: on while "Add stop" is toggled on and the route tab shows. */
    function syncPicking(t: Train): void {
      const want = pickHooks !== null && pickEnabled && tab === "route" && t.orders.length < 8;
      if (picking && !want) {
        picking = false;
        pickHooks?.cancelPickStationOnMap();
      } else if (!picking && want) {
        picking = true;
        pickHooks?.pickStationOnMap((sid) => {
          const cur = state.trains.find((x) => x.id === trainId);
          if (!cur || cur.orders.length >= 8) return;
          // Tapping the same station twice in a row adds one stop.
          if (cur.orders[cur.orders.length - 1]?.stationId === sid) return;
          changeOrders([...cur.orders, { stationId: sid, rule: "auto" }]);
          flashLast(".tl-stop");
        });
      }
    }

    function routeTab(t: Train): Node {
      syncPicking(t);
      const canPick = pickHooks !== null && t.orders.length < 8;
      const passedOrders = passedOrderStops(state, t);
      const pickBtn = h(
        "button",
        {
          className: `train-pick-station-btn${picking ? " active" : ""}`,
          disabled: !canPick,
          onClick: () => {
            pickEnabled = !pickEnabled;
            fillTab();
          },
        },
        icon("plus", "icon-sm"),
        h("span", null, picking ? strings.trains.tapAStation : p.addStop),
        picking ? h("span", { className: "pick-done" }, p.doneAdding) : null,
      );
      return h(
        "div",
        { className: "route-tab" },
        t.orders.length === 0
          ? emptyState(p.stopsNeeded, "mapPin")
          : routeTimeline({
              stops: t.orders.map((o, i) => {
                const passed = passedOrders.find((x) => x.orderIndex === i);
                return {
                  name: stationName(state, o.stationId),
                  rule: o.rule,
                  gapDays: o.minGapDays,
                  ...(passed && t.orders.length < 8
                    ? {
                        note: {
                          text: p.passedNote(
                            stationName(state, t.orders[passed.fromIndex]!.stationId),
                          ),
                          actionLabel: p.addStopHere,
                          onAction: () => {
                            const next = t.orders.map((x) => ({ ...x }));
                            next.splice(passed.fromIndex + 1, 0, {
                              stationId: o.stationId,
                              rule: "auto",
                            });
                            changeOrders(next);
                          },
                        },
                      }
                    : {}),
                };
              }),
              marker: timelineMarker(t),
              passengers: t.cars.some((c) => c.cargoType === "passengers"),
              onRule: applyRule,
              onGap: (i, days) => {
                const result = setOrderGap(state, trainId, i, days);
                if (!result.ok) showToast(container, strings.build.reasons[result.reason], "warn");
                fillTab();
              },
              onRemove: (i) =>
                changeOrders(t.orders.filter((_, j) => j !== i).map((o) => ({ ...o }))),
              onMove: (i, dir) => {
                const next = t.orders.map((o) => ({ ...o }));
                const a = next[i];
                const b = next[i + dir];
                if (!a || !b) return;
                next[i] = b;
                next[i + dir] = a;
                changeOrders(next);
              },
            }),
        pickHooks ? pickBtn : null,
      );
    }

    function statsTab(t: Train): Node {
      const l = locomotiveById(t.locoModelId);
      const ageFrac = (state.ticks - t.purchaseTick) / (HOURS_PER_DAY * DAYS_PER_YEAR);
      const monthly = monthlyBreakdownChance(state, t);
      const year = calendarFromTicks(state.startYear, state.ticks).year;
      const running = l
        ? locoRunningCostPerYear(l, mechanicalAgeYears(state, t), year) +
          carsUpkeepPerYear(t.cars, year)
        : 0;
      const wages = l ? trainWagesPerYear(l, t.cars.length, year) : 0;
      const competition = l ? trainCompetition(l, t, state.stations, state.map.width, year) : 0;
      const capacity = t.cars.reduce((sum, c) => sum + CARGO[c.cargoType].capacity, 0);
      const loaded = t.cars.reduce((sum, c) => sum + c.loadedUnits, 0);
      const byCargo = new Map<CargoType, number>();
      for (const c of t.cars) {
        byCargo.set(c.cargoType, (byCargo.get(c.cargoType) ?? 0) + CARGO[c.cargoType].capacity);
      }
      return h(
        "div",
        { className: "train-stats" },
        statRow(
          profitTile(booksProfit(t.profit.thisYear), p.profitThisYear),
          profitTile(booksProfit(t.profit.lastYear), p.profitLastYear),
          profitTile(booksProfit(t.profit.lifetime), p.profitLifetime),
        ),
        h(
          "div",
          { className: "train-stat-line paid-back" },
          icon("coin", "icon-sm"),
          meter(
            Math.max(0, booksProfit(t.profit.lifetime)),
            Math.max(1, t.purchasePrice),
            booksProfit(t.profit.lifetime) >= t.purchasePrice ? "go" : "brass",
            p.paidBack(
              Math.round(
                (100 * Math.max(0, booksProfit(t.profit.lifetime))) / Math.max(1, t.purchasePrice),
              ),
              formatMoney(t.purchasePrice),
            ),
          ),
        ),
        statRow(
          statTile({
            icon: "coin",
            value: formatMoney(t.profit.thisYear.revenue),
            caption: p.earned,
          }),
          statTile({
            icon: "wrench",
            value: `${formatMoney(running)}${strings.trains.stats.perYear}`,
            caption: p.runningCost,
          }),
          statTile({ icon: "calendar", value: p.ageYears(Math.floor(ageFrac)), caption: p.age }),
        ),
        statRow(
          statTile({
            icon: "coin",
            value: `${formatMoney(wages)}${strings.trains.stats.perYear}`,
            caption: `${p.wagesPerYear} · ${p.crewOf(l ? trainCrewSize(l, t.cars.length) : 0)}`,
          }),
          statTile({
            icon: "track",
            value: formatMoney(t.profit.thisYear.wear ?? 0),
            caption: p.trackWearThisYear,
          }),
          statTile({
            icon: "wrench",
            value: formatMoney(t.profit.thisYear.repairs),
            caption: p.repairsThisYear,
          }),
        ),
        ...(competition >= 0.01
          ? [
              h(
                "div",
                { className: "train-stat-line competition-note" },
                icon("warning", "icon-sm"),
                h(
                  "span",
                  { className: "train-stat-label" },
                  p.competitionLoss(Math.round(competition * 100)),
                ),
              ),
            ]
          : []),
        ...(t.status === "broken" && t.repairCrew?.cost
          ? [
              h(
                "div",
                { className: "train-stat-line repair-cost-note" },
                icon("wrench", "icon-sm"),
                h(
                  "span",
                  { className: "train-stat-label" },
                  p.breakdownCallOut(
                    formatMoney(t.repairCrew.cost.total),
                    formatMoney(t.repairCrew.cost.wages + t.repairCrew.cost.vehicle),
                    formatMoney(t.repairCrew.cost.parts),
                  ),
                ),
              ),
            ]
          : []),
        h(
          "div",
          { className: "train-stat-line" },
          icon("reliability", "icon-sm"),
          h("span", { className: "train-stat-label" }, p.reliability),
          pips(l?.reliability ?? 0),
          h(
            "span",
            { className: "train-stat-note tabular" },
            p.breakdownChance((monthly * 100).toFixed(1)),
          ),
        ),
        section(p.load, [
          h("div", { className: "chip-row" }, ...t.cars.map((c) => carLoadChip(c))),
        ]),
        section(p.capacity, [
          stackedBar(
            [...byCargo].map(([cargo, cap]) => ({
              key: cargo,
              value: cap,
              color: CARGO[cargo].color,
              label: CARGO[cargo].name,
              display: String(cap),
            })),
            p.noCars,
          ),
          capacity > 0
            ? meter(loaded, capacity, "brass", p.loadedOf(Math.round(loaded), capacity))
            : null,
        ]),
      );
    }

    fillTab();

    // Live refresh of the hero + status line (and the timeline marker), without rebuilding the
    // panel — so taps and scroll position are never disturbed.
    const sig = (t: Train): string =>
      `${t.status}|${t.currentOrderIndex}|${Math.round(t.speed)}|${t.cars.map((c) => Math.round(c.loadedUnits)).join(",")}|${t.waitingOn?.stationId ?? ""}`;
    let lastSig = sig(train);
    const timer = window.setInterval(() => {
      if (!heroHost.isConnected) {
        window.clearInterval(timer);
        return;
      }
      const t = state.trains.find((x) => x.id === trainId);
      if (!t) return;
      const s = sig(t);
      if (s === lastSig) return;
      lastSig = s;
      fillLive();
      if (tab === "route") fillTab();
    }, 800);

    const sellPlan = computeSellTrainPlan(state, trainId);
    const sellBtn = footerButton({
      icon: "trash",
      label: strings.trains.sell,
      title: `${strings.trains.sell} +${formatMoney(sellPlan.refund)}`,
      kind: "danger",
      className: "train-sell-btn btn-danger",
      onClick: () => {
        // Two-tap confirm: selling is irreversible, so the first tap only arms the button.
        if (!armed) {
          armed = true;
          const label = sellBtn.lastElementChild;
          if (label) label.textContent = strings.trains.sellFor(formatMoney(sellPlan.refund));
          return;
        }
        const result = sellTrain(state, trainId);
        if (!result.ok) {
          showToast(container, strings.build.reasons[result.reason], "warn");
          return;
        }
        closePanel();
      },
    });

    const thumb = loco ? h("div", { className: "loco-crop" }, locoArt(loco, 36)) : icon("trains");
    const glyph = loco ? wheelGlyphEl(loco) : null;

    openPanel(container, {
      title: train.name,
      subtitle: h(
        "span",
        { className: "train-subtitle" },
        loco ? icon(tractionIcon(loco), "icon-xs") : null,
        loco?.name ?? strings.fallback.locomotive,
        glyph,
      ),
      thumb,
      tabs: tabs(
        [
          { id: "route", label: p.tabs.route, icon: "mapPin" },
          { id: "stats", label: p.tabs.stats, icon: "trendUp" },
        ] as const,
        tab,
        (id) => {
          tab = id;
          armed = false;
          render();
        },
      ),
      body: [heroHost, tabBody],
      footer: [
        footerButton({
          icon: "edit",
          label: strings.trains.editCars,
          kind: "secondary",
          className: "train-edit-btn",
          onClick: () => openEditConsistSheet(container, state, trainId),
        }),
        footerButton({
          icon: "swap",
          label: strings.trains.replace,
          kind: "secondary",
          className: "train-replace-btn",
          onClick: () => openReplaceLocoPanel(container, state, trainId),
        }),
        sellBtn,
      ],
      key: `train:${trainId}`,
      onClose: () => {
        window.clearInterval(timer);
        if (picking) {
          picking = false;
          pickHooks?.cancelPickStationOnMap();
        }
      },
    });
    // The replaced panel's onClose has just cancelled picking: resume it for the new one.
    const shown = state.trains.find((x) => x.id === trainId);
    if (shown) syncPicking(shown);
  };

  render();
}

// --- edit cars (full-screen sheet, same builder as the wizard's step 2) -------------------------

function openEditConsistSheet(container: HTMLElement, state: GameState, trainId: number): void {
  const train = state.trains.find((t) => t.id === trainId);
  if (!train) return;
  const loco = locomotiveById(train.locoModelId);
  const year = currentYear(state);
  const cars: CargoType[] = train.cars.map((c) => c.cargoType);
  const confirmBtn = footerButton({
    label: strings.trains.confirm,
    icon: "check",
    kind: "primary",
  });
  confirmBtn.classList.add("edit-confirm", "wizard-next");

  const builder = consistBuilder({
    getLoco: () => loco,
    year,
    cars,
    stripHeight: 56,
    onChange: () => {
      builder.refresh();
      updateConfirm();
    },
  });
  function updateConfirm(): void {
    const plan = computeEditConsistPlan(state, trainId, cars);
    const label = confirmBtn.lastElementChild;
    const sign = plan.netCost < 0 ? "+" : "";
    if (label) {
      label.textContent = `${strings.trains.confirm} · ${sign}${formatMoney(Math.abs(plan.netCost))}`;
    }
    confirmBtn.disabled = !plan.valid || plan.netCost > state.cash;
  }
  updateConfirm();

  const sheet = openSheet(container, {
    className: "sheet-edit",
    title: `${strings.trains.editCarsTitle} · ${train.name}`,
    subtitle: train.status !== "loading" ? strings.trains.consistChangeQueued : undefined,
    body: [builder.el],
    footer: [
      footerButton({
        label: strings.ui.close,
        kind: "secondary",
        onClick: () => sheet.close(),
      }),
      confirmBtn,
    ],
  });
  confirmBtn.addEventListener("click", () => {
    const result = editConsist(state, trainId, cars);
    if (!result.ok) {
      showToast(container, strings.build.reasons[result.reason], "warn");
      return;
    }
    sheet.close();
    openTrainPanel(container, state, trainId);
  });
}

// --- replace locomotive --------------------------------------------------------------------------

/** The locomotive picker for "Replace" (SPEC §7.6: pay the new loco's price minus a trade-in credit
 * for the old one, keep cars and orders). Tapping a model replaces immediately. */
function openReplaceLocoPanel(container: HTMLElement, state: GameState, trainId: number): void {
  const year = currentYear(state);
  const available = buyableLocomotivesIn(year)
    .slice()
    .sort((a, b) => b.introYear - a.introYear);

  const rows = available.map((loco) => {
    const plan = computeReplaceLocoPlan(state, trainId, loco.id);
    const isNew = loco.introYear + NEW_LOCOMOTIVE_BADGE_YEARS >= year;
    return cardRow({
      className: "train-loco-btn eng-card",
      thumb: h("div", { className: "eng-thumb" }, locoArt(loco, 32)),
      title: h(
        "span",
        { className: "eng-card-title" },
        h("span", { className: "eng-card-name" }, loco.name),
        isNew ? h("span", { className: "new-chip" }, strings.trains.newBadge) : null,
      ),
      meta: plan.valid
        ? `${strings.trains.tradeInCredit} ${formatMoney(plan.tradeInValue)}`
        : strings.trains.replaceUnavailable,
      trailing: plan.valid ? formatMoney(plan.netCost) : "—",
      disabled: !plan.valid || plan.netCost > state.cash,
      onClick: () => {
        const result = replaceLocomotive(state, trainId, loco.id);
        if (!result.ok) {
          showToast(container, strings.build.reasons[result.reason], "warn");
          return;
        }
        openTrainPanel(container, state, trainId);
      },
    });
  });

  openPanel(container, {
    title: strings.trains.replaceTitle,
    subtitle: state.trains.find((t) => t.id === trainId)?.name,
    thumb: icon("swap"),
    body: [cardList(...rows)],
    footer: [
      footerButton({
        icon: "arrowLeft",
        label: strings.ui.back,
        kind: "secondary",
        className: "panel-action-cancel",
        onClick: () => openTrainPanel(container, state, trainId),
      }),
    ],
    key: `train-replace:${trainId}`,
    live: () => openReplaceLocoPanel(container, state, trainId),
  });
}

function profitTile(profit: number, caption: string): HTMLElement {
  return statTile({
    icon: profit >= 0 ? "trendUp" : "arrowDown",
    value: `${profit >= 0 ? "+" : "−"}${formatMoney(Math.abs(profit))}`,
    caption,
    tone: profit >= 0 ? "go" : "signal",
  });
}

// --- lines (per-line P&L) ---

function signedMoney(v: number): string {
  return `${v >= 0 ? "+" : "−"}${formatMoney(Math.abs(v))}`;
}

function linesList(
  container: HTMLElement,
  state: GameState,
  onFocus: (trainId: number) => void,
  refresh: () => void,
): HTMLElement {
  const L = strings.trains.list;
  const lines = lineSummaries(state);
  if (lines.length === 0) return emptyState(L.noLines, "trains");
  const nameOf = (id: number): string =>
    state.stations.find((s) => s.id === id)?.name ?? strings.fallback.station;
  const rows = lines.map((line) => {
    const rate = line.ratePerYear;
    const row = cardRow({
      className: "line-row",
      testId: "line-row",
      thumb: icon("trains", "icon-sm tone-brass"),
      title: line.stationIds.map(nameOf).join(" – "),
      meta: `${L.lineTrains(line.trainIds.length)} · ${L.lineThisYear(formatMoney(line.revenueThisYear), formatMoney(line.costsThisYear))}`,
      trailing: h(
        "span",
        {
          className: `train-profit-col profit-${rate === undefined ? "new" : rate >= 0 ? "good" : "bad"}`,
          title: L.rateHint,
        },
        h("i", { className: "profit-dot" }),
        rate === undefined ? L.rateNew : `${L.rate} ${signedMoney(rate)}${L.perYear}`,
      ),
      chevron: true,
      onClick: () => {
        const first = line.trainIds[0];
        if (first === undefined) return;
        onFocus(first);
        openTrainPanel(container, state, first);
      },
    });
    if (line.trainIds.length < 2) return cardList(row);
    const gap = state.trains
      .find((t) => t.id === line.trainIds[0])
      ?.orders.find((o) => o.minGapDays !== undefined)?.minGapDays;
    return h(
      "div",
      { className: "line-block" },
      cardList(row),
      h(
        "div",
        { className: "line-actions" },
        h(
          "button",
          {
            className: "line-space-btn",
            "data-testid": "space-evenly",
            title: L.spaceHint,
            onClick: () => {
              const result = spaceTrainsEvenly(state, line.trainIds);
              if (!result.ok) showToast(container, strings.build.reasons[result.reason], "warn");
              else showToast(container, L.spaced(result.gapDays ?? 1), "info");
              refresh();
            },
          },
          icon("clock", "icon-xs"),
          L.spaceEvenly,
        ),
        gap !== undefined ? h("span", { className: "line-gap-note" }, L.spaced(gap)) : null,
      ),
    );
  });
  return h(
    "div",
    { className: "lines-list" },
    ...rows,
    h("div", { className: "hint line-hint" }, L.spaceHint),
  );
}

// --- train list ----------------------------------------------------------------------------------

function locoThumbFor(t: Train): Node {
  const def = locomotiveById(t.locoModelId);
  return def ? locoArt(def, 32) : icon("steam");
}

/** Opens the train list; tapping a row focuses the camera on that train (via `onFocus`) and opens
 * its management panel. */
export function openTrainListPanel(
  container: HTMLElement,
  state: GameState,
  onFocus: (trainId: number) => void,
  sortBy: "name" | "profit" | "lines" = "name",
): void {
  const L = strings.trains.list;
  const trains =
    sortBy === "profit"
      ? [...state.trains].sort(
          (a, b) => trainProfitPerYear(b, state.ticks) - trainProfitPerYear(a, state.ticks),
        )
      : state.trains;
  const sortRow = (): HTMLElement =>
    h(
      "div",
      { className: "segmented-row list-sort" },
      ...(["name", "profit", "lines"] as const).map((key) =>
        h(
          "button",
          {
            className: `segmented-btn${sortBy === key ? " active" : ""}`,
            "data-testid": `list-sort-${key}`,
            onClick: () => openTrainListPanel(container, state, onFocus, key),
          },
          key === "name" ? L.sortName : key === "profit" ? L.sortProfit : L.sortLines,
        ),
      ),
    );
  const body: Node[] =
    state.trains.length === 0
      ? [emptyState(strings.trains.none, "trains")]
      : sortBy === "lines"
        ? [
            sortRow(),
            linesList(container, state, onFocus, () =>
              openTrainListPanel(container, state, onFocus, sortBy),
            ),
          ]
        : [
            sortRow(),
            cardList(
              ...trains.map((t) => {
                const st = STATUS_ICON[t.status];
                const verdict = trainProfitStatus(t, state.ticks);
                const perYear = trainProfitPerYear(t, state.ticks);
                return cardRow({
                  className: "train-list-row",
                  thumb: h("div", { className: "eng-thumb" }, locoThumbFor(t)),
                  title: t.name,
                  meta: h(
                    "span",
                    { className: "card-meta-inline" },
                    icon(st.icon, `icon-xs tone-${st.tone}`),
                    statusText(state, t),
                  ),
                  trailing: h(
                    "span",
                    {
                      className: `train-profit-col profit-${verdict}`,
                      title: verdict === "bad" ? L.losing : "",
                    },
                    h("i", { className: "profit-dot" }),
                    verdict === "new"
                      ? "—"
                      : `${perYear >= 0 ? "+" : "−"}${formatMoney(Math.abs(perYear))}${L.perYear}`,
                  ),
                  chevron: true,
                  onClick: () => {
                    onFocus(t.id);
                    openTrainPanel(container, state, t.id);
                  },
                });
              }),
            ),
          ];

  openPanel(container, {
    title: strings.trains.listTitle,
    subtitle: strings.trains.listSubtitle(state.trains.length),
    thumb: icon("trains"),
    body,
    key: `trainlist:${sortBy}`,
    live: () => openTrainListPanel(container, state, onFocus, sortBy),
  });
}
