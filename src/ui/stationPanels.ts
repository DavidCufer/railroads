/**
 * Station mode panels (SPEC §6.1, §6.3, PLAN Phase 5):
 * - `openStationPlacementPanel` — tapping a track tile in Station mode: type picker
 *   (Depot/Station/Terminal, live cost) plus a supplies/accepts preview, before confirming.
 * - `openStationPanel` — tapping a built station (Station or Info mode): name + rename, type +
 *   upgrade, supplies/accepts, a waiting-cargo placeholder (Phase 7 does real cargo flow).
 */
import { CARGO, CARGO_TYPES, type CargoType } from "../data/cargo";
import {
  STATION_IMPROVEMENT_TYPES,
  STATION_IMPROVEMENTS,
  STATION_TYPES,
  STATION_TYPE_DEFS,
} from "../data/stations";
import type { StationType } from "../data/stations";
import {
  buildImprovement,
  buildStation,
  buildWaterTower,
  computeImprovementPlan,
  computeStationBuildPlan,
  computeStationUpgradePlan,
  computeWaterTowerPlan,
  renameStation,
  upgradeStation,
} from "../sim/commands";
import { previewStationEconomy, type StationEconomy } from "../sim/stations";
import type { GameState } from "../sim/state";
import { calendarFromTicks } from "../sim/time";
import { cargoChip, cargoDemandTile, row } from "./infoPanels";
import { h } from "./h";
import { icon } from "./icons";
import { closePanel, openPanel } from "./panel";
import { strings } from "./strings";
import { formatMoney } from "./format";
import { showToast } from "./toast";

function currentYear(state: GameState): number {
  return calendarFromTicks(state.startYear, state.ticks).year;
}

/** A supply chip (STYLE §6: "supplies ... with waiting amounts as a thin bar under each chip") —
 * the per-month rate as a cargo chip, with a thin waiting-cargo bar underneath when this station
 * has some of that cargo piled up waiting for pickup. */
function supplyChipStack(
  container: HTMLElement,
  cargo: CargoType,
  ratePerMonth: number,
  waiting?: { amount: number; cap: number },
): HTMLElement {
  const children: Node[] = [
    cargoChip(container, cargo, Math.round(ratePerMonth * 10) / 10, strings.station.perMonth),
  ];
  if (waiting && waiting.cap > 0) {
    const pct = Math.max(0, Math.min(100, (waiting.amount / waiting.cap) * 100));
    children.push(
      h(
        "div",
        { className: "cargo-bar-track mini" },
        h("div", {
          className: "cargo-bar-fill",
          style: { width: `${pct}%`, background: CARGO[cargo].color },
        }),
      ),
    );
  }
  return h("div", { className: "supply-chip-stack" }, ...children);
}

/** Supplies/Demands (STYLE §6): pictogram chips above all actions. `waitingPile`/`waitingCap`
 * (only known for an already-built station, not the placement preview) attach a thin waiting-
 * cargo bar under each matching supply chip instead of a separate "Waiting cargo" section. */
function economyBody(
  container: HTMLElement,
  economy: StationEconomy,
  waitingPile?: Partial<Record<CargoType, { amount: number }>>,
  waitingCap?: number,
): Node[] {
  const supplyEntries = (Object.entries(economy.supply) as Array<[CargoType, number]>).filter(
    ([, v]) => v > 0.05,
  );
  const acceptEntries = (Object.entries(economy.acceptPoints) as Array<[CargoType, number]>).sort(
    (a, b) => CARGO_TYPES.indexOf(a[0]) - CARGO_TYPES.indexOf(b[0]),
  );
  const suppliedCargo = new Set(supplyEntries.map(([c]) => c));
  const extraWaiting = waitingPile
    ? CARGO_TYPES.filter((c) => !suppliedCargo.has(c) && (waitingPile[c]?.amount ?? 0) > 0.5)
    : [];

  const body: Node[] = [];
  body.push(h("div", { className: "panel-section-title" }, strings.station.supplies));
  body.push(
    supplyEntries.length > 0 || extraWaiting.length > 0
      ? h(
          "div",
          { className: "chip-row" },
          ...supplyEntries.map(([cargo, amount]) =>
            supplyChipStack(
              container,
              cargo,
              amount,
              waitingCap
                ? { amount: waitingPile?.[cargo]?.amount ?? 0, cap: waitingCap }
                : undefined,
            ),
          ),
          ...extraWaiting.map((cargo) =>
            supplyChipStack(container, cargo, 0, {
              amount: waitingPile?.[cargo]?.amount ?? 0,
              cap: waitingCap ?? 1,
            }),
          ),
        )
      : h("div", { className: "panel-row" }, "—"),
  );
  body.push(h("div", { className: "panel-section-title" }, strings.station.accepts));
  body.push(
    acceptEntries.length > 0
      ? h(
          "div",
          { className: "chip-row" },
          ...acceptEntries.map(([cargo, points]) => cargoDemandTile(container, cargo, points)),
        )
      : h("div", { className: "panel-row" }, "—"),
  );
  return body;
}

/** Compact 2-column key/value grid (STYLE §6: stats at the bottom, below the actionable
 * sections) — type, catchment, max train length, storage/cargo, monthly maintenance. */
function statsGrid(type: StationType): Node {
  const def = STATION_TYPE_DEFS[type];
  return h(
    "div",
    { className: "stats-grid" },
    row(strings.station.type, strings.station.types[type]),
    row(strings.station.catchment, `${def.catchmentRadius * 2 + 1}×${def.catchmentRadius * 2 + 1}`),
    row(strings.station.maxTrainLength, String(def.maxTrainLength)),
    row(strings.station.storagePerCargo, String(def.storagePerCargo)),
    row(strings.station.monthlyMaintenance, formatMoney(def.monthlyMaintenance)),
  );
}

export interface StationPlacementCallbacks {
  /** Fired whenever the selected type changes (including the initial call) so the caller can
   * update the map's catchment-tint overlay. */
  onPreview: (tile: number, type: StationType, ok: boolean) => void;
  /** Fired once the panel closes, for any reason (Build succeeded, Cancel, the panel's own ✕, or
   * the Android back button) — the caller clears its catchment overlay here rather than in each
   * individual close path. */
  onClose: () => void;
}

/** Opens the "New Station" placement panel for `tile` (already validated as a legal site by the
 * caller — SPEC §6.1: straight/diagonal through-track or a dead-end, not already a station). The
 * panel is built once and updated in place as the player taps between types, rather than
 * re-opened (which would replay the slide-in transition on every tap). */
export function openStationPlacementPanel(
  container: HTMLElement,
  state: GameState,
  tile: number,
  callbacks: StationPlacementCallbacks,
): void {
  let selectedType: StationType = "depot";

  const typeButtonByType = new Map<StationType, HTMLButtonElement>();
  const typeButtons = STATION_TYPES.map((type) => {
    const def = STATION_TYPE_DEFS[type];
    const btn = h(
      "button",
      {
        className: "station-type-btn",
        onClick: () => {
          selectedType = type;
          update();
        },
      },
      h("span", null, strings.station.types[type]),
      h("span", { className: "cost" }, formatMoney(def.cost)),
    );
    typeButtonByType.set(type, btn);
    return btn;
  });

  const statsEl = h("div", { className: "station-stats" });
  const economyEl = h("div", { className: "station-economy" });
  const buildBtn = h("button", { className: "panel-action-build" });
  const cancelBtn = h(
    "button",
    {
      className: "panel-action-cancel",
      "aria-label": strings.ui.close,
      onClick: () => closePanel(),
    },
    icon("close"),
  );

  buildBtn.addEventListener("click", () => {
    const result = buildStation(state, tile, selectedType);
    if (!result.ok) {
      showToast(container, strings.build.reasons[result.reason], "warn");
      return;
    }
    closePanel();
  });

  function update(): void {
    for (const [type, btn] of typeButtonByType)
      btn.classList.toggle("active", type === selectedType);

    const year = currentYear(state);
    const plan = computeStationBuildPlan(state, tile, selectedType);
    const affordable = plan.cost <= state.cash;
    const economy = previewStationEconomy(
      state.map,
      state.cities,
      state.industries,
      state.stations,
      tile,
      selectedType,
      year,
    );

    statsEl.replaceChildren(statsGrid(selectedType));
    economyEl.replaceChildren(...economyBody(container, economy));
    buildBtn.textContent = `${strings.station.build} (${formatMoney(plan.cost)})`;
    buildBtn.disabled = !plan.valid || !affordable;

    callbacks.onPreview(tile, selectedType, plan.valid);
  }

  openPanel(container, {
    title: strings.station.newStationTitle,
    body: [h("div", { className: "station-type-picker" }, ...typeButtons), statsEl, economyEl],
    footer: [buildBtn, cancelBtn],
    onClose: () => callbacks.onClose(),
  });

  update();
}

export interface StationPanelHandlers {
  /** Fired when the player taps "Buy train" — only shown when the station has an Engine Shed. */
  onBuyTrain: () => void;
  /** Fired when the player taps a train in the panel's Trains list (STYLE §6). */
  onOpenTrain: (trainId: number) => void;
}

/** Opens the management panel for an already-built station (Station or Info mode tap). The name
 * appears once, as the panel title — STYLE §3's usual plain-text title, plus a small pencil-icon
 * button that swaps it for an inline edit field (Enter/blur commits, Escape cancels). */
export function openStationPanel(
  container: HTMLElement,
  state: GameState,
  stationId: number,
  handlers?: StationPanelHandlers,
): void {
  let editingName = false;

  const render = (): void => {
    const station = state.stations.find((s) => s.id === stationId);
    if (!station) return;
    const economy = state.stationEconomy.get(stationId);
    const nextType = STATION_TYPES[STATION_TYPES.indexOf(station.type) + 1] as
      StationType | undefined;

    const titleNode = editingName
      ? h(
          "div",
          { className: "station-title-row" },
          h("input", {
            className: "station-name-input",
            type: "text",
            value: station.name,
            "aria-label": strings.station.rename,
            onKeydown: (e: KeyboardEvent) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              else if (e.key === "Escape") {
                editingName = false;
                render();
              }
            },
            onBlur: (e: Event) => {
              const input = e.target as HTMLInputElement;
              if (input.value !== station.name) {
                const result = renameStation(state, stationId, input.value);
                if (!result.ok) showToast(container, strings.build.reasons[result.reason], "warn");
              }
              editingName = false;
              render();
            },
          }),
        )
      : h(
          "div",
          { className: "station-title-row" },
          h("span", { className: "station-title-text" }, station.name),
          h(
            "button",
            {
              className: "station-title-edit-btn",
              "aria-label": strings.station.rename,
              onClick: () => {
                editingName = true;
                render();
              },
            },
            icon("edit", "icon-sm"),
          ),
        );

    const body: Node[] = [];

    if (economy) {
      const pile = state.stationCargo.get(stationId);
      const cap = STATION_TYPE_DEFS[station.type].storagePerCargo;
      body.push(...economyBody(container, economy, pile, cap));
    }

    const servingTrains = state.trains.filter((t) =>
      t.orders.some((o) => o.stationId === stationId),
    );
    body.push(h("div", { className: "panel-section-title" }, strings.trains.listTitle));
    body.push(
      servingTrains.length > 0
        ? h(
            "div",
            { className: "train-loco-list" },
            ...servingTrains.map((t) =>
              h(
                "button",
                {
                  className: "train-loco-btn",
                  onClick: () => handlers?.onOpenTrain?.(t.id),
                },
                h("span", null, t.name),
                h("span", { className: "train-loco-stats" }, strings.trains.statusNames[t.status]),
              ),
            ),
          )
        : h("div", { className: "panel-row" }, strings.trains.none),
    );

    body.push(h("div", { className: "panel-section-title" }, strings.station.improvements));
    body.push(
      h(
        "div",
        { className: "action-grid" },
        ...STATION_IMPROVEMENT_TYPES.map((type) => {
          const def = STATION_IMPROVEMENTS[type];
          const built = station.improvements.includes(type);
          if (built) {
            return h(
              "div",
              { className: "action-btn station-improvement-btn done" },
              h(
                "span",
                { className: "action-btn-label" },
                icon("check", "icon-sm"),
                strings.station.improvementNames[type],
              ),
            );
          }
          const plan = computeImprovementPlan(state, stationId, type);
          const notYetAvailable = def.availableYear !== undefined && !plan.valid && plan.cost === 0;
          return h(
            "button",
            {
              className: "action-btn station-improvement-btn",
              disabled: !plan.valid || plan.cost > state.cash,
              onClick: () => {
                const result = buildImprovement(state, stationId, type);
                if (!result.ok) {
                  showToast(container, strings.build.reasons[result.reason], "warn");
                  return;
                }
                render();
              },
            },
            h("span", { className: "action-btn-label" }, strings.station.improvementNames[type]),
            h(
              "span",
              { className: "action-btn-detail" },
              notYetAvailable
                ? strings.station.improvementAvailableFrom(def.availableYear as number)
                : formatMoney(plan.cost),
            ),
          );
        }),
      ),
    );

    if (station.hasEngineShed && handlers) {
      body.push(
        h(
          "button",
          { className: "station-buy-train-btn", onClick: () => handlers.onBuyTrain() },
          icon("trains", "icon-sm"),
          strings.trains.buyTitle,
        ),
      );
    } else if (station.hasEngineShed) {
      body.push(
        h(
          "div",
          { className: "icon-row" },
          icon("shed", "icon-sm"),
          strings.station.engineShedFree,
        ),
      );
    }

    if (station.hasWaterTower) {
      body.push(
        h(
          "div",
          { className: "icon-row" },
          icon("water", "icon-sm"),
          strings.station.waterTowerBuilt,
        ),
      );
    } else {
      const waterTowerPlan = computeWaterTowerPlan(state, stationId);
      body.push(
        h(
          "button",
          {
            className: "station-water-tower-btn",
            disabled: waterTowerPlan.cost > state.cash,
            onClick: () => {
              const result = buildWaterTower(state, stationId);
              if (!result.ok) {
                showToast(container, strings.build.reasons[result.reason], "warn");
                return;
              }
              render();
            },
          },
          icon("water", "icon-sm"),
          `${strings.station.buildWaterTower} (${formatMoney(waterTowerPlan.cost)})`,
        ),
      );
    }

    body.push(h("div", { className: "panel-section-title" }, strings.ui.stats));
    body.push(statsGrid(station.type));

    const footer: Node[] = [];
    if (nextType) {
      const plan = computeStationUpgradePlan(state, stationId, nextType);
      footer.push(
        h(
          "button",
          {
            className: "station-upgrade-btn",
            disabled: plan.cost > state.cash,
            onClick: () => {
              const result = upgradeStation(state, stationId, nextType);
              if (!result.ok) {
                showToast(container, strings.build.reasons[result.reason], "warn");
                return;
              }
              render();
            },
          },
          icon("arrowUp", "icon-sm"),
          `${strings.station.upgradeToPrefix}${strings.station.types[nextType]} (${formatMoney(plan.cost)})`,
        ),
      );
    }

    openPanel(container, { title: titleNode, body, footer });
    if (editingName) {
      const input = container.querySelector<HTMLInputElement>(".station-name-input");
      input?.focus();
      input?.select();
    }
  };

  render();
}
