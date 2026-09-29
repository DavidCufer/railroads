/**
 * New-engine announcement (STYLE §11.4): a card dialog shown when a locomotive becomes available —
 * overline, the side view on a rail line, name, year, three key stats, and Roster / OK buttons.
 * Announcements queue so two models arriving in the same year show one after the other.
 */
import { locomotiveById } from "../data/trains";
import { pushBackHandler } from "./backButton";
import { footerButton } from "./components/footer";
import { h } from "./h";
import { strings } from "./strings";
import { heroPlate, statBlock, typeChip, wheelGlyph } from "./train/engineParts";
import { computeBuyTrainPlan } from "../sim/commands";
import { buyableLocomotivesIn } from "../data/trains";
import { eraInflation } from "../data/finance";
import type { GameState } from "../sim/state";
import { calendarFromTicks } from "../sim/time";

export interface NewEngineHandlers {
  onOpenRoster: (locoId: string) => void;
}

const queue: string[] = [];
let showing = false;

/** Queues an announcement for `locoId` (once per model per session). */
export function announceNewEngine(
  container: HTMLElement,
  state: GameState,
  locoId: string,
  handlers: NewEngineHandlers,
): void {
  if (queue.includes(locoId)) return;
  queue.push(locoId);
  if (!showing) showNext(container, state, handlers);
}

function showNext(container: HTMLElement, state: GameState, handlers: NewEngineHandlers): void {
  const id = queue.shift();
  if (id === undefined) {
    showing = false;
    return;
  }
  const loco = locomotiveById(id);
  if (!loco) return showNext(container, state, handlers);
  showing = true;
  const year = calendarFromTicks(state.startYear, state.ticks).year;
  const price = computeBuyTrainPlan(state, loco.id, []).cost;
  const glyph = wheelGlyph(loco);
  const n = strings.newEngine;

  const scrim = h("div", { className: "announce-scrim" });
  let unregister: () => void = () => {};
  const dismiss = (then?: () => void): void => {
    unregister();
    scrim.remove();
    then?.();
    showNext(container, state, handlers);
  };
  scrim.appendChild(
    h(
      "div",
      { className: "announce-card", role: "dialog", "aria-label": `${n.overline}: ${loco.name}` },
      h("div", { className: "announce-overline" }, n.overline),
      heroPlate(loco, 72),
      h(
        "div",
        { className: "announce-title" },
        h("div", { className: "hero-name" }, loco.name),
        h(
          "div",
          { className: "hero-chips" },
          typeChip(loco),
          glyph ? h("span", { className: "chip chip-glyph" }, glyph) : null,
          h("span", { className: "chip" }, n.intro(loco.introYear)),
        ),
      ),
      statBlock({
        loco,
        pool: buyableLocomotivesIn(year),
        price,
        running: loco.maintenancePerYear * eraInflation(year),
        only: ["speed", "power", "cars"],
        compact: true,
      }),
      h(
        "div",
        { className: "announce-actions" },
        footerButton({
          label: n.roster,
          icon: "roster",
          kind: "secondary",
          className: "announce-roster",
          onClick: () => dismiss(() => handlers.onOpenRoster(loco.id)),
        }),
        footerButton({
          label: n.ok,
          kind: "primary",
          className: "announce-ok",
          onClick: () => dismiss(),
        }),
      ),
    ),
  );
  container.appendChild(scrim);
  unregister = pushBackHandler(() => dismiss());
}
