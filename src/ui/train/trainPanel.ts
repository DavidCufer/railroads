/**
 * Train panel v2 (STYLE §11.2): side-view hero with per-car fill meters and cargo pictograms, a
 * status line, Route (timeline) and Stats tabs, and an action-bar footer (Edit cars · Replace ·
 * Sell). Edit cars reuses the buy wizard's consist builder in a sheet.
 */
import { CARGO, type CargoType } from "../../data/cargo";
import { buyableLocomotivesIn, locomotiveById } from "../../data/trains";
import {
  computeEditConsistPlan,
  computeReplaceLocoPlan,
  computeSellTrainPlan,
  editConsist,
  editOrders,
  replaceLocomotive,
  sellTrain,
} from "../../sim/commands";
import type { GameState } from "../../sim/state";
import { calendarFromTicks, DAYS_PER_YEAR, HOURS_PER_DAY } from "../../sim/time";
import type { Train, TrainOrder } from "../../sim/trains/types";
import { cardList } from "../components/cardRow";
import { emptyState } from "../components/emptyState";
import { footerButton } from "../components/footer";
import { meter, pips } from "../components/meter";
import { section } from "../components/section";
import { statRow, statTile } from "../components/statTile";
import { tabs } from "../components/tabs";
import { formatMoney } from "../format";
import { h } from "../h";
import { cargoIcon, icon } from "../icons";
import { closePanel, openPanel } from "../panel";
import { formatSpeed, loadSettings } from "../settings";
import { strings } from "../strings";
import { showToast } from "../toast";
import { consistBuilder } from "./consistBuilder";
import { engineCard, isNewModel, tractionIcon } from "./engineParts";
import { locoPicture } from "./pictures";
import { consistStrip } from "./pictures";
import { nextRule, routeTimeline } from "./routeTimeline";
import { openSheet } from "./sheet";
import { electrifiedRouteBlocked, statusLine } from "./trainStatus";

export interface TrainPanelHandlers {
  /** Tap-a-station mode for "Add stop" (same hook the buy wizard uses). */
  pickStationOnMap?: (onPicked: (stationId: number) => void) => void;
  cancelPickStationOnMap?: () => void;
}

type TrainTab = "route" | "stats";

function currentYear(state: GameState): number {
  return calendarFromTicks(state.startYear, state.ticks).year;
}

const tabState = new Map<number, TrainTab>();

function stationName(state: GameState, id: number): string {
  return state.stations.find((s) => s.id === id)?.name ?? "?";
}

/** Consist strip for a live train: fill meters under each car, cargo pictogram above loaded ones. */
function heroStrip(state: GameState, train: Train, status: HTMLElement): HTMLElement {
  const strip = consistStrip(
    train.locoModelId,
    train.cars.map((c) => ({
      cargoType: c.cargoType,
      fill01: Math.min(1, c.loadedUnits / CARGO[c.cargoType].capacity),
    })),
    currentYear(state),
    38,
    { padTop: 13, padBottom: 8 },
  );
  strip.slots.forEach((slot, i) => {
    const car = train.cars[i];
    if (!car) return;
    const pct = Math.max(0, Math.min(100, (car.loadedUnits / CARGO[car.cargoType].capacity) * 100));
    slot.appendChild(
      h(
        "div",
        {
          className: "slot-meter",
          "aria-label": `${CARGO[car.cargoType].name} ${Math.round(pct)}%`,
        },
        h("div", { className: "slot-meter-fill", style: { width: `${pct}%` } }),
      ),
    );
    if (car.loadedUnits > 0) {
      slot.appendChild(
        h("div", { className: "slot-cargo" }, cargoIcon(car.cargoType, "cargo-icon-sm")),
      );
    }
  });
  return h("div", { className: "train-hero" }, strip.root, status);
}

export function openTrainPanel(
  container: HTMLElement,
  state: GameState,
  trainId: number,
  handlers: TrainPanelHandlers = {},
): void {
  let picking = false;

  const render = (): void => {
    const train = state.trains.find((t) => t.id === trainId);
    if (!train) return;
    const loco = locomotiveById(train.locoModelId);
    const t = strings.trains.panel;
    const tab = tabState.get(trainId) ?? "route";
    const status = statusLine(state, train);

    const setOrders = (orders: TrainOrder[]): void => {
      const result = editOrders(state, trainId, orders);
      if (!result.ok) showToast(container, strings.build.reasons[result.reason], "warn");
      render();
    };

    const routeBody = (): Node[] => {
      const stops = train.orders.map((o) => ({
        name: stationName(state, o.stationId),
        rule: o.rule,
      }));
      const marker =
        train.orders.length > 0 && loco
          ? {
              kind: (train.status === "loading" ? "at" : "toward") as "at" | "toward",
              index: train.currentOrderIndex,
              icon: tractionIcon(loco.type),
            }
          : undefined;
      return [
        train.orders.length === 0
          ? emptyState(t.noOrders, "mapPin")
          : routeTimeline({
              stops,
              marker,
              onRule: (i) => {
                setOrders(
                  train.orders.map((o, j) =>
                    j === i ? { ...o, rule: nextRule(o.rule) } : { ...o },
                  ),
                );
              },
              onRemove: (i) => {
                if (train.orders.length <= 2) {
                  showToast(container, strings.trains.wizard.needTwoStops, "warn");
                  return;
                }
                setOrders(train.orders.filter((_, j) => j !== i).map((o) => ({ ...o })));
              },
              onMove: (i, d) => {
                const next = train.orders.map((o) => ({ ...o }));
                const a = next[i];
                const b = next[i + d];
                if (!a || !b) return;
                next[i] = b;
                next[i + d] = a;
                setOrders(next);
              },
            }),
        ...(handlers.pickStationOnMap
          ? [
              h(
                "button",
                {
                  className: `train-pick-station-btn${picking ? " active" : ""}`,
                  disabled: train.orders.length >= 8,
                  onClick: () => {
                    if (picking) {
                      picking = false;
                      handlers.cancelPickStationOnMap?.();
                      render();
                      return;
                    }
                    picking = true;
                    render();
                    handlers.pickStationOnMap?.((stationId) => {
                      picking = false;
                      const live = state.trains.find((x) => x.id === trainId);
                      if (live && live.orders.length < 8) {
                        setOrders([
                          ...live.orders.map((o) => ({ ...o })),
                          { stationId, rule: "auto" as const },
                        ]);
                      } else render();
                    });
                  },
                },
                icon(picking ? "mapPin" : "plus", "icon-sm"),
                picking ? strings.trains.tapAStation : t.addStop,
              ),
            ]
          : []),
      ];
    };

    const statsBody = (): Node[] => {
      const ageYears = (state.ticks - train.purchaseTick) / (HOURS_PER_DAY * DAYS_PER_YEAR);
      const sell = computeSellTrainPlan(state, trainId);
      const units = loadSettings().units;
      return [
        statRow(
          statTile({
            icon: "coin",
            value: formatMoney(train.lifetimeRevenue),
            caption: t.stats.lifetime,
            tone: train.lifetimeRevenue > 0 ? "go" : undefined,
          }),
          statTile({ icon: "clock", value: t.years(ageYears), caption: t.stats.age }),
          statTile({ icon: "coin", value: formatMoney(sell.refund), caption: t.stats.value }),
        ),
        statRow(
          statTile({
            icon: "gauge",
            value: loco ? formatSpeed(loco.maxSpeedKmh, units) : "?",
            caption: t.stats.topSpeed,
          }),
          statTile({ icon: "flame", value: `${loco?.power ?? "?"}`, caption: t.stats.power }),
          statTile({
            icon: "cars",
            value: `${train.cars.length} / ${loco?.maxCars ?? "?"}`,
            caption: t.stats.cars,
          }),
        ),
        h(
          "div",
          { className: "stat-tile stat-pips" },
          h("div", { className: "stat-caption" }, t.stats.reliability),
          pips(loco?.reliability ?? 0),
        ),
        section(t.loadNote, [
          train.cars.length === 0
            ? emptyState(t.noCars, "cargo")
            : cardList(
                ...train.cars.map((c) => {
                  const def = CARGO[c.cargoType];
                  return h(
                    "div",
                    { className: "card-row car-load-row" },
                    cargoIcon(c.cargoType),
                    h("span", { className: "card-title" }, def.name),
                    meter(
                      c.loadedUnits,
                      def.capacity,
                      "brass",
                      `${Math.round(c.loadedUnits)} / ${def.capacity}${def.unit ? ` ${def.unit}` : ""}`,
                    ),
                  );
                }),
              ),
        ]),
      ];
    };

    const warning =
      loco && electrifiedRouteBlocked(state, train, loco)
        ? h(
            "div",
            { className: "train-route-warning route-warn" },
            icon("warning", "icon-sm"),
            strings.trains.routeNotElectrified,
          )
        : null;

    const body: Node[] = [
      heroStrip(
        state,
        train,
        h(
          "div",
          {
            className: `status-line tone-${status.tone}${status.tone === "signal" ? " train-waiting" : ""}`,
          },
          icon(status.icon, "icon-sm"),
          h("span", null, status.text),
        ),
      ),
      warning,
      train.pendingConsist
        ? h("div", { className: "train-consist-pending" }, strings.trains.consistChangeQueued)
        : null,
      h(
        "div",
        { className: "panel-tabs-sticky" },
        tabs(
          [
            { id: "route", label: t.tabs.route, icon: "mapPin" },
            { id: "stats", label: t.tabs.stats, icon: "finance" },
          ] as const,
          tab,
          (id) => {
            tabState.set(trainId, id);
            render();
          },
        ),
      ),
      h("div", { className: "train-tab-body" }, ...(tab === "route" ? routeBody() : statsBody())),
    ].filter((n): n is HTMLElement => n !== null);

    const sellPlan = computeSellTrainPlan(state, trainId);
    const sellBtn = footerButton({
      label: t.sell,
      icon: "trash",
      kind: "danger",
      className: "train-sell-btn",
      onClick: () => {
        // Two-tap confirm: selling is irreversible, so the first tap only arms the button.
        if (sellBtn.dataset.armed !== "1") {
          sellBtn.dataset.armed = "1";
          const label = sellBtn.querySelector("span");
          if (label)
            label.textContent = `${strings.trains.sellConfirm} +${formatMoney(sellPlan.refund)}`;
          window.setTimeout(() => {
            if (sellBtn.isConnected && sellBtn.dataset.armed === "1") {
              delete sellBtn.dataset.armed;
              if (label) label.textContent = t.sell;
            }
          }, 4000);
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

    openPanel(container, {
      key: `train:${trainId}`,
      title: train.name,
      subtitle: loco
        ? h(
            "span",
            { className: "train-subtitle" },
            icon(tractionIcon(loco.type), "icon-sm"),
            h("span", null, loco.name),
          )
        : undefined,
      thumb: loco ? h("span", { className: "thumb-crop" }, locoPicture(loco, 30)) : undefined,
      body,
      footer: [
        footerButton({
          label: t.editCars,
          icon: "edit",
          kind: "secondary",
          className: "train-edit-cars-btn",
          onClick: () => openEditConsistSheet(container, state, trainId, render),
        }),
        footerButton({
          label: t.replace,
          icon: "wrench",
          kind: "secondary",
          className: "train-replace-btn",
          onClick: () => openReplaceLocoPanel(container, state, trainId, handlers),
        }),
        sellBtn,
      ],
      onClose: () => {
        if (picking) handlers.cancelPickStationOnMap?.();
        picking = false;
      },
    });
  };

  render();
}

/** "Edit cars" (PLAN Phase 15) on the buy wizard's consist builder: applies immediately when the
 * train is at a station, otherwise queues for the next stop (`editConsist` decides). */
function openEditConsistSheet(
  container: HTMLElement,
  state: GameState,
  trainId: number,
  onDone: () => void,
): void {
  const train = state.trains.find((x) => x.id === trainId);
  if (!train) return;
  const loco = locomotiveById(train.locoModelId);
  if (!loco) return;
  const year = currentYear(state);
  let cars: CargoType[] = train.cars.map((c) => c.cargoType);
  const w = strings.trains.wizard;

  const sheet = openSheet(container, {
    title: strings.trains.editCarsTitle,
    subtitle: train.name,
    className: "wizard-sheet",
  });

  const footer = (): void => {
    const plan = computeEditConsistPlan(state, trainId, cars);
    const affordable = plan.netCost <= state.cash;
    sheet.footer.replaceChildren(
      ...(train.status !== "loading"
        ? [
            h(
              "span",
              { className: "footer-note" },
              icon("info", "icon-sm"),
              strings.trains.consistChangeQueued,
            ),
          ]
        : []),
      footerButton({
        label: strings.ui.close,
        kind: "secondary",
        onClick: () => sheet.close(),
      }),
      footerButton({
        label: `${strings.trains.confirm} · ${formatMoney(plan.netCost)}`,
        kind: "primary",
        className: "panel-action-build",
        disabled: !plan.valid || !affordable,
        onClick: () => {
          const result = editConsist(state, trainId, cars);
          if (!result.ok) {
            showToast(container, strings.build.reasons[result.reason], "warn");
            return;
          }
          sheet.close();
          onDone();
        },
      }),
    );
  };

  sheet.body.replaceChildren(
    consistBuilder({
      loco,
      year,
      getCars: () => cars,
      setCars: (next) => {
        cars = next;
        footer();
      },
      supply: {},
      suggest: false,
    }),
  );
  void w;
  footer();
}

/** Locomotive picker for "Replace" (SPEC §7.6: pay the new price minus a trade-in credit, keep cars
 * and orders). Tapping a model replaces immediately. */
function openReplaceLocoPanel(
  container: HTMLElement,
  state: GameState,
  trainId: number,
  handlers: TrainPanelHandlers,
): void {
  const train = state.trains.find((x) => x.id === trainId);
  if (!train) return;
  const year = currentYear(state);
  const available = buyableLocomotivesIn(year);
  const r = strings.trains.replacePanel;

  const cards = available
    .slice()
    .reverse()
    .map((loco) => {
      const plan = computeReplaceLocoPlan(state, trainId, loco.id);
      const isCurrent = loco.id === train.locoModelId;
      return engineCard({
        loco,
        year,
        selected: isCurrent,
        disabled: isCurrent || !plan.valid || plan.netCost > state.cash,
        lockedReason: !plan.valid && !isCurrent ? r.cant : undefined,
        trailing: isCurrent ? r.current : plan.valid ? r.netCost(formatMoney(plan.netCost)) : "—",
        meta:
          plan.valid && !isCurrent
            ? `${strings.trains.tradeInCredit} ${formatMoney(plan.tradeInValue)}`
            : `${strings.trains.locoTypes[loco.type]}${isNewModel(loco, year) ? "" : ""}`,
        onClick: () => {
          const result = replaceLocomotive(state, trainId, loco.id);
          if (!result.ok) {
            showToast(container, strings.build.reasons[result.reason], "warn");
            return;
          }
          openTrainPanel(container, state, trainId, handlers);
        },
      });
    });

  openPanel(container, {
    key: `replace:${trainId}`,
    title: r.title,
    subtitle: r.subtitle,
    body: [h("div", { className: "eng-list replace-list" }, ...cards)],
    footer: [
      footerButton({
        label: strings.ui.back,
        icon: "back",
        kind: "secondary",
        onClick: () => openTrainPanel(container, state, trainId, handlers),
      }),
    ],
  });
}
