/**
 * Buy-train "engine shed" wizard (STYLE §11.1): a full-screen sheet with a 3-step stepper —
 * 1 Engine (picture cards + hero with stat bars), 2 Cars (side-view consist builder), 3 Route (the
 * sheet gives way to the side panel so the map is visible; tap stations to add stops).
 */
import type { CargoType } from "../data/cargo";
import {
  buyableLocomotivesIn,
  NEW_LOCOMOTIVE_BADGE_YEARS,
  type LocomotiveDef,
  type LocomotiveType,
} from "../data/trains";
import { LOAN_INCREMENT } from "../data/finance";
import { KM_PER_TILE } from "../data/scale";
import { buyTrain, computeBuyTrainPlan, creditLimit, setOrders, takeLoan } from "../sim/commands";
import type { GameState } from "../sim/state";
import { calendarFromTicks } from "../sim/time";
import type { TrainOrder } from "../sim/trains/types";
import { cardRow } from "./components/cardRow";
import { emptyState } from "./components/emptyState";
import { footerButton } from "./components/footer";
import { consistBuilder, suggestConsists } from "./consistBuilder";
import { formatMoney } from "./format";
import { flashLast, h } from "./h";
import { icon, type IconName } from "./icons";
import { bestOf, engineStats } from "./locoStats";
import { closePanel, openPanel } from "./panel";
import { cargoGaps } from "../sim/trains/cargoGaps";
import { cargoGapLine } from "./cargoGapNote";
import { openRulePicker } from "./rulePicker";
import { RULE_ICONS } from "./routeTimeline";
import { startLive } from "./live";
import { openSheet, type SheetHandle } from "./sheet";
import { formatDistance, loadSettings } from "./settings";
import { playSound } from "./sound";
import { strings } from "./strings";
import { showToast } from "./toast";
import { heroPlate, locoArt, tractionIcon, wheelGlyphEl } from "./trainArt";

export interface BuyTrainHandlers {
  /** Puts the map into "tap a station to add it as a stop" mode; `onPicked` fires once, with the
   * tapped station's id, then picking mode ends on its own. */
  pickStationOnMap: (onPicked: (stationId: number) => void) => void;
  /** Cancels an active `pickStationOnMap` early (toggled off, or the panel closed). */
  cancelPickStationOnMap: () => void;
  onBought?: (trainId: number) => void;
  /** Pans the camera down by `dyScreenPx` screen pixels (negative = back up), so what was centred
   * stays centred in the map area left visible above the route bottom sheet. */
  panCameraBy?: (dyScreenPx: number) => void;
}

type Filter = "all" | LocomotiveType;
const FILTER_ORDER: readonly LocomotiveType[] = ["steam", "diesel", "electric"];

/** Opens the buy-train wizard for a station already confirmed to have an Engine Shed. */
export function openBuyTrainPanel(
  container: HTMLElement,
  state: GameState,
  stationId: number,
  handlers: BuyTrainHandlers,
): void {
  const t = strings.trains;
  const w = t.wizard;
  const year = calendarFromTicks(state.startYear, state.ticks).year;
  const available = buyableLocomotivesIn(year);
  /** Newest first: the newest engine is what the player most likely wants. */
  const listOrder = [...available].sort((a, b) => b.introYear - a.introYear);
  const best = bestOf(available);
  const station = state.stations.find((s) => s.id === stationId);
  const stationName = station?.name ?? "";
  const electrifiedHere = station
    ? state.trackGraph.edgesAt(station.tile).some((e) => e.electrified)
    : false;

  let selected: LocomotiveDef | undefined = listOrder[0];
  let filter: Filter = "all";
  const cars: CargoType[] = [];
  const orders: TrainOrder[] = [];
  let picking = false;
  let sheet: SheetHandle | null = null;
  /** True while we swap sheet <-> panel ourselves, so onClose callbacks don't tear the wizard down. */
  let switching = false;

  const stationLabel = (id: number): string =>
    state.stations.find((s) => s.id === id)?.name ?? strings.fallback.station;
  const priceOf = (loco: LocomotiveDef): number => computeBuyTrainPlan(state, loco.id, []).cost;
  const isLocked = (loco: LocomotiveDef): boolean => loco.type === "electric" && !electrifiedHere;

  /** Cash against the price, with the way out when short (Playtest 2, Bug 5): "Borrow $X" takes the smallest loan
   * that covers it. Refreshed with `update(price)` as the selection changes. */
  function cashStrip(onBorrowed: () => void): { el: HTMLElement; update: (price: number) => void } {
    const el = h("div", { className: "cash-strip", "data-testid": "cash-strip" });
    function update(price: number): void {
      const short = price - state.cash;
      el.classList.toggle("short", short > 0);
      const parts: Node[] = [
        icon("coin", "icon-sm"),
        h("span", { className: "cash-strip-cash tabular" }, `${w.cash} ${formatMoney(state.cash)}`),
      ];
      if (short > 0) {
        const need = Math.ceil(short / LOAN_INCREMENT) * LOAN_INCREMENT;
        const room = creditLimit(state) - state.finance.loans;
        parts.push(
          h("span", { className: "cash-strip-short tabular" }, w.short(formatMoney(short))),
          room >= need
            ? h(
                "button",
                {
                  className: "cash-strip-borrow",
                  "data-testid": "borrow-shortcut",
                  onClick: () => {
                    const r = takeLoan(state, need);
                    if (!r.ok) showToast(container, strings.build.reasons[r.reason], "warn");
                    onBorrowed();
                  },
                },
                icon("arrowUp", "icon-xs"),
                w.borrow(formatMoney(need)),
              )
            : h("span", { className: "cash-strip-maxed" }, w.creditMaxed),
        );
      }
      el.replaceChildren(...parts);
    }
    return { el, update };
  }

  function stopPicking(): void {
    if (!picking) return;
    picking = false;
    handlers.cancelPickStationOnMap();
  }

  /** Screen pixels the camera was panned by to clear the route sheet (undone when it goes away). */
  let sheetPan = 0;
  function unpanForSheet(): void {
    if (sheetPan === 0) return;
    handlers.panCameraBy?.(-sheetPan);
    sheetPan = 0;
  }

  function endWizard(): void {
    routeStepToken++;
    stopPicking();
    unpanForSheet();
  }

  function fitCarsToLoco(): void {
    const loco = selected;
    if (!loco) return;
    if (loco.passengerMailOnly) {
      const kept = cars.filter((c) => c === "passengers" || c === "mail");
      cars.length = 0;
      cars.push(...kept);
    }
    if (cars.length > loco.maxCars) cars.length = loco.maxCars;
  }

  // ---- stepper ------------------------------------------------------------------------------

  function stepper(step: 1 | 2 | 3): HTMLElement {
    const items: Array<[1 | 2 | 3, string]> = [
      [1, w.steps.engine],
      [2, w.steps.cars],
      [3, w.steps.route],
    ];
    return h(
      "ol",
      { className: "stepper", "aria-label": w.title(stationName) },
      ...items.map(([n, label]) =>
        h(
          "li",
          {
            className: `step${n === step ? " current" : ""}${n < step ? " done" : ""}`,
            "aria-current": n === step ? "step" : undefined,
            "data-step": String(n),
          },
          h("span", { className: "step-num" }, n < step ? icon("check", "icon-xs") : String(n)),
          h("span", { className: "step-label" }, label),
        ),
      ),
    );
  }

  function closeChrome(): void {
    switching = true;
    sheet?.close();
    sheet = null;
    closePanel(true);
    switching = false;
  }

  function openWizardSheet(step: 1 | 2, body: Node[], footer: Node[]): void {
    closeChrome();
    sheet = openSheet(container, {
      className: "sheet-wizard",
      title: w.title(stationName),
      center: stepper(step),
      body,
      footer,
      onClose: () => {
        if (!switching) endWizard();
      },
    });
  }

  // ---- step 1: engine -----------------------------------------------------------------------

  function showEngineStep(): void {
    const filterEl = h("div", { className: "segmented-row eng-filter" });
    const listEl = h("div", { className: "eng-list" });
    const heroEl = h("div", { className: "eng-hero" });
    const nextBtn = footerButton({ label: w.next, icon: "arrowRight", kind: "primary" });
    nextBtn.classList.add("wizard-next");
    const cash = cashStrip(showEngineStep);

    const types = FILTER_ORDER.filter((ty) => available.some((l) => l.type === ty));

    function renderFilter(): void {
      const opts: Array<[Filter, string]> = [
        ["all", w.filterAll],
        ...types.map((ty): [Filter, string] => [ty, t.locoTypes[ty]]),
      ];
      filterEl.replaceChildren(
        ...opts.map(([id, label]) =>
          h(
            "button",
            {
              className: `segmented-btn${filter === id ? " active" : ""}`,
              "data-filter": id,
              onClick: () => {
                filter = id;
                renderFilter();
                renderList();
              },
            },
            label,
          ),
        ),
      );
    }

    function renderList(): void {
      const shown = listOrder.filter((l) => filter === "all" || l.type === filter);
      listEl.replaceChildren(
        ...shown.map((loco) => {
          const locked = isLocked(loco);
          const isNew = loco.introYear + NEW_LOCOMOTIVE_BADGE_YEARS >= year;
          const glyph = wheelGlyphEl(loco);
          return cardRow({
            className: `train-loco-btn eng-card${selected?.id === loco.id ? " active" : ""}${locked ? " locked" : ""}`,
            testId: `engine-${loco.id}`,
            thumb: h("div", { className: "eng-thumb" }, locoArt(loco, 36)),
            title: h(
              "span",
              { className: "eng-card-title" },
              h("span", { className: "eng-card-name" }, loco.name),
            ),
            meta: h(
              "span",
              { className: "eng-card-meta" },
              icon(tractionIcon(loco), "icon-xs"),
              glyph,
              isNew ? h("span", { className: "new-chip" }, t.newBadge) : null,
              locked ? icon("lock", "icon-xs tone-signal") : null,
              priceOf(loco) > state.cash
                ? h("span", { className: "cant-chip" }, w.cantAfford)
                : null,
            ),
            trailing: formatMoney(priceOf(loco)),
            onClick: () => {
              selected = loco;
              fitCarsToLoco();
              renderList();
              renderHero();
            },
          });
        }),
      );
    }

    function renderHero(): void {
      const loco = selected;
      if (!loco) {
        heroEl.replaceChildren(emptyState(w.chooseEngine, "trains"));
        nextBtn.disabled = true;
        cash.update(0);
        return;
      }
      cash.update(priceOf(loco));
      const glyph = wheelGlyphEl(loco);
      heroEl.replaceChildren(
        heroPlate(loco, 96),
        h(
          "div",
          { className: "eng-title" },
          h("h2", { className: "eng-name" }, loco.name),
          h(
            "div",
            { className: "eng-chips" },
            h(
              "span",
              { className: "year-chip" },
              icon("calendar", "icon-xs"),
              w.introduced(loco.introYear),
            ),
            h(
              "span",
              { className: "type-chip" },
              icon(tractionIcon(loco), "icon-xs"),
              t.locoTypes[loco.type],
            ),
            glyph,
          ),
        ),
        ...(isLocked(loco)
          ? [
              h(
                "div",
                { className: "eng-warning" },
                icon("lock", "icon-xs"),
                w.needsElectrification,
              ),
            ]
          : []),
        engineStats(loco, best, priceOf(loco)),
      );
      nextBtn.disabled = false;
      const nextLabel = nextBtn.lastElementChild;
      if (nextLabel) nextLabel.textContent = `${w.next} · ${formatMoney(priceOf(loco))}`;
    }

    nextBtn.addEventListener("click", () => {
      if (selected) showCarsStep();
    });

    renderFilter();
    renderList();
    renderHero();
    openWizardSheet(
      1,
      [
        h(
          "div",
          { className: "eng-layout" },
          h("div", { className: "eng-left" }, filterEl, listEl),
          heroEl,
        ),
      ],
      [
        footerButton({ label: strings.ui.close, kind: "secondary", onClick: () => sheet?.close() }),
        cash.el,
        nextBtn,
      ],
    );
    // Bring the selected card into view in the (independently scrolling) list.
    listEl.querySelector(".eng-card.active")?.scrollIntoView({ block: "nearest" });
    // Live: cash changes (income, a loan) re-enable the Next button and the "can't afford" chips in place.
    const affordSig = (): string =>
      `${Math.floor(state.cash)}|${listOrder.map((l) => (priceOf(l) > state.cash ? 1 : 0)).join("")}`;
    let lastSig = affordSig();
    startLive(
      () => heroEl.isConnected,
      () => {
        const sig = affordSig();
        if (sig === lastSig) return;
        lastSig = sig;
        const listScroll = listEl.scrollTop;
        renderList();
        listEl.scrollTop = listScroll;
        renderHero();
      },
    );
  }

  // ---- step 2: cars -------------------------------------------------------------------------

  function showCarsStep(): void {
    const nextBtn = footerButton({ label: w.next, icon: "arrowRight", kind: "primary" });
    nextBtn.classList.add("wizard-next");
    const cash = cashStrip(showCarsStep);
    const builder = consistBuilder({
      getLoco: () => selected,
      year,
      cars,
      stripHeight: 56,
      suggestions: () => suggestConsists(state.stationEconomy.get(stationId), selected, year),
      onChange: () => {
        builder.refresh();
        updateNext();
      },
    });
    function updateNext(): void {
      const plan = selected
        ? computeBuyTrainPlan(state, selected.id, cars)
        : { cost: 0, valid: false };
      const label = nextBtn.lastElementChild;
      if (label) label.textContent = `${w.next} · ${formatMoney(plan.cost)}`;
      nextBtn.disabled = !plan.valid;
      cash.update(plan.cost);
    }
    nextBtn.addEventListener("click", showRouteStep);
    updateNext();
    startLive(() => nextBtn.isConnected, updateNext);
    openWizardSheet(
      2,
      [builder.el],
      [
        footerButton({
          label: w.back,
          icon: "arrowLeft",
          kind: "secondary",
          onClick: showEngineStep,
        }),
        cash.el,
        nextBtn,
      ],
    );
  }

  // ---- step 3: route (bottom sheet; the map stays visible and tappable above it) ----------------

  let routeStepToken = 0;
  function showRouteStep(): void {
    const myStep = ++routeStepToken;
    closeChrome();
    let listMode = false;
    let confirmGaps = false;
    let query = "";

    const planNow = (): { cost: number; valid: boolean } =>
      selected ? computeBuyTrainPlan(state, selected.id, cars) : { cost: 0, valid: false };
    const tileXY = (tile: number): [number, number] => [
      tile % state.map.width,
      Math.floor(tile / state.map.width),
    ];

    function addStop(id: number): void {
      confirmGaps = false;
      if (orders.length < 8) orders.push({ stationId: id, rule: "auto" });
    }

    function compactRow(o: TrainOrder, i: number): HTMLElement {
      const p = strings.trains.panel;
      const mini = (
        name: IconName,
        label: string,
        disabled: boolean,
        fn: () => void,
      ): HTMLElement =>
        h(
          "button",
          { className: "tl-btn", "aria-label": label, disabled, onClick: fn },
          icon(name, "icon-xs"),
        );
      return h(
        "li",
        { className: "rs-stop", "data-testid": "tl-stop" },
        h("span", { className: "tl-dot" }, String(i + 1)),
        h("span", { className: "rs-name" }, stationLabel(o.stationId)),
        h(
          "button",
          {
            className: "rule-chip",
            title: t.ruleHint[o.rule],
            "aria-label": `${p.changeRule}: ${t.loadingRules[o.rule]}`,
            "data-testid": "rule-chip",
            onClick: () =>
              openRulePicker(
                o.rule,
                (rule) => {
                  o.rule = rule;
                  render();
                },
                stationLabel(o.stationId),
              ),
          },
          icon(RULE_ICONS[o.rule], "icon-xs"),
          h("span", null, t.loadingRules[o.rule]),
        ),
        mini("arrowUp", p.moveUp, i === 0, () => swap(i, i - 1)),
        mini("arrowDown", p.moveDown, i === orders.length - 1, () => swap(i, i + 1)),
        mini("close", p.removeStop, false, () => {
          orders.splice(i, 1);
          confirmGaps = false;
          render();
        }),
      );
    }

    function swap(i: number, j: number): void {
      const a = orders[i];
      const b = orders[j];
      if (!a || !b) return;
      orders[i] = b;
      orders[j] = a;
      render();
    }

    function stationListBody(): Node[] {
      const last = orders[orders.length - 1];
      const from = state.stations.find((s) => s.id === (last?.stationId ?? stationId));
      const [fx, fy] = from ? tileXY(from.tile) : [0, 0];
      const rowsHost = h("div", { className: "rs-station-list" });
      const fill = (): void => {
        const q = query.trim().toLowerCase();
        const rows = state.stations
          .filter((s) => !s.passingLoop && (q === "" || s.name.toLowerCase().includes(q)))
          .map((s) => {
            const [x, y] = tileXY(s.tile);
            return { s, d: Math.round(Math.hypot(x - fx, y - fy)) };
          })
          .sort((a, b) => a.d - b.d);
        rowsHost.replaceChildren(
          ...(rows.length === 0
            ? [emptyState(w.noStationsFound, "mapPin")]
            : rows.map(({ s, d }) =>
                h(
                  "button",
                  {
                    className: "rs-station",
                    "data-testid": "rs-station",
                    disabled: orders.length >= 8,
                    onClick: () => {
                      addStop(s.id);
                      listMode = false;
                      query = "";
                      render();
                    },
                  },
                  h("span", { className: "rs-name" }, s.name),
                  h(
                    "span",
                    { className: "rs-dist" },
                    formatDistance(d * KM_PER_TILE, loadSettings().units),
                  ),
                ),
              )),
        );
      };
      const search = h("input", {
        className: "rs-search",
        type: "search",
        placeholder: w.searchStations,
        "aria-label": w.searchStations,
        value: query,
      });
      search.addEventListener("input", () => {
        query = search.value;
        fill();
      });
      fill();
      return [h("div", { className: "rs-search-row" }, backButton(), search), rowsHost];
    }

    function shortStrip(price: number): HTMLElement {
      const strip = cashStrip(render);
      strip.update(price);
      return strip.el;
    }

    /** Compact confirm step (PLAN Phase 34 item 3): gaps are said once, when the player taps Buy. */
    function gapConfirmBody(gaps: ReturnType<typeof cargoGaps>): Node[] {
      const t3 = strings.trains.cargoGap;
      return [
        h(
          "div",
          { className: "rs-gap-confirm", "data-testid": "gap-confirm" },
          h(
            "div",
            { className: "rs-gap-lines" },
            icon("warning", "icon-sm tone-signal"),
            h("div", null, ...gaps.map((g) => cargoGapLine(state, g))),
          ),
          h(
            "div",
            { className: "rs-buy-row" },
            footerButton({
              icon: "arrowLeft",
              ariaLabel: w.back,
              kind: "secondary",
              className: "panel-action-cancel gap-back",
              onClick: () => {
                confirmGaps = false;
                render();
              },
            }),
            h(
              "button",
              { className: "panel-action-build gap-buy-anyway", onClick: buy },
              t3.buyAnyway,
            ),
          ),
        ),
      ];
    }

    function mainBody(): Node[] {
      const plan = planNow();
      if (confirmGaps) {
        const gaps = cargoGaps(state, cars, orders);
        if (gaps.length > 0) return gapConfirmBody(gaps);
        confirmGaps = false;
      }
      const ordersOk = orders.length >= 2 && orders.length <= 8;
      const buyBtn = h(
        "button",
        {
          className: "panel-action-build",
          disabled: !plan.valid || plan.cost > state.cash || !ordersOk,
          onClick: () => {
            if (cargoGaps(state, cars, orders).length > 0) {
              confirmGaps = true;
              render();
            } else buy();
          },
        },
        `${t.buy} · ${formatMoney(plan.cost)}`,
      );
      const pickBtn = h(
        "button",
        {
          className: `train-pick-station-btn${picking ? " active" : ""}`,
          disabled: orders.length >= 8,
          onClick: togglePick,
        },
        icon("mapPin", "icon-sm"),
        h("span", null, picking ? t.tapAStation : w.tapOnMap),
      );
      const listBtn = h(
        "button",
        {
          className: "rs-list-btn",
          disabled: orders.length >= 8,
          onClick: () => {
            stopPicking();
            listMode = true;
            render();
          },
        },
        icon("plus", "icon-sm"),
        h("span", null, w.fromList),
      );
      const list =
        orders.length === 0
          ? emptyState(w.stopsHint, "mapPin")
          : h("ol", { className: "rs-orders" }, ...orders.map(compactRow));
      return [
        h(
          "div",
          { className: "rs-main" },
          h(
            "div",
            { className: "rs-left" },
            h(
              "div",
              { className: "rs-head" },
              h("span", { className: "panel-section-title" }, t.orders),
              h("span", { className: "route-count tabular" }, w.stopCount(orders.length)),
            ),
            list,
          ),
          h(
            "div",
            { className: "rs-right" },
            h("div", { className: "rs-add-row" }, pickBtn, listBtn),
            ...(plan.cost > state.cash ? [shortStrip(plan.cost)] : []),
            h("div", { className: "rs-buy-row" }, backButton(), buyBtn),
          ),
        ),
      ];
    }

    function buy(): void {
      if (!selected) return;
      const bought = buyTrain(state, stationId, selected.id, cars);
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
    }

    /** Map-tap entry is on by default (PLAN Phase 29 C): every tap on a station appends a stop. */
    let pickEnabled = true;
    function startPicking(): void {
      picking = true;
      handlers.pickStationOnMap((pickedStationId) => {
        // Tapping the same station twice in a row adds one stop.
        if (orders[orders.length - 1]?.stationId === pickedStationId) return;
        addStop(pickedStationId);
        render();
        flashLast(".rs-orders li");
      });
    }

    function togglePick(): void {
      pickEnabled = !pickEnabled;
      if (!pickEnabled) stopPicking();
      render();
    }

    function backButton(): HTMLElement {
      const backBtn = footerButton({
        icon: "arrowLeft",
        ariaLabel: w.back,
        kind: "secondary",
        onClick: () => {
          if (listMode) {
            listMode = false;
            render();
            return;
          }
          stopPicking();
          unpanForSheet();
          showCarsStep();
        },
      });
      backBtn.classList.add("panel-action-cancel");
      return backBtn;
    }

    function render(): void {
      if (picking && (listMode || !pickEnabled || orders.length >= 8)) stopPicking();
      else if (!picking && pickEnabled && !listMode && orders.length < 8) startPicking();
      switching = true;
      openPanel(container, {
        title: listMode ? w.addFromListTitle : `${w.title(stationName)} · ${w.steps.route}`,
        subtitle: undefined,
        body: listMode ? stationListBody() : mainBody(),
        placement: "bottom",
        className: `route-sheet${listMode ? " route-sheet-tall" : ""}`,
        key: "route-step",
        onClose: () => {
          if (!switching) endWizard();
        },
      });
      switching = false;
      if (sheetPan === 0) {
        const sheetH = document.querySelector(".panel-bottom")?.getBoundingClientRect().height ?? 0;
        sheetPan = Math.round(sheetH / 2);
        handlers.panCameraBy?.(sheetPan);
      }
    }

    render();
    // Live: the Buy button and the cash strip follow the player's cash without re-opening the sheet.
    const buySig = (): string => `${planNow().cost > state.cash}|${Math.floor(state.cash)}`;
    let lastBuySig = buySig();
    startLive(
      () => myStep === routeStepToken && document.querySelector(".route-sheet") !== null,
      () => {
        const sig = buySig();
        if (sig === lastBuySig || listMode || confirmGaps) return;
        lastBuySig = sig;
        render();
      },
    );
  }

  showEngineStep();
}
