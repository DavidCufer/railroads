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
import { buyTrain, computeBuyTrainPlan, setOrders } from "../sim/commands";
import type { GameState } from "../sim/state";
import { calendarFromTicks } from "../sim/time";
import type { TrainOrder } from "../sim/trains/types";
import { cardRow } from "./components/cardRow";
import { emptyState } from "./components/emptyState";
import { footerButton } from "./components/footer";
import { consistBuilder, suggestConsists } from "./consistBuilder";
import { formatMoney } from "./format";
import { h } from "./h";
import { icon } from "./icons";
import { bestOf, engineStats } from "./locoStats";
import { closePanel, openPanel } from "./panel";
import { routeTimeline } from "./routeTimeline";
import { openSheet, type SheetHandle } from "./sheet";
import { playSound } from "./sound";
import { SLOW_ENGINE_KMH } from "../data/trains";
import { strings } from "./strings";
import { showToast } from "./toast";
import { consistStrip, heroPlate, locoArt, tractionIcon, wheelGlyphEl } from "./trainArt";

export interface BuyTrainHandlers {
  /** Puts the map into "tap a station to add it as a stop" mode; `onPicked` fires once, with the
   * tapped station's id, then picking mode ends on its own. */
  pickStationOnMap: (onPicked: (stationId: number) => void) => void;
  /** Cancels an active `pickStationOnMap` early (toggled off, or the panel closed). */
  cancelPickStationOnMap: () => void;
  onBought?: (trainId: number) => void;
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

  function stopPicking(): void {
    if (!picking) return;
    picking = false;
    handlers.cancelPickStationOnMap();
  }

  function endWizard(): void {
    stopPicking();
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
        return;
      }
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
        nextBtn,
      ],
    );
    // Bring the selected card into view in the (independently scrolling) list.
    listEl.querySelector(".eng-card.active")?.scrollIntoView({ block: "nearest" });
  }

  // ---- step 2: cars -------------------------------------------------------------------------

  function showCarsStep(): void {
    const nextBtn = footerButton({ label: w.next, icon: "arrowRight", kind: "primary" });
    nextBtn.classList.add("wizard-next");
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
    }
    nextBtn.addEventListener("click", showRouteStep);
    updateNext();
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
        nextBtn,
      ],
    );
  }

  // ---- step 3: route (side panel; the map stays visible) --------------------------------------

  function showRouteStep(): void {
    closeChrome();
    const bodyHost = h("div", { className: "route-step" });
    const buyBtn = h("button", { className: "panel-action-build" });
    const pickBtn = h("button", { className: "train-pick-station-btn" });

    function planNow(): { cost: number; valid: boolean } {
      return selected ? computeBuyTrainPlan(state, selected.id, cars) : { cost: 0, valid: false };
    }

    function render(): void {
      const plan = planNow();
      const ordersOk = orders.length >= 2 && orders.length <= 8;
      buyBtn.textContent = `${t.buy} · ${formatMoney(plan.cost)}`;
      buyBtn.disabled = !plan.valid || plan.cost > state.cash || !ordersOk;

      pickBtn.replaceChildren(
        icon("plus", "icon-sm"),
        h("span", null, picking ? t.tapAStation : t.panel.addStop),
      );
      pickBtn.classList.toggle("active", picking);
      (pickBtn as HTMLButtonElement).disabled = orders.length >= 8;

      const kids: Node[] = [];
      if (selected) {
        kids.push(
          h(
            "div",
            { className: "route-summary" },
            consistStrip({
              locoId: selected.id,
              cars: cars.map((c) => ({ cargoType: c, fill01: 0 })),
              year,
              height: 30,
            }),
          ),
        );
      }
      kids.push(
        h(
          "div",
          { className: "section" },
          h(
            "div",
            { className: "section-head route-head" },
            h(
              "div",
              { className: "panel-section-title" },
              t.orders,
              h("span", { className: "route-count tabular" }, w.stopCount(orders.length)),
            ),
            pickBtn,
          ),
          h(
            "p",
            { className: "section-note" },
            selected && selected.maxSpeedKmh < SLOW_ENGINE_KMH
              ? w.longerRoutesHintSlow
              : w.longerRoutesHint,
          ),
          orders.length === 0
            ? emptyState(w.stopsHint, "mapPin")
            : routeTimeline({
                stops: orders.map((o) => ({ name: stationLabel(o.stationId), rule: o.rule })),
                onRule: (i, rule) => {
                  const o = orders[i];
                  if (o) o.rule = rule;
                  render();
                },
                onRemove: (i) => {
                  orders.splice(i, 1);
                  render();
                },
                onMove: (i, dir) => {
                  const j = i + dir;
                  const a = orders[i];
                  const b = orders[j];
                  if (!a || !b) return;
                  orders[i] = b;
                  orders[j] = a;
                  render();
                },
              }),
        ),
      );
      bodyHost.replaceChildren(...kids);
    }

    pickBtn.addEventListener("click", () => {
      if (picking) {
        stopPicking();
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
    });

    const backBtn = footerButton({
      icon: "arrowLeft",
      ariaLabel: w.back,
      kind: "secondary",
      onClick: () => {
        stopPicking();
        showCarsStep();
      },
    });
    backBtn.classList.add("panel-action-cancel");

    openPanel(container, {
      title: w.title(stationName),
      subtitle: w.stepOf(3, 3, w.steps.route),
      body: [bodyHost],
      footer: [backBtn, buyBtn],
      onClose: () => {
        if (!switching) endWizard();
      },
    });
    render();
  }

  showEngineStep();
}
