/**
 * Buy-train "Engine shed" wizard (STYLE §11.1, PLAN Phase 22): steps 1 Engine and 2 Cars are a
 * full-screen sheet; step 3 Route collapses to the side panel so the map stays visible for the
 * existing tap-a-station picking mode. All purchases go through `buyTrain` / `setOrders`.
 */
import { CARGO, type CargoType } from "../../data/cargo";
import { buyableLocomotivesIn, type LocomotiveDef, type LocomotiveType } from "../../data/trains";
import { buyTrain, computeBuyTrainPlan, setOrders } from "../../sim/commands";
import { eraInflation } from "../../data/finance";
import type { GameState } from "../../sim/state";
import type { TrainOrder } from "../../sim/trains/types";
import { footerButton } from "../components/footer";
import { emptyState } from "../components/emptyState";
import { h } from "../h";
import { icon } from "../icons";
import { formatMoney } from "../format";
import { closePanel, openPanel } from "../panel";
import { playSound } from "../sound";
import { strings } from "../strings";
import { showToast } from "../toast";
import { formatSpeed, loadSettings } from "../settings";
import { consistBuilder } from "./consistBuilder";
import {
  engineCard,
  heroPlate,
  statBlock,
  tractionIcon,
  typeChip,
  wheelGlyph,
  isNewModel,
} from "./engineParts";
import { locoPicture } from "./pictures";
import { tractionTypesIn } from "./locoStats";
import { nextRule, routeTimeline } from "./routeTimeline";
import { openSheet, type SheetHandle } from "./sheet";
import { consistStrip } from "./pictures";
import { calendarFromTicks } from "../../sim/time";

export interface BuyTrainHandlers {
  /** Puts the map into "tap a station to add it as a stop" mode; `onPicked` fires once, with the
   * tapped station's id, then picking mode ends on its own. */
  pickStationOnMap: (onPicked: (stationId: number) => void) => void;
  /** Cancels an active `pickStationOnMap` early (toggled off, or the panel closed). */
  cancelPickStationOnMap: () => void;
  onBought?: (trainId: number) => void;
}

type Step = 1 | 2 | 3;
type Filter = "all" | LocomotiveType;

/** True when an electrified edge touches the station tile (electric engines can leave from here). */
export function stationHasElectrifiedTrack(state: GameState, stationId: number): boolean {
  const tile = state.stations.find((s) => s.id === stationId)?.tile;
  if (tile === undefined) return false;
  for (const e of state.trackGraph.allEdges()) {
    if (e.electrified && (e.a === tile || e.b === tile)) return true;
  }
  return false;
}

export function openBuyTrainPanel(
  container: HTMLElement,
  state: GameState,
  stationId: number,
  handlers: BuyTrainHandlers,
): void {
  const w = strings.trains.wizard;
  const year = calendarFromTicks(state.startYear, state.ticks).year;
  const available = buyableLocomotivesIn(year);
  const station = state.stations.find((s) => s.id === stationId);
  const electrifiedHere = stationHasElectrifiedTrack(state, stationId);
  const supply = state.stationEconomy.get(stationId)?.supply ?? {};

  let step: Step = 1;
  let selected: LocomotiveDef | undefined = available[available.length - 1];
  let filter: Filter = "all";
  let cars: CargoType[] = [];
  const orders: TrainOrder[] = [];
  let picking = false;
  let sheet: SheetHandle | null = null;
  /** True while the wizard itself closes the sheet/panel (moving between steps or finishing). */
  let transitioning = false;

  const stationName = (id: number): string => state.stations.find((s) => s.id === id)?.name ?? "?";
  const lockReason = (loco: LocomotiveDef): string | undefined =>
    loco.type === "electric" && !electrifiedHere ? w.lockedElectric : undefined;
  const priceOf = (loco: LocomotiveDef): number => computeBuyTrainPlan(state, loco.id, []).cost;
  const runningOf = (loco: LocomotiveDef): number => loco.maintenancePerYear * eraInflation(year);
  const totalCost = (): number =>
    selected ? computeBuyTrainPlan(state, selected.id, cars).cost : 0;

  function finish(): void {
    transitioning = true;
    if (picking) handlers.cancelPickStationOnMap();
    picking = false;
    sheet?.close();
    sheet = null;
    closePanel();
    transitioning = false;
  }

  // --- stepper -------------------------------------------------------------------------------
  function stepper(): HTMLElement {
    const names = [w.steps.engine, w.steps.cars, w.steps.route] as const;
    return h(
      "div",
      { className: "stepper", role: "list" },
      ...names.map((name, i) => {
        const n = (i + 1) as Step;
        const done = n < step;
        const canGo = n < step && n < 3;
        return h(
          "button",
          {
            className: `step${n === step ? " active" : ""}${done ? " done" : ""}`,
            role: "listitem",
            disabled: !canGo,
            "aria-current": n === step ? "step" : undefined,
            onClick: () => goTo(n),
          },
          h("span", { className: "step-n" }, done ? icon("check", "icon-sm") : String(n)),
          h("span", { className: "step-name" }, name),
        );
      }),
    );
  }

  // --- steps 1 & 2 (the sheet) ---------------------------------------------------------------
  function ensureSheet(): SheetHandle {
    if (sheet) return sheet;
    closePanel();
    sheet = openSheet(container, {
      title: w.title(station?.name ?? "?"),
      className: "wizard-sheet",
      onClose: () => {
        // Closed via ✕ / the back button (not by the wizard moving on): abandon the wizard.
        sheet = null;
        if (!transitioning && picking) handlers.cancelPickStationOnMap();
        if (!transitioning) picking = false;
      },
    });
    return sheet;
  }

  function renderEngineStep(s: SheetHandle): void {
    const types = tractionTypesIn(available);
    const shown = filter === "all" ? available : available.filter((l) => l.type === filter);
    const segs: Filter[] = ["all", ...types];
    const list = h(
      "div",
      { className: "eng-list" },
      ...shown
        .slice()
        .reverse()
        .map((loco) =>
          engineCard({
            loco,
            year,
            selected: selected?.id === loco.id,
            lockedReason: lockReason(loco),
            trailing: formatMoney(priceOf(loco)),
            meta: `${formatSpeed(loco.maxSpeedKmh, loadSettings().units)} · ${w.carsCount(loco.maxCars)}`,
            onClick: () => {
              selected = loco;
              if (loco.passengerMailOnly)
                cars = cars.filter((c) => c === "passengers" || c === "mail");
              if (cars.length > loco.maxCars) cars = cars.slice(0, loco.maxCars);
              render();
            },
          }),
        ),
    );
    const left = h(
      "div",
      { className: "wiz-left" },
      types.length > 1
        ? h(
            "div",
            { className: "segmented-row wiz-filter" },
            ...segs.map((f) =>
              h(
                "button",
                {
                  className: `segmented-btn${filter === f ? " active" : ""}`,
                  "data-filter": f,
                  onClick: () => {
                    filter = f;
                    render();
                  },
                },
                w.filters[f],
              ),
            ),
          )
        : null,
      list,
    );
    s.body.replaceChildren(h("div", { className: "wiz-cols" }, left, heroFor(selected)));
    // Keep the selected card in view after a re-render.
    s.body.querySelector(".eng-card.active")?.scrollIntoView({ block: "nearest" });
  }

  function heroFor(loco: LocomotiveDef | undefined): HTMLElement {
    if (!loco)
      return h("div", { className: "wiz-hero" }, emptyState(strings.trains.none, "trains"));
    const glyph = wheelGlyph(loco);
    const locked = lockReason(loco);
    return h(
      "div",
      { className: "wiz-hero" },
      heroPlate(loco, 84),
      h(
        "div",
        { className: "hero-title" },
        h("div", { className: "hero-name" }, loco.name),
        h(
          "div",
          { className: "hero-chips" },
          typeChip(loco),
          glyph ? h("span", { className: "chip chip-glyph" }, glyph) : null,
          h("span", { className: "chip" }, w.introYear(loco.introYear)),
          isNewModel(loco, year)
            ? h("span", { className: "chip chip-new" }, strings.trains.newBadge)
            : null,
        ),
      ),
      locked
        ? h("div", { className: "hero-note tone-signal" }, icon("lock", "icon-sm"), locked)
        : loco.passengerMailOnly
          ? h("div", { className: "hero-note" }, icon("info", "icon-sm"), w.passengerMailOnly)
          : null,
      statBlock({ loco, pool: available, price: priceOf(loco), running: runningOf(loco) }),
    );
  }

  function renderCarsStep(s: SheetHandle): void {
    if (!selected) return;
    const loco = selected;
    s.body.replaceChildren(
      consistBuilder({
        loco,
        year,
        getCars: () => cars,
        setCars: (next) => {
          cars = next;
          renderFooter(s);
        },
        supply,
      }),
    );
  }

  function renderFooter(s: SheetHandle): void {
    const price = formatMoney(totalCost());
    const locked = selected ? lockReason(selected) : undefined;
    const next = footerButton({
      label: `${w.next} · ${price}`,
      kind: "primary",
      className: "wizard-next",
      disabled: !selected || (step === 1 && locked !== undefined),
      onClick: () => goTo((step + 1) as Step),
    });
    s.footer.replaceChildren(
      ...(step > 1
        ? [
            footerButton({
              label: w.back,
              icon: "back",
              kind: "secondary",
              className: "wizard-back",
              onClick: () => goTo((step - 1) as Step),
            }),
          ]
        : []),
      next,
    );
    if (step === 1 && locked) {
      s.footer.prepend(h("span", { className: "footer-note" }, icon("lock", "icon-sm"), locked));
    }
  }

  // --- step 3 (side panel) -------------------------------------------------------------------
  function renderRoutePanel(): void {
    const loco = selected;
    if (!loco) return;
    const plan = computeBuyTrainPlan(state, loco.id, cars);
    const affordable = plan.cost <= state.cash;
    const ordersOk = orders.length >= 2 && orders.length <= 8;

    const pickBtn = h(
      "button",
      {
        className: `train-pick-station-btn${picking ? " active" : ""}`,
        disabled: orders.length >= 8,
        onClick: () => {
          if (picking) {
            picking = false;
            handlers.cancelPickStationOnMap();
            renderRoutePanel();
            return;
          }
          picking = true;
          renderRoutePanel();
          handlers.pickStationOnMap((pickedStationId) => {
            picking = false;
            if (orders.length < 8) orders.push({ stationId: pickedStationId, rule: "auto" });
            renderRoutePanel();
          });
        },
      },
      icon(picking ? "mapPin" : "plus", "icon-sm"),
      picking ? strings.trains.tapAStation : strings.trains.addStop,
    );

    const strip = consistStrip(
      loco.id,
      cars.map((c) => ({ cargoType: c, fill01: 0 })),
      year,
      30,
    );
    const buyBtn = footerButton({
      label: `${strings.trains.buy} · ${formatMoney(plan.cost)}`,
      kind: "primary",
      className: "panel-action-build",
      disabled: !plan.valid || !affordable || !ordersOk,
      onClick: () => {
        const bought = buyTrain(state, stationId, loco.id, cars);
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
        finish();
      },
    });
    openPanel(container, {
      key: "buy-train-route",
      title: strings.trains.buyTitle,
      subtitle: `${w.steps.route} · ${station?.name ?? ""}`,
      thumb: h("span", { className: "thumb-crop" }, locoPicture(loco, 30)),
      body: [
        h("div", { className: "route-summary" }, strip.root),
        pickBtn,
        routeTimeline({
          stops: orders.map((o) => ({ name: stationName(o.stationId), rule: o.rule })),
          onRule: (i) => {
            const o = orders[i];
            if (o) o.rule = nextRule(o.rule);
            renderRoutePanel();
          },
          onRemove: (i) => {
            orders.splice(i, 1);
            renderRoutePanel();
          },
          onMove: (i, d) => {
            const o = orders[i];
            const other = orders[i + d];
            if (!o || !other) return;
            orders[i] = other;
            orders[i + d] = o;
            renderRoutePanel();
          },
        }),
        h(
          "div",
          { className: "route-hint" },
          icon("info", "icon-sm"),
          orders.length < 2 ? w.needTwoStops : w.routeHint,
        ),
      ],
      footer: [
        footerButton({
          label: w.back,
          icon: "back",
          kind: "secondary",
          className: "wizard-back",
          onClick: () => goTo(2),
        }),
        buyBtn,
      ],
      onClose: () => {
        if (transitioning) return;
        if (picking) handlers.cancelPickStationOnMap();
        picking = false;
      },
    });
  }

  function goTo(n: Step): void {
    if (n < 1 || n > 3 || !selected) return;
    const from = step;
    step = n;
    if (n === 3) {
      transitioning = true;
      sheet?.close();
      sheet = null;
      transitioning = false;
    } else if (from === 3) {
      transitioning = true;
      if (picking) handlers.cancelPickStationOnMap();
      picking = false;
      closePanel();
      transitioning = false;
    }
    render();
  }

  function render(): void {
    if (step === 3) return renderRoutePanel();
    const s = ensureSheet();
    s.setHeaderExtra(stepper());
    if (step === 1) renderEngineStep(s);
    else renderCarsStep(s);
    renderFooter(s);
  }

  render();
}
