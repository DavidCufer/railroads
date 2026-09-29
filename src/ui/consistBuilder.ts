/**
 * Consist builder (STYLE §11.1 step 2): the whole train in side view on top (tap a car to remove
 * it), suggestions, and a palette of car tiles (tap to append). Shared by the buy wizard and the
 * train panel's "Edit cars".
 */
import { CARGO, CARGO_TYPES, type CargoType } from "../data/cargo";
import type { LocomotiveDef } from "../data/trains";
import type { StationEconomy } from "../sim/stations/economy";
import { meter } from "./components/meter";
import { h } from "./h";
import { icon } from "./icons";
import { strings } from "./strings";
import { cargoBadge, carArt, consistStrip } from "./trainArt";

export interface Suggestion {
  label: string;
  cars: CargoType[];
}

/** Cars a locomotive may pull at `year` (high-speed trainsets: passengers and mail only). */
export function allowedCargo(loco: LocomotiveDef | undefined, year: number): CargoType[] {
  return CARGO_TYPES.filter(
    (c) => CARGO[c].era <= year && (!loco?.passengerMailOnly || c === "passengers" || c === "mail"),
  );
}

/** "Suggested" consists from what the origin station supplies: a passenger+mail set when people
 * are on offer, otherwise/also a freight set of its biggest supplied cargo. */
export function suggestConsists(
  economy: StationEconomy | undefined,
  loco: LocomotiveDef | undefined,
  year: number,
): Suggestion[] {
  if (!loco) return [];
  const allowed = new Set(allowedCargo(loco, year));
  const n = Math.max(1, Math.min(4, loco.maxCars));
  const out: Suggestion[] = [];
  const supply = economy?.supply ?? {};
  if (allowed.has("passengers") && (supply.passengers ?? 0) > 0.05) {
    const cars: CargoType[] = [];
    for (let i = 0; i < n; i++) {
      cars.push(i === n - 1 && allowed.has("mail") && n > 1 ? "mail" : "passengers");
    }
    out.push({ label: strings.trains.wizard.suggestPassengers, cars });
  }
  const freight = (Object.entries(supply) as Array<[CargoType, number]>)
    .filter(([c, v]) => v > 0.05 && c !== "passengers" && c !== "mail" && allowed.has(c))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);
  for (const [cargo] of freight) {
    out.push({
      label: strings.trains.wizard.suggestFreight(CARGO[cargo].name),
      cars: Array.from({ length: n }, () => cargo),
    });
  }
  return out.slice(0, 3);
}

export interface ConsistBuilderOptions {
  getLoco: () => LocomotiveDef | undefined;
  year: number;
  /** Mutated in place; `onChange` is called after every edit. */
  cars: CargoType[];
  suggestions?: () => Suggestion[];
  onChange: () => void;
  stripHeight?: number;
}

export interface ConsistBuilder {
  el: HTMLElement;
  refresh: () => void;
}

export function carCapacityText(cargo: CargoType): string {
  const def = CARGO[cargo];
  return cargo === "passengers" ? `${def.capacity} seats` : `${def.capacity} ${def.unit}`;
}

export function consistBuilder(options: ConsistBuilderOptions): ConsistBuilder {
  const stripHeight = options.stripHeight ?? 52;
  const stripHost = h("div", { className: "cb-strip-host" });
  const countHost = h("div", { className: "cb-count" });
  const suggestHost = h("div", { className: "cb-suggest" });
  const palette = h("div", { className: "cb-palette" });
  const top = h(
    "div",
    { className: "cb-top" },
    h(
      "div",
      { className: "cb-top-head" },
      h("span", { className: "panel-section-title" }, strings.trains.wizard.yourTrain),
      countHost,
    ),
    stripHost,
    suggestHost,
  );
  const el = h("div", { className: "consist-builder" }, top, palette);

  function refresh(): void {
    const loco = options.getLoco();
    const max = loco?.maxCars ?? 0;
    const t = strings.trains.wizard;

    const stripCars = options.cars.map((c) => ({ cargoType: c, fill01: 0 }));
    const strip = loco
      ? consistStrip({
          locoId: loco.id,
          cars: stripCars,
          year: options.year,
          height: stripHeight,
          onCarTap: (i) => {
            options.cars.splice(i, 1);
            options.onChange();
          },
          removeLabel: (i) => t.removeCar(CARGO[options.cars[i] as CargoType].name),
        })
      : h("div");
    stripHost.replaceChildren(strip);
    if (options.cars.length === 0) {
      stripHost.appendChild(h("div", { className: "cb-hint" }, t.noCarsYet));
    }

    countHost.replaceChildren(
      meter(options.cars.length, Math.max(1, max), options.cars.length >= max ? "signal" : "brass"),
      h("span", { className: "cb-count-text tabular" }, t.carsUsed(options.cars.length, max)),
    );
    if (options.cars.length > 0) {
      countHost.appendChild(
        h(
          "button",
          {
            className: "cb-clear",
            onClick: () => {
              options.cars.length = 0;
              options.onChange();
            },
          },
          t.clear,
        ),
      );
    }

    const suggestions = options.suggestions?.() ?? [];
    suggestHost.replaceChildren(
      ...(suggestions.length > 0
        ? [h("span", { className: "cb-suggest-label" }, t.suggested)]
        : []),
      ...suggestions.map((s) =>
        h(
          "button",
          {
            className: "cb-suggest-btn",
            "data-testid": "suggestion",
            onClick: () => {
              options.cars.length = 0;
              options.cars.push(...s.cars.slice(0, max));
              options.onChange();
            },
          },
          icon("plus", "icon-xs"),
          s.label,
        ),
      ),
    );

    const full = options.cars.length >= max;
    palette.replaceChildren(
      ...allowedCargo(loco, options.year).map((c) =>
        h(
          "button",
          {
            className: "train-car-add-btn car-tile",
            disabled: !loco || full,
            "aria-label": t.addCar(CARGO[c].name),
            "data-cargo": c,
            onClick: () => {
              options.cars.push(c);
              options.onChange();
            },
          },
          h("div", { className: "car-tile-art" }, carArt(c, options.year, 0.7, 30)),
          h(
            "div",
            { className: "car-tile-text" },
            h(
              "span",
              { className: "car-tile-name" },
              cargoBadge(c, "cargo-icon-xs"),
              CARGO[c].name,
            ),
            h("span", { className: "car-tile-cap tabular" }, carCapacityText(c)),
          ),
        ),
      ),
    );
  }

  refresh();
  return { el, refresh };
}
