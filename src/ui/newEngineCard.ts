/**
 * New engine announcement (STYLE §11.4): when a locomotive model becomes available, a card dialog
 * shows its side view on a rail line, name, year and three key stats, with Roster / OK. Once per
 * model; several announcements in the same year queue up.
 */
import { locomotiveById } from "../data/trains";
import { footerButton } from "./components/footer";
import { statRow, statTile } from "./components/statTile";
import { h } from "./h";
import { formatSpeed, loadSettings } from "./settings";
import { strings } from "./strings";
import { heroPlate, tractionIcon } from "./trainArt";
import { icon } from "./icons";

const announced = new Set<string>();
const queue: Array<{ container: HTMLElement; locoId: string; onRoster: () => void }> = [];
let showing: HTMLElement | null = null;

function showNext(): void {
  if (showing) return;
  const next = queue.shift();
  if (!next) return;
  const def = locomotiveById(next.locoId);
  if (!def) {
    showNext();
    return;
  }
  const n = strings.newEngine;
  const close = (): void => {
    showing?.remove();
    showing = null;
    showNext();
  };
  const card = h(
    "div",
    { className: "new-engine-card", role: "dialog", "aria-label": n.overline },
    h("div", { className: "new-engine-overline" }, icon(tractionIcon(def), "icon-sm"), n.overline),
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
    h(
      "div",
      { className: "new-engine-actions" },
      footerButton({
        kind: "secondary",
        icon: "roster",
        label: n.roster,
        className: "new-engine-roster",
        onClick: () => {
          close();
          next.onRoster();
        },
      }),
      footerButton({ kind: "primary", label: n.ok, className: "new-engine-ok", onClick: close }),
    ),
  );
  showing = h("div", { className: "modal-scrim new-engine-scrim" }, card);
  next.container.appendChild(showing);
}

/** Queues the announcement for `locoId` (ignored when it was already announced this session). */
export function announceNewEngine(
  container: HTMLElement,
  locoId: string,
  onRoster: () => void,
): void {
  if (announced.has(locoId)) return;
  announced.add(locoId);
  queue.push({ container, locoId, onRoster });
  showNext();
}
