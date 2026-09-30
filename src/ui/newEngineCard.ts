/**
 * New engine announcement (STYLE §11.4): when a locomotive model becomes available, a card dialog
 * shows its side view on a rail line, name, year and three key stats, with Roster / OK. Once per
 * model; several announcements in the same year queue up.
 */
import { locomotiveById, type LocomotiveDef } from "../data/trains";
import { footerButton } from "./components/footer";
import { statRow, statTile } from "./components/statTile";
import { h } from "./h";
import { formatSpeed, loadSettings } from "./settings";
import { strings } from "./strings";
import { heroPlate, locoArt, tractionIcon } from "./trainArt";
import { icon } from "./icons";

const announced = new Set<string>();
const engines: string[] = [];
let host: { container: HTMLElement; onRoster: () => void } | null = null;
let showing: HTMLElement | null = null;

function close(): void {
  showing?.remove();
  showing = null;
  engines.length = 0;
}

function engineRow(def: LocomotiveDef): HTMLElement {
  return h(
    "div",
    { className: "new-engine-row" },
    h("span", { className: "news-thumb-art new-engine-thumb" }, locoArt(def, 30)),
    h(
      "span",
      { className: "new-engine-row-main" },
      h("b", { className: "eng-name" }, def.name),
      h(
        "span",
        { className: "new-engine-row-stats" },
        `${formatSpeed(def.maxSpeedKmh, loadSettings().units)} · ${def.maxCars} ${strings.newEngine.cars}`,
      ),
    ),
    h(
      "span",
      { className: "year-chip" },
      icon("calendar", "icon-xs"),
      strings.newEngine.year(def.introYear),
    ),
  );
}

/** One card for every engine announced since the player last dismissed it (Phase 28B). It never
 * dims or blocks the map: only the card itself takes pointer events. */
function render(): void {
  if (!host) return;
  const defs = engines.map((id) => locomotiveById(id)).filter((d): d is LocomotiveDef => !!d);
  if (defs.length === 0) return;
  const n = strings.newEngine;
  const actions = h(
    "div",
    { className: "new-engine-actions" },
    footerButton({
      kind: "secondary",
      icon: "roster",
      label: n.roster,
      className: "new-engine-roster",
      onClick: () => {
        const open = host?.onRoster;
        close();
        open?.();
      },
    }),
    footerButton({ kind: "primary", label: n.ok, className: "new-engine-ok", onClick: close }),
  );
  const overline = h(
    "div",
    { className: "new-engine-overline" },
    icon(tractionIcon(defs[0] as LocomotiveDef), "icon-sm"),
    defs.length === 1 ? n.overline : n.overlineMany(defs.length),
  );
  const card = h("div", { className: "new-engine-card", role: "dialog", "aria-label": n.overline });
  if (defs.length === 1) {
    const def = defs[0] as LocomotiveDef;
    card.append(
      overline,
      heroPlate(def, 88),
      h(
        "div",
        { className: "new-engine-title" },
        h("h2", { className: "eng-name" }, def.name),
        h("span", { className: "year-chip" }, icon("calendar", "icon-xs"), n.year(def.introYear)),
      ),
      statRow(
        statTile({
          icon: "gauge",
          value: formatSpeed(def.maxSpeedKmh, loadSettings().units),
          caption: strings.trains.stats.speed,
        }),
        statTile({ icon: "power", value: String(def.power), caption: strings.trains.stats.power }),
        statTile({
          icon: "trains",
          value: String(def.maxCars),
          caption: strings.trains.stats.maxCars,
        }),
      ),
      actions,
    );
  } else {
    card.append(
      overline,
      h("div", { className: "new-engine-list" }, ...defs.map(engineRow)),
      actions,
    );
  }
  const wrap = h("div", { className: "new-engine-scrim" }, card);
  showing?.remove();
  showing = wrap;
  host.container.appendChild(wrap);
}

/** Adds `locoId` to the announcement card (ignored when it was already announced this session).
 * Engines announced while the card is still up join it instead of queueing another card. */
export function announceNewEngine(
  container: HTMLElement,
  locoId: string,
  onRoster: () => void,
): void {
  if (announced.has(locoId)) return;
  announced.add(locoId);
  engines.push(locoId);
  host = { container, onRoster };
  render();
}

/** Drops the card and any engines waiting in it (a new game or a loaded save). */
export function dismissNewEngineCard(): void {
  close();
}
