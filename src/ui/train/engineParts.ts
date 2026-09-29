/** Locomotive presentation parts shared by the buy wizard, replace panel, roster and the new-engine
 * card: type icon/chip, wheel-arrangement glyph, stat bars, engine card row. */
import { wheelArrangementGlyph } from "../../render/art";
import { NEW_LOCOMOTIVE_BADGE_YEARS, type LocomotiveDef } from "../../data/trains";
import { pips } from "../components/meter";
import { h } from "../h";
import { icon, type IconName } from "../icons";
import { formatMoney } from "../format";
import { formatSpeed, loadSettings } from "../settings";
import { strings } from "../strings";
import { locoPicture, locoThumb } from "./pictures";
import { statBars, type StatBars } from "./locoStats";

export function tractionIcon(type: LocomotiveDef["type"]): IconName {
  return type === "electric" ? "electrify" : type;
}

export function wheelGlyph(loco: LocomotiveDef): HTMLElement | null {
  if (loco.type !== "steam") return null;
  const svg = wheelArrangementGlyph(loco.name);
  if (!svg) return null;
  const span = h("span", { className: "wheel-glyph-wrap" });
  span.innerHTML = svg;
  return span;
}

export function isNewModel(loco: LocomotiveDef, year: number): boolean {
  return loco.introYear + NEW_LOCOMOTIVE_BADGE_YEARS >= year;
}

export function typeChip(loco: LocomotiveDef): HTMLElement {
  return h(
    "span",
    { className: "chip chip-type" },
    icon(tractionIcon(loco.type), "icon-sm"),
    strings.trains.locoTypes[loco.type],
  );
}

export interface EngineCardOptions {
  loco: LocomotiveDef;
  year: number;
  selected?: boolean;
  /** Reason the engine can't run here; the card is dimmed with a lock. */
  lockedReason?: string | undefined;
  trailing: string;
  meta?: string | undefined;
  onClick: () => void;
  disabled?: boolean;
}

/** One buyable-locomotive card: side-view thumb, name, type icon + wheel glyph, price. */
export function engineCard(o: EngineCardOptions): HTMLElement {
  const glyph = wheelGlyph(o.loco);
  return h(
    "button",
    {
      className: `train-loco-btn eng-card${o.selected ? " active" : ""}${o.lockedReason ? " locked" : ""}`,
      "data-loco": o.loco.id,
      "aria-pressed": o.selected ? "true" : "false",
      disabled: o.disabled,
      onClick: o.onClick,
    },
    locoThumb(o.loco, 96, 36),
    h(
      "span",
      { className: "eng-text" },
      h(
        "span",
        { className: "eng-name" },
        o.loco.name,
        isNewModel(o.loco, o.year)
          ? h("span", { className: "chip chip-new" }, strings.trains.newBadge)
          : null,
      ),
      h(
        "span",
        { className: "eng-meta" },
        icon(o.lockedReason ? "lock" : tractionIcon(o.loco.type), "icon-sm"),
        glyph,
        o.meta ? h("span", null, o.meta) : null,
      ),
    ),
    h("span", { className: "eng-price" }, o.trailing),
  );
}

export interface StatBlockOptions {
  loco: LocomotiveDef;
  pool: readonly LocomotiveDef[];
  price: number;
  running: number;
  /** Which stats to show (the announcement card shows three). */
  only?: ReadonlyArray<keyof StatBars | "reliability">;
  /** Shorter captions for narrow layouts (the announcement card). */
  compact?: boolean;
}

function statCell(
  ic: IconName,
  caption: string,
  value: string,
  bar: HTMLElement,
  key: string,
): HTMLElement {
  return h(
    "div",
    { className: "hstat", "data-stat": key },
    h(
      "div",
      { className: "hstat-head" },
      icon(ic, "icon-sm"),
      h("span", { className: "hstat-cap" }, caption),
      h("b", { className: "hstat-val" }, value),
    ),
    bar,
  );
}

function bar(fraction: number, tone: "brass" | "steel" | "signal" = "brass"): HTMLElement {
  return h(
    "div",
    { className: "meter hstat-bar" },
    h("div", {
      className: `meter-fill tone-${tone}`,
      style: { width: `${Math.round(fraction * 100)}%` },
    }),
  );
}

/** Icon + bar stat block (STYLE §11.1): speed, power, max cars, reliability (pips), price, upkeep. */
export function statBlock(o: StatBlockOptions): HTMLElement {
  const bars = statBars(o.loco, o.pool);
  const s = strings.trains.wizard.stats;
  const units = loadSettings().units;
  const cells: Record<string, HTMLElement> = {
    speed: statCell(
      "gauge",
      o.compact ? s.speedShort : s.speed,
      formatSpeed(o.loco.maxSpeedKmh, units),
      bar(bars.speed),
      "speed",
    ),
    power: statCell("flame", s.power, `${o.loco.power}`, bar(bars.power), "power"),
    cars: statCell("cars", s.cars, `${o.loco.maxCars}`, bar(bars.cars), "cars"),
    reliability: statCell(
      "wrench",
      s.reliability,
      "",
      h("div", { className: "hstat-pips" }, pips(o.loco.reliability)),
      "reliability",
    ),
    price: statCell("coin", s.price, formatMoney(o.price), bar(bars.price, "steel"), "price"),
    running: statCell(
      "clock",
      s.running,
      strings.trains.wizard.perYear(formatMoney(o.running)),
      bar(bars.running, "signal"),
      "running",
    ),
  };
  const keys = o.only ?? ["speed", "power", "cars", "reliability", "price", "running"];
  return h("div", { className: "hstat-grid" }, ...keys.map((k) => cells[k] as HTMLElement));
}

/** Hero picture on a rail-line plate, plus caption chips. */
export function heroPlate(loco: LocomotiveDef, height: number): HTMLElement {
  return h("div", { className: "hero-plate" }, locoPicture(loco, height));
}
