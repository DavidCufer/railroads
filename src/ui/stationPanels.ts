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
import type { StationImprovementType, StationType } from "../data/stations";
import { improvementHint, stationTypeBenefit, terminalHint } from "./stationUpgrades";
import { locomotiveById } from "../data/trains";
import {
  buildImprovement,
  buildStation,
  buildEngineShed,
  computeEngineShedPlan,
  buildWaterTower,
  computeImprovementPlan,
  computeStationBuildPlan,
  computeStationUpgradePlan,
  computeWaterTowerPlan,
  renameStation,
  upgradeStation,
  demolishStation,
  stationRefund,
} from "../sim/commands";
import { previewStationEconomy, stationStorageCap, type StationEconomy } from "../sim/stations";
import type { Station } from "../sim/stations/types";
import type { GameState } from "../sim/state";
import { calendarFromTicks } from "../sim/time";
import { STATION_STAFF } from "../data/economy";
import { stationMonthlyCost } from "../sim/finance/costs";
import { cargoChip, cargoDemandTile } from "./infoPanels";
import { h } from "./h";
import { acceptorsOf } from "../sim/stations/acceptors";
import { INDUSTRIES } from "../data/industries";
import { locoArt } from "./trainArt";
import { icon, type IconName } from "./icons";
import { cardList, cardRow } from "./components/cardRow";
import { emptyState } from "./components/emptyState";
import { footerButton } from "./components/footer";
import { section } from "./components/section";
import { statRow, statTile } from "./components/statTile";
import { tabs } from "./components/tabs";
import type { Tone } from "./components/tone";
import { closePanel, openPanel } from "./panel";
import { strings } from "./strings";
import { formatMoney } from "./format";
import { showToast } from "./toast";

const STATION_TYPE_KEY = "railroads.lastStationType";
let lastStationType: StationType | null = null;

/** The type the Station tool opens with: the last one built, else the everyday "Station" (Depot is a
 * freight-siding size — PLAYTEST-1 Bug 8). */
function rememberedStationType(): StationType {
  if (lastStationType) return lastStationType;
  try {
    const stored = localStorage.getItem(STATION_TYPE_KEY);
    if (stored && (STATION_TYPES as readonly string[]).includes(stored)) {
      return stored as StationType;
    }
  } catch {
    // storage unavailable — fall through to the default
  }
  return "station";
}

function rememberStationType(type: StationType): void {
  lastStationType = type;
  try {
    localStorage.setItem(STATION_TYPE_KEY, type);
  } catch {
    // ignore: the in-memory value still applies this session
  }
}

function currentYear(state: GameState): number {
  return calendarFromTicks(state.startYear, state.ticks).year;
}

/** A supply chip (STYLE §6: "supplies ... with waiting amounts as a thin bar under each chip") —
 * the per-month rate as a cargo chip, with a thin waiting-cargo bar underneath (plus a literal
 * "N waiting" line, PLAN Phase 16 — a bar alone doesn't say *how much* is piled up) when this
 * station has some of that cargo waiting for pickup. */
function supplyChipStack(
  container: HTMLElement,
  cargo: CargoType,
  ratePerMonth: number,
  waiting?: { amount: number; cap: number },
): HTMLElement {
  const children: Node[] = [
    cargoChip(container, cargo, ratePerMonth, strings.station.supplyRate(CARGO[cargo].unit)),
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
    if (waiting.amount > 0.5) {
      children.push(
        h(
          "span",
          { className: "cargo-waiting-label" },
          strings.station.waitingCount(String(Math.round(waiting.amount))),
        ),
      );
    }
  }
  return h("div", { className: "supply-chip-stack" }, ...children);
}

/** Supplies/Demands (STYLE §6): pictogram chips above all actions. `waitingPile`/`station`
 * (only known for an already-built station, not the placement preview) attach a thin waiting-
 * cargo bar under each matching supply chip instead of a separate "Waiting cargo" section —
 * `station` (rather than a single shared cap) is needed because PLAN Phase 16's real per-cargo
 * capacities mean each cargo's storage cap is now different (`stationStorageCap`). */
function economyBody(
  container: HTMLElement,
  economy: StationEconomy,
  waitingPile?: Partial<Record<CargoType, { amount: number }>>,
  station?: Station,
  acceptedBy?: (cargo: CargoType) => { text: string; badge?: IconName } | undefined,
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

  return [
    section(
      strings.station.supplies,
      [
        supplyEntries.length > 0 || extraWaiting.length > 0
          ? h(
              "div",
              { className: "chip-row" },
              ...supplyEntries.map(([cargo, amount]) =>
                supplyChipStack(
                  container,
                  cargo,
                  amount,
                  station
                    ? {
                        amount: waitingPile?.[cargo]?.amount ?? 0,
                        cap: stationStorageCap(station, cargo),
                      }
                    : undefined,
                ),
              ),
              ...extraWaiting.map((cargo) =>
                supplyChipStack(container, cargo, 0, {
                  amount: waitingPile?.[cargo]?.amount ?? 0,
                  cap: station ? stationStorageCap(station, cargo) : 1,
                }),
              ),
            )
          : emptyState(strings.station.noSupplies, "cargo"),
      ],
      strings.station.perMonthNote,
    ),
    section(strings.station.accepts, [
      acceptEntries.length > 0
        ? h(
            "div",
            { className: "chip-row" },
            ...acceptEntries.map(([cargo, points]) =>
              cargoDemandTile(container, cargo, points, false, acceptedBy?.(cargo)),
            ),
          )
        : emptyState(strings.station.noDemands, "cargo"),
    ]),
  ];
}

/** "Waiting for transfer: 40 t coal from Idrija" (PLAN Phase 18 C): the Warehouse hub's transfer
 * stock, grouped by cargo and where it was first loaded. Shown for any station that has a
 * Warehouse (with a hint when empty) or still holds transfer cargo. */
function transferSection(container: HTMLElement, state: GameState, station: Station): Node[] {
  const lots = state.stationTransfer.get(station.id) ?? [];
  const hasWarehouse = station.improvements.includes("warehouse");
  if (!hasWarehouse && lots.length === 0) return [];
  const groups = new Map<string, { cargo: CargoType; units: number; origin: string }>();
  for (const lot of lots) {
    const origin =
      state.stations.find((st) => st.id === lot.originStationId)?.name ??
      strings.station.unknownOrigin;
    const key = `${lot.cargoType}|${origin}`;
    const g = groups.get(key) ?? { cargo: lot.cargoType, units: 0, origin };
    g.units += lot.units;
    groups.set(key, g);
  }
  if (groups.size === 0) {
    return [
      section(strings.station.transferTitle, [
        emptyState(strings.station.transferEmpty, "warehouse"),
      ]),
    ];
  }
  const rows = [...groups.values()].map((g) => {
    const def = CARGO[g.cargo];
    return h(
      "div",
      { className: "panel-row transfer-row" },
      cargoChip(container, g.cargo, Math.round(g.units), def.unit ? ` ${def.unit}` : ""),
      h("span", null, strings.station.transferFrom(def.name.toLowerCase(), g.origin)),
    );
  });
  return [section(strings.station.transferTitle, rows)];
}

const TYPE_ICONS: Record<StationType, IconName> = {
  depot: "depot",
  station: "station",
  terminal: "terminal",
};

/** The station type's numbers as stat tiles (STYLE §8.2): catchment, max train length, storage per
 * cargo, upkeep per month (building + staff wages). */
function statsGrid(type: StationType, year: number): Node {
  const def = STATION_TYPE_DEFS[type];
  const side = def.catchmentRadius * 2 + 1;
  const upkeep = stationMonthlyCost(type, year);
  return statRow(
    statTile({ icon: "target", value: `${side}×${side}`, caption: strings.station.catchment }),
    statTile({
      icon: "trains",
      value: String(def.maxTrainLength),
      caption: strings.station.maxTrainLength,
    }),
    statTile({
      icon: "cargo",
      value: String(def.storagePerCargo),
      caption: strings.station.storagePerCargo,
    }),
    statTile({
      icon: "coin",
      value: formatMoney(upkeep.total),
      caption: strings.station.monthlyMaintenance,
      title: strings.station.upkeepBreakdown(
        formatMoney(upkeep.upkeep),
        STATION_STAFF[type],
        formatMoney(upkeep.staff),
      ),
    }),
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
  let selectedType: StationType = rememberedStationType();

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
      icon(TYPE_ICONS[type], "type-icon"),
      h("span", null, strings.station.types[type]),
      h("span", { className: "cost" }, formatMoney(def.cost)),
      h(
        "span",
        { className: "type-platforms", title: strings.station.platforms(def.trainCapacity) },
        ...Array.from({ length: def.trainCapacity }, () => h("i", { className: "plat-pip" })),
        h("b", null, String(def.trainCapacity)),
      ),
    );
    typeButtonByType.set(type, btn);
    return btn;
  });

  const statsEl = h("div", { className: "station-stats" });
  const economyEl = h("div", { className: "station-economy" });
  const buildBtn = footerButton({
    kind: "primary",
    label: strings.station.build,
    className: "panel-action-build",
  });
  const cancelBtn = footerButton({
    icon: "close",
    ariaLabel: strings.ui.close,
    className: "panel-action-cancel",
    onClick: () => closePanel(),
  });

  buildBtn.addEventListener("click", () => {
    const result = buildStation(state, tile, selectedType);
    if (!result.ok) {
      showToast(container, strings.build.reasons[result.reason], "warn");
      return;
    }
    rememberStationType(selectedType);
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

    statsEl.replaceChildren(statsGrid(selectedType, year));
    economyEl.replaceChildren(...economyBody(container, economy));
    buildBtn.replaceChildren(
      icon("hammer", "icon-sm"),
      h("span", null, `${strings.station.build} · ${formatMoney(plan.cost)}`),
    );
    buildBtn.disabled = !plan.valid || !affordable;

    callbacks.onPreview(tile, selectedType, plan.valid);
  }

  openPanel(container, {
    title: strings.station.newStationTitle,
    thumb: icon("station"),
    body: [h("div", { className: "station-type-picker" }, ...typeButtons), statsEl, economyEl],
    footer: [buildBtn, cancelBtn],
    onClose: () => callbacks.onClose(),
  });

  update();
}

/** Phase 29 D: "Accepted by: Trieste Port (export)" — and a badge when only industries accept the cargo. */
function acceptedBySource(
  state: GameState,
  station: Station,
  cargo: CargoType,
): { text: string; badge?: IconName } | undefined {
  const year = calendarFromTicks(state.startYear, state.ticks).year;
  const list = acceptorsOf(state.map, state.cities, state.industries, station, cargo, year);
  if (list.length === 0) return undefined;
  const s = strings.station.acceptedBy;
  const names = list.map((a) => {
    if (a.kind === "city") return s.city(state.cities[a.id]?.name ?? strings.fallback.place);
    const ind = state.industries[a.id];
    const near = (ind && nearestCityName(state, ind.y * state.map.width + ind.x)) ?? "";
    return s.industry(near, INDUSTRIES[a.type].name, a.type === "port");
  });
  const industries = list.filter((a) => a.kind === "industry");
  const onlyIndustries = industries.length === list.length;
  const first = industries[0];
  const badge: IconName | undefined =
    onlyIndustries && first?.kind === "industry"
      ? first.type === "port"
        ? "anchor"
        : "factory"
      : undefined;
  return { text: s.text(names), ...(badge ? { badge } : {}) };
}

type StationTab = "cargo" | "trains" | "build";

function nearestCityName(state: GameState, tile: number): string | null {
  const width = state.map.width;
  const tx = tile % width;
  const ty = Math.floor(tile / width);
  let best: { name: string; d: number } | null = null;
  for (const city of state.cities) {
    for (const ct of city.tiles) {
      const d = Math.hypot((ct % width) - tx, Math.floor(ct / width) - ty);
      if (!best || d < best.d) best = { name: city.name, d };
    }
  }
  return best?.name ?? null;
}

const STATUS_ICONS: Record<string, { icon: IconName; tone: Tone }> = {
  moving: { icon: "play", tone: "steel" },
  loading: { icon: "cargo", tone: "brass" },
  waitingForBlock: { icon: "signal", tone: "signal" },
  waitingForStation: { icon: "signal", tone: "signal" },
  noRoute: { icon: "warning", tone: "signal" },
  stuck: { icon: "warning", tone: "signal" },
  broken: { icon: "wrench", tone: "signal" },
};

/** Trains that call here as card rows: loco side view, name, status icon + next stop. */
function trainsTab(state: GameState, station: Station, handlers?: StationPanelHandlers): Node {
  const serving = state.trains.filter((t) => t.orders.some((o) => o.stationId === station.id));
  if (serving.length === 0) return emptyState(strings.trains.none, "trains");
  const hint = terminalHint(state, station);
  const list = cardList(
    ...serving.map((t) => {
      const st = STATUS_ICONS[t.status] ?? STATUS_ICONS["moving"]!;
      const next = state.stations.find((x) => x.id === t.orders[t.currentOrderIndex]?.stationId);
      const loco = locomotiveById(t.locoModelId);
      const statusIcon = icon(st.icon, `icon-sm tone-${st.tone}`);
      return cardRow({
        className: "train-loco-btn",
        thumb: h("div", { className: "eng-thumb" }, loco ? locoArt(loco, 32) : icon("steam")),
        title: t.name,
        meta: h(
          "span",
          { className: "card-meta-inline" },
          statusIcon,
          next
            ? `${strings.trains.statusNames[t.status]} · ${next.name}`
            : strings.trains.statusNames[t.status],
        ),
        chevron: true,
        onClick: () => handlers?.onOpenTrain?.(t.id),
      });
    }),
  );
  return hint ? h("div", { className: "station-trains" }, hintLine(hint), list) : list;
}

/** A one-line advisory (icon + text) used for "Terminal recommended". */
function hintLine(text: string): HTMLElement {
  return h("div", { className: "station-hint" }, icon("warning", "icon-sm"), h("span", null, text));
}

const IMPROVEMENT_ICONS: Record<StationImprovementType, IconName> = {
  postOffice: "news",
  hotel: "hotel",
  warehouse: "warehouse",
  coldStorage: "snowflake",
  freightYard: "freightYard",
  livestockPens: "pens",
};

/** Build tab: upgrade card, improvements grid (built ones checked), water tower, engine shed, stats. */
function buildTab(
  container: HTMLElement,
  state: GameState,
  station: Station,
  render: () => void,
  handlers?: StationPanelHandlers,
): Node[] {
  const stationId = station.id;
  const out: Node[] = [];
  const nextType = STATION_TYPES[STATION_TYPES.indexOf(station.type) + 1] as
    StationType | undefined;
  const terminalAdvice = terminalHint(state, station);
  if (terminalAdvice) out.push(hintLine(terminalAdvice));
  if (nextType) {
    const plan = computeStationUpgradePlan(state, stationId, nextType);
    out.push(
      h(
        "button",
        {
          className: "station-upgrade-btn upgrade-card",
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
        icon(TYPE_ICONS[nextType], "upgrade-icon"),
        h(
          "span",
          { className: "upgrade-text" },
          h(
            "span",
            { className: "upgrade-title" },
            `${strings.station.upgradeToPrefix}${strings.station.types[nextType]}`,
          ),
          h("span", { className: "upgrade-cost" }, formatMoney(plan.cost)),
          h("span", { className: "upgrade-benefit" }, stationTypeBenefit(nextType)),
        ),
        icon("arrowUp", "icon-sm"),
      ),
    );
  }

  /** One improvement row: icon, name, one-line benefit, optional hint, cost / check on the right. */
  const improvementRow = (opts: {
    className: string;
    icon: IconName;
    name: string;
    benefit: string;
    hint?: { text: string; helps: boolean } | undefined;
    trailing: Node | string;
    built?: boolean;
    onClick?: () => void;
    disabled?: boolean;
  }): HTMLElement =>
    cardRow({
      className: `${opts.className}${opts.built ? " done" : ""}`,
      thumb: icon(opts.icon, opts.built ? "icon-sm tone-go" : "icon-sm tone-brass"),
      title: opts.name,
      meta: h(
        "span",
        { className: "improvement-meta" },
        h("span", null, opts.benefit),
        opts.hint
          ? h(
              "span",
              { className: `improvement-hint ${opts.hint.helps ? "helps" : "warns"}` },
              opts.hint.text,
            )
          : null,
      ),
      trailing: opts.trailing,
      ...(opts.onClick ? { onClick: opts.onClick } : {}),
      ...(opts.disabled !== undefined ? { disabled: opts.disabled } : {}),
    });
  const checkMark = (): Node => icon("check", "icon-sm tone-go");

  const rows: HTMLElement[] = STATION_IMPROVEMENT_TYPES.map((type) => {
    const def = STATION_IMPROVEMENTS[type];
    const common = {
      className: "station-improvement-btn",
      icon: IMPROVEMENT_ICONS[type],
      name: strings.station.improvementNames[type],
      benefit: strings.station.improvementBenefit[type],
    };
    if (station.improvements.includes(type)) {
      return improvementRow({ ...common, built: true, trailing: checkMark() });
    }
    const plan = computeImprovementPlan(state, stationId, type);
    const notYetAvailable = def.availableYear !== undefined && !plan.valid && plan.cost === 0;
    return improvementRow({
      ...common,
      hint: improvementHint(state, station, type),
      trailing: notYetAvailable
        ? strings.station.improvementAvailableFrom(def.availableYear as number)
        : formatMoney(plan.cost),
      disabled: !plan.valid || plan.cost > state.cash,
      onClick: () => {
        const result = buildImprovement(state, stationId, type);
        if (!result.ok) {
          showToast(container, strings.build.reasons[result.reason], "warn");
          return;
        }
        render();
      },
    });
  });

  if (station.hasWaterTower) {
    rows.push(
      improvementRow({
        className: "station-water-tower-btn",
        icon: "waterTower",
        name: strings.station.waterTowerBuilt,
        benefit: strings.station.waterTowerBenefit,
        built: true,
        trailing: checkMark(),
      }),
    );
  } else {
    const waterTowerPlan = computeWaterTowerPlan(state, stationId);
    rows.push(
      improvementRow({
        className: "station-water-tower-btn",
        icon: "waterTower",
        name: strings.station.buildWaterTower,
        benefit: strings.station.waterTowerBenefit,
        trailing: formatMoney(waterTowerPlan.cost),
        disabled: waterTowerPlan.cost > state.cash,
        onClick: () => {
          const result = buildWaterTower(state, stationId);
          if (!result.ok) {
            showToast(container, strings.build.reasons[result.reason], "warn");
            return;
          }
          render();
        },
      }),
    );
  }
  if (station.hasEngineShed) {
    rows.push(
      improvementRow({
        className: "station-engine-shed-row",
        icon: "shed",
        name: strings.station.engineShedBuilt,
        benefit: strings.station.engineShedBenefit,
        built: true,
        trailing: checkMark(),
      }),
    );
  } else {
    const shedPlan = computeEngineShedPlan(state, stationId);
    rows.push(
      improvementRow({
        className: "station-engine-shed-row",
        icon: "shed",
        name: strings.station.buildEngineShed,
        benefit: strings.station.engineShedBenefit,
        trailing: formatMoney(shedPlan.cost),
        disabled: shedPlan.cost > state.cash,
        onClick: () => {
          const result = buildEngineShed(state, stationId);
          if (!result.ok) {
            showToast(container, strings.build.reasons[result.reason], "warn");
            return;
          }
          render();
        },
      }),
    );
  }
  out.push(section(strings.station.improvements, [cardList(...rows)]));
  out.push(
    section(strings.ui.stats, [
      statsGrid(station.type, calendarFromTicks(state.startYear, state.ticks).year),
    ]),
  );
  out.push(demolishButton(container, state, station, render, handlers));
  return out;
}

/** Station whose Demolish button has been tapped once (two-tap confirm: demolishing is irreversible). */
let demolishArmed: number | null = null;

function demolishButton(
  container: HTMLElement,
  state: GameState,
  station: Station,
  render: () => void,
  handlers?: StationPanelHandlers,
): Node {
  const refund = formatMoney(stationRefund(state, station));
  const users = state.trains.filter((t) => t.orders.some((o) => o.stationId === station.id)).length;
  const armed = demolishArmed === station.id;
  const p = strings.station.demolish;
  const btn = footerButton({
    icon: "trash",
    label: armed ? p.confirm(refund) : p.label(refund),
    kind: "danger",
    className: "station-demolish-btn btn-danger",
    onClick: () => {
      if (!armed) {
        demolishArmed = station.id;
        window.setTimeout(() => {
          if (demolishArmed === station.id) {
            demolishArmed = null;
            if (btn.isConnected) render();
          }
        }, 4000);
        render();
        return;
      }
      demolishArmed = null;
      const result = demolishStation(state, station.id);
      if (!result.ok) {
        showToast(container, strings.build.reasons[result.reason], "warn");
        render();
        return;
      }
      closePanel();
      handlers?.onDemolished?.(station.tile);
    },
  });
  return h(
    "div",
    { className: "station-demolish" },
    users > 0 ? h("p", { className: "station-demolish-note" }, p.note(users)) : null,
    btn,
  );
}

export interface StationPanelHandlers {
  /** Fired when the player taps "Buy train" — only shown when the station has an Engine Shed. */
  onBuyTrain: () => void;
  /** Fired when the player taps a train in the panel's Trains list (STYLE §6). */
  onOpenTrain: (trainId: number) => void;
  /** Fired after the station was demolished from the Build tab (the map redraws its tile). */
  onDemolished?: (tile: number) => void;
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
  let tab: StationTab = "cargo";

  const render = (): void => {
    const station = state.stations.find((s) => s.id === stationId);
    if (!station) return;
    const economy = state.stationEconomy.get(stationId);

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

    if (tab === "cargo") {
      if (economy) {
        const pile = state.stationCargo.get(stationId);
        body.push(
          ...economyBody(container, economy, pile, station, (cargo) =>
            acceptedBySource(state, station, cargo),
          ),
        );
      }
      body.push(...transferSection(container, state, station));
    } else if (tab === "trains") {
      body.push(trainsTab(state, station, handlers));
    } else {
      body.push(...buildTab(container, state, station, render, handlers));
    }

    const footer: Node[] = [];
    if (station.hasEngineShed && handlers) {
      footer.push(
        footerButton({
          kind: "primary",
          icon: "trains",
          label: strings.trains.buyTitle,
          className: "station-buy-train-btn",
          onClick: () => handlers.onBuyTrain(),
        }),
      );
    }

    const nearestCity = nearestCityName(state, station.tile);
    const subtitle = `${strings.station.types[station.type]}${nearestCity ? ` · ${nearestCity}` : ""}`;
    const tabRow = tabs(
      [
        { id: "cargo", label: strings.station.tabs.cargo, icon: "cargo" },
        { id: "trains", label: strings.station.tabs.trains, icon: "trains" },
        { id: "build", label: strings.station.tabs.build, icon: "hammer" },
      ] as const,
      tab,
      (id) => {
        tab = id;
        render();
      },
    );

    openPanel(container, {
      title: titleNode,
      subtitle,
      thumb: icon(TYPE_ICONS[station.type]),
      tabs: tabRow,
      body,
      footer,
      key: `station:${stationId}:${tab}`,
    });
    if (editingName) {
      const input = container.querySelector<HTMLInputElement>(".station-name-input");
      input?.focus();
      input?.select();
    }
  };

  render();
}
