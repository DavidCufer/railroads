/**
 * Roster — the "engine shed" gallery (STYLE §11.3): every locomotive in intro-year order on
 * steam / diesel / electric lanes; future models are black silhouettes with only the year. Tap a
 * known model for the large drawing, wheel arrangement, stat bars, owned count and a short note.
 */
import {
  LOCOMOTIVES,
  STEAM_PHASE_OUT_YEAR,
  type LocomotiveDef,
  type LocomotiveType,
} from "../data/trains";
import type { GameState } from "../sim/state";
import { calendarFromTicks } from "../sim/time";
import { h } from "./h";
import { icon } from "./icons";
import { bestOf, engineStats } from "./locoStats";
import { openSheet, type SheetHandle } from "./sheet";
import { strings } from "./strings";
import { heroPlate, locoArt, tractionIcon, wheelGlyphEl } from "./trainArt";

const LANES: readonly LocomotiveType[] = ["steam", "diesel", "electric"];

/** Trains in service per locomotive model. */
export function ownedCounts(state: GameState): Map<string, number> {
  const owned = new Map<string, number>();
  for (const t of state.trains) owned.set(t.locoModelId, (owned.get(t.locoModelId) ?? 0) + 1);
  return owned;
}

export function openRosterSheet(container: HTMLElement, state: GameState): SheetHandle {
  const r = strings.roster;
  const year = calendarFromTicks(state.startYear, state.ticks).year;
  const owned = ownedCounts(state);
  const best = bestOf(LOCOMOTIVES);
  const known = LOCOMOTIVES.filter((l) => l.introYear <= year);
  const ownedTotal = state.trains.length;
  const body = h("div", { className: "roster-body" });
  const laneEls: HTMLElement[] = [];
  let sheet: SheetHandle;

  function card(def: LocomotiveDef): HTMLElement {
    const future = def.introYear > year;
    const count = owned.get(def.id) ?? 0;
    const retired = def.type === "steam" && year > STEAM_PHASE_OUT_YEAR;
    const plate = h(
      "div",
      { className: `roster-plate${future ? " silhouette" : ""}` },
      locoArt(def, 38),
    );
    const kids: Array<Node | null> = [
      plate,
      h(
        "div",
        { className: "roster-name" },
        future ? h("span", { className: "roster-unknown" }, "???") : def.name,
      ),
      h(
        "div",
        { className: "roster-meta" },
        h("span", { className: "roster-year tabular" }, String(def.introYear)),
        future ? null : icon(tractionIcon(def), "icon-xs"),
        count > 0 ? h("span", { className: "roster-owned tabular" }, `×${count}`) : null,
        !future && retired ? h("span", { className: "roster-retired" }, r.retired) : null,
      ),
    ];
    return h(
      "button",
      {
        className: `roster-card${future ? " future" : ""}`,
        "data-testid": `roster-${def.id}`,
        "aria-label": future ? `${r.future} ${def.introYear}` : def.name,
        disabled: future,
        onClick: () => showDetail(def),
      },
      ...kids,
    );
  }

  function showList(): void {
    laneEls.length = 0;
    const lanes = LANES.map((type) => {
      const models = LOCOMOTIVES.filter((l) => l.type === type).sort(
        (a, b) => a.introYear - b.introYear,
      );
      const strip = h("div", { className: "roster-strip" }, ...models.map(card));
      laneEls.push(strip);
      return h(
        "section",
        { className: `roster-lane lane-${type}` },
        h(
          "div",
          { className: "roster-lane-label" },
          icon(tractionIcon({ type }), "icon-sm"),
          h("span", null, r.lanes[type]),
        ),
        strip,
      );
    });
    body.replaceChildren(...lanes);
    // Start each lane scrolled to the newest model that is already known.
    for (const [i, strip] of laneEls.entries()) {
      const type = LANES[i];
      const models = LOCOMOTIVES.filter((l) => l.type === type).sort(
        (a, b) => a.introYear - b.introYear,
      );
      const idx = Math.max(0, models.filter((m) => m.introYear <= year).length - 1);
      const target = strip.children[idx] as HTMLElement | undefined;
      if (target)
        strip.scrollLeft = Math.max(
          0,
          target.offsetLeft - strip.clientWidth / 2 + target.offsetWidth / 2,
        );
    }
  }

  function showDetail(def: LocomotiveDef): void {
    const glyph = wheelGlyphEl(def);
    const count = owned.get(def.id) ?? 0;
    body.replaceChildren(
      h(
        "div",
        { className: "roster-detail" },
        h(
          "div",
          { className: "roster-detail-left" },
          h(
            "button",
            { className: "roster-back", onClick: () => showList() },
            icon("arrowLeft", "icon-sm"),
            r.detailBack,
          ),
          heroPlate(def, 124),
          h(
            "div",
            { className: "eng-title" },
            h("h2", { className: "eng-name" }, def.name),
            h(
              "div",
              { className: "eng-chips" },
              h(
                "span",
                { className: "year-chip" },
                icon("calendar", "icon-xs"),
                String(def.introYear),
              ),
              h(
                "span",
                { className: "type-chip" },
                icon(tractionIcon(def), "icon-xs"),
                strings.trains.locoTypes[def.type],
              ),
            ),
          ),
        ),
        h(
          "div",
          { className: "roster-detail-right" },
          glyph
            ? h(
                "div",
                { className: "roster-wheels" },
                h("span", { className: "roster-wheels-label" }, r.wheels),
                glyph,
              )
            : null,
          engineStats(def, best, def.cost),
          h("div", { className: "roster-owned-line" }, icon("trains", "icon-sm"), r.owned(count)),
          h("p", { className: "roster-note" }, strings.locoNotes[def.id] ?? ""),
        ),
      ),
    );
  }

  sheet = openSheet(container, {
    className: "sheet-roster",
    title: r.title,
    subtitle: r.subtitle(ownedTotal, known.length, LOCOMOTIVES.length),
    body: [body],
  });
  showList();
  return sheet;
}
