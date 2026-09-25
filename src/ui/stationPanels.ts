/**
 * Station mode panels (SPEC §6.1, §6.3, PLAN Phase 5):
 * - `openStationPlacementPanel` — tapping a track tile in Station mode: type picker
 *   (Depot/Station/Terminal, live cost) plus a supplies/accepts preview, before confirming.
 * - `openStationPanel` — tapping a built station (Station or Info mode): name + rename, type +
 *   upgrade, supplies/accepts, a waiting-cargo placeholder (Phase 7 does real cargo flow).
 */
import { CARGO, CARGO_TYPES, type CargoType } from "../data/cargo";
import { STATION_ACCEPTANCE_THRESHOLD, STATION_TYPES, STATION_TYPE_DEFS } from "../data/stations";
import type { StationType } from "../data/stations";
import {
  buildStation,
  buildWaterTower,
  computeStationBuildPlan,
  computeStationUpgradePlan,
  computeWaterTowerPlan,
  renameStation,
  upgradeStation,
} from "../sim/commands";
import { previewStationEconomy, type StationEconomy } from "../sim/stations";
import type { GameState } from "../sim/state";
import { calendarFromTicks } from "../sim/time";
import { cargoChip, row } from "./infoPanels";
import { h } from "./h";
import { closePanel, openPanel } from "./panel";
import { strings } from "./strings";
import { formatMoney } from "./format";
import { showToast } from "./toast";

function currentYear(state: GameState): number {
  return calendarFromTicks(state.startYear, state.ticks).year;
}

function economyBody(economy: StationEconomy): Node[] {
  const supplyEntries = (Object.entries(economy.supply) as Array<[CargoType, number]>).filter(
    ([, v]) => v > 0.05,
  );
  const acceptEntries = (Object.entries(economy.acceptPoints) as Array<[CargoType, number]>).sort(
    (a, b) => CARGO_TYPES.indexOf(a[0]) - CARGO_TYPES.indexOf(b[0]),
  );

  const body: Node[] = [];
  body.push(h("div", { className: "panel-section-title" }, strings.station.supplies));
  body.push(
    supplyEntries.length > 0
      ? h(
          "div",
          { className: "panel-row", style: { flexWrap: "wrap" } },
          ...supplyEntries.map(([cargo, amount]) =>
            cargoChip(cargo, Math.round(amount * 10) / 10, strings.station.perMonth),
          ),
        )
      : h("div", { className: "panel-row" }, "—"),
  );
  body.push(h("div", { className: "panel-section-title" }, strings.station.accepts));
  body.push(
    acceptEntries.length > 0
      ? h(
          "div",
          { className: "panel-row", style: { flexWrap: "wrap" } },
          ...acceptEntries.map(([cargo, points]) =>
            cargoChip(cargo, points, "", points < STATION_ACCEPTANCE_THRESHOLD),
          ),
        )
      : h("div", { className: "panel-row" }, "—"),
  );
  return body;
}

/** Waiting-cargo bars (SPEC §6.3, §10.2): amount vs. this station type's per-cargo storage cap. */
function waitingCargoBody(state: GameState, stationId: number, type: StationType): Node[] {
  const pile = state.stationCargo.get(stationId);
  const cap = STATION_TYPE_DEFS[type].storagePerCargo;
  const entries = CARGO_TYPES.filter((c) => (pile?.[c]?.amount ?? 0) > 0.5);
  if (entries.length === 0) {
    return [h("div", { className: "panel-row" }, strings.station.waitingCargoNone)];
  }
  return entries.map((cargo) => {
    const amount = pile?.[cargo]?.amount ?? 0;
    const pct = Math.max(0, Math.min(100, (amount / cap) * 100));
    return h(
      "div",
      { className: "cargo-bar-row" },
      h("span", { className: "cargo-bar-label" }, CARGO[cargo].name),
      h(
        "div",
        { className: "cargo-bar-track" },
        h("div", {
          className: "cargo-bar-fill",
          style: { width: `${pct}%`, background: CARGO[cargo].color },
        }),
      ),
      h("span", { className: "cargo-bar-value" }, `${Math.round(amount)}/${cap}`),
    );
  });
}

function statsRows(type: StationType): Node[] {
  const def = STATION_TYPE_DEFS[type];
  return [
    row(strings.station.catchment, `${def.catchmentRadius * 2 + 1}×${def.catchmentRadius * 2 + 1}`),
    row(strings.station.maxTrainLength, String(def.maxTrainLength)),
    row(strings.station.storagePerCargo, String(def.storagePerCargo)),
    row(strings.station.monthlyMaintenance, formatMoney(def.monthlyMaintenance)),
  ];
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
    strings.station.cancel,
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

    statsEl.replaceChildren(...statsRows(selectedType));
    economyEl.replaceChildren(...economyBody(economy));
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
}

/** Opens the management panel for an already-built station (Station or Info mode tap). */
export function openStationPanel(
  container: HTMLElement,
  state: GameState,
  stationId: number,
  handlers?: StationPanelHandlers,
): void {
  const render = (): void => {
    const station = state.stations.find((s) => s.id === stationId);
    if (!station) return;
    const economy = state.stationEconomy.get(stationId);
    const nextType = STATION_TYPES[STATION_TYPES.indexOf(station.type) + 1] as
      StationType | undefined;

    const body: Node[] = [
      h(
        "div",
        { className: "panel-row" },
        h("input", {
          className: "station-name-input",
          type: "text",
          value: station.name,
          "aria-label": strings.station.rename,
          onChange: (e: Event) => {
            const input = e.target as HTMLInputElement;
            const result = renameStation(state, stationId, input.value);
            if (!result.ok) {
              input.value = station.name;
              showToast(container, strings.build.reasons[result.reason], "warn");
              return;
            }
            const titleEl = container.querySelector(".panel-title");
            if (titleEl) titleEl.textContent = station.name;
            input.value = station.name;
          },
        }),
      ),
      row(strings.station.type, strings.station.types[station.type]),
      ...statsRows(station.type),
    ];

    if (station.hasEngineShed) {
      body.push(h("div", { className: "panel-row" }, `⚙ ${strings.station.engineShedFree}`));
      if (handlers) {
        body.push(
          h(
            "button",
            { className: "station-buy-train-btn", onClick: () => handlers.onBuyTrain() },
            strings.trains.buyTitle,
          ),
        );
      }
    }

    if (station.hasWaterTower) {
      body.push(h("div", { className: "panel-row" }, `💧 ${strings.station.waterTowerBuilt}`));
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
          `${strings.station.buildWaterTower} (${formatMoney(waterTowerPlan.cost)})`,
        ),
      );
    }

    if (nextType) {
      const plan = computeStationUpgradePlan(state, stationId, nextType);
      body.push(
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
          `${strings.station.upgradeToPrefix}${strings.station.types[nextType]} (${formatMoney(plan.cost)})`,
        ),
      );
    }

    if (economy) body.push(...economyBody(economy));

    body.push(h("div", { className: "panel-section-title" }, strings.station.waitingCargo));
    body.push(...waitingCargoBody(state, stationId, station.type));

    openPanel(container, { title: station.name, body });
  };

  render();
}
