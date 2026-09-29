/** Consist builder (STYLE §11.1 step 2): the whole train in side view with removable cars, a
 * "Suggested" row and a palette of car tiles. Shared by the buy wizard and Edit cars. */
import { CARGO, CARGO_TYPES, type CargoType } from "../../data/cargo";
import type { LocomotiveDef } from "../../data/trains";
import { meter } from "../components/meter";
import { h } from "../h";
import { cargoIcon, icon } from "../icons";
import { strings } from "../strings";
import { groupCars, suggestConsists } from "./locoStats";
import { carPicture, consistStrip } from "./pictures";

export interface ConsistBuilderOptions {
  loco: LocomotiveDef;
  year: number;
  getCars: () => CargoType[];
  setCars: (cars: CargoType[]) => void;
  /** Monthly supply at the buying station, for the "Suggested" row. */
  supply: Partial<Record<CargoType, number>>;
  /** Show the "Suggested" row (buy wizard only). */
  suggest?: boolean;
}

/** Cargo types the locomotive may haul at `year`. */
export function allowedCars(loco: LocomotiveDef | undefined, year: number): CargoType[] {
  return CARGO_TYPES.filter(
    (c) => CARGO[c].era <= year && (!loco?.passengerMailOnly || c === "passengers" || c === "mail"),
  );
}

function capacityText(cargo: CargoType): string {
  const def = CARGO[cargo];
  return cargo === "passengers" ? `${def.capacity} seats` : `${def.capacity} ${def.unit}`.trim();
}

export function consistBuilder(o: ConsistBuilderOptions): HTMLElement {
  const w = strings.trains.wizard;
  const stripHost = h("div", { className: "cb-strip-host" });
  const countHost = h("div", { className: "cb-count" });
  const suggestHost = h("div", { className: "cb-suggest" });
  const paletteHost = h("div", { className: "train-car-picker cb-palette" });
  const root = h(
    "div",
    { className: "cb" },
    h("div", { className: "cb-top" }, stripHost),
    h("div", { className: "cb-bar" }, countHost, suggestHost),
    paletteHost,
  );
  const allowed = allowedCars(o.loco, o.year);

  function render(): void {
    const cars = o.getCars();
    const strip = consistStrip(
      o.loco.id,
      cars.map((c) => ({ cargoType: c, fill01: c === "passengers" || c === "mail" ? 0 : 0.7 })),
      o.year,
      54,
      { padTop: 2, padBottom: 2 },
    );
    strip.slots.forEach((slot, i) => {
      const cargo = cars[i] as CargoType;
      slot.classList.add("removable");
      slot.appendChild(
        h(
          "button",
          {
            className: "train-car-chip cb-remove",
            "aria-label": w.removeCar(CARGO[cargo].name),
            onClick: () => {
              const next = o.getCars().slice();
              next.splice(i, 1);
              o.setCars(next);
              render();
            },
          },
          icon("close", "icon-sm"),
        ),
      );
    });
    stripHost.replaceChildren(strip.root);
    if (cars.length === 0)
      stripHost.appendChild(h("div", { className: "cb-hint" }, w.consistEmpty));

    countHost.replaceChildren(
      h(
        "span",
        { className: "cb-count-label" },
        icon("cars", "icon-sm"),
        w.carsUsed(cars.length, o.loco.maxCars),
      ),
      meter(cars.length, o.loco.maxCars, cars.length >= o.loco.maxCars ? "signal" : "brass"),
      h(
        "button",
        {
          className: "cb-clear",
          disabled: cars.length === 0,
          onClick: () => {
            o.setCars([]);
            render();
          },
        },
        w.clearCars,
      ),
    );

    const suggestions =
      o.suggest === false ? [] : suggestConsists(o.supply, allowed, o.loco.maxCars);
    suggestHost.replaceChildren(
      ...(suggestions.length > 0
        ? [
            h("span", { className: "cb-suggest-label" }, w.suggested),
            ...suggestions.map((s) =>
              h(
                "button",
                {
                  className: "sugg-chip",
                  "data-suggestion": s.id,
                  onClick: () => {
                    o.setCars(s.cars.slice());
                    render();
                  },
                },
                ...groupCars(s.cars).flatMap((g) => [
                  cargoIcon(g.cargo, "cargo-icon-sm"),
                  h("span", { className: "sugg-count" }, `×${g.count}`),
                ]),
              ),
            ),
          ]
        : []),
    );

    paletteHost.replaceChildren(
      ...allowed.map((c) =>
        h(
          "button",
          {
            className: "train-car-add-btn car-tile",
            disabled: cars.length >= o.loco.maxCars,
            "aria-label": w.addCar(CARGO[c].name),
            "data-cargo": c,
            onClick: () => {
              const next = o.getCars().slice();
              next.push(c);
              o.setCars(next);
              render();
            },
          },
          h(
            "span",
            { className: "car-tile-pic" },
            carPicture(c, o.year, c === "passengers" || c === "mail" ? 0 : 0.7, 26),
          ),
          h(
            "span",
            { className: "car-tile-text" },
            cargoIcon(c, "cargo-icon-sm"),
            h(
              "span",
              { className: "car-tile-names" },
              h("span", { className: "car-tile-name" }, CARGO[c].name),
              h("span", { className: "car-tile-cap" }, capacityText(c)),
            ),
          ),
        ),
      ),
    );
  }

  render();
  return root;
}
