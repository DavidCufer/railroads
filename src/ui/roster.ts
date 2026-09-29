/**
 * Roster — the "engine shed" gallery (STYLE §11.3): every locomotive in introduction order, one row
 * per traction type; models not yet built are dark silhouettes with only their year. Tapping a card
 * opens a detail view (large drawing, wheel arrangement, stat bars, owned count, a short note).
 * Reached from the menu and the top bar's era badge.
 */
import { LOCOMOTIVES, type LocomotiveDef, type LocomotiveType } from "../data/trains";
import { eraInflation } from "../data/finance";
import { computeBuyTrainPlan } from "../sim/commands";
import type { GameState } from "../sim/state";
import { calendarFromTicks } from "../sim/time";
import { h } from "./h";
import { icon } from "./icons";
import { strings } from "./strings";
import {
  heroPlate,
  isNewModel,
  statBlock,
  tractionIcon,
  typeChip,
  wheelGlyph,
} from "./train/engineParts";
import { rosterOrder } from "./train/locoStats";
import { locoSilhouetteThumb, locoThumb } from "./train/pictures";
import { openSheet, type SheetHandle } from "./train/sheet";

export interface RosterOptions {
  /** Highlight (and scroll to) this model — used by the new-engine card's Roster button. */
  focus?: string | undefined;
  /** Open straight into this model's detail view. */
  detail?: string | undefined;
}

const ROWS: readonly LocomotiveType[] = ["steam", "diesel", "electric"];

export function openRoster(
  container: HTMLElement,
  state: GameState,
  options: RosterOptions = {},
): void {
  const r = strings.roster;
  const year = calendarFromTicks(state.startYear, state.ticks).year;
  const ordered = rosterOrder(LOCOMOTIVES);
  const built = ordered.filter((l) => l.introYear <= year);
  let sheet: SheetHandle | null = null;

  const ownedCount = (id: string): number =>
    state.trains.filter((t) => t.locoModelId === id).length;

  function card(loco: LocomotiveDef): HTMLElement {
    const future = loco.introYear > year;
    if (future) {
      return h(
        "div",
        { className: "ros-card future", "data-loco": loco.id, "aria-label": r.silhouette },
        h("span", { className: "ros-pic" }, locoSilhouetteThumb(loco, 116, 42)),
        h("span", { className: "ros-name" }, "?"),
        h("span", { className: "ros-year" }, r.comingIn(loco.introYear)),
      );
    }
    return h(
      "button",
      {
        className: `ros-card${options.focus === loco.id ? " focus" : ""}`,
        "data-loco": loco.id,
        onClick: () => showDetail(loco),
      },
      h("span", { className: "ros-pic" }, locoThumb(loco, 116, 42)),
      h("span", { className: "ros-name" }, loco.name),
      h(
        "span",
        { className: "ros-year" },
        String(loco.introYear),
        isNewModel(loco, year)
          ? h("span", { className: "chip chip-new" }, strings.trains.newBadge)
          : null,
        ownedCount(loco.id) > 0
          ? h("span", { className: "ros-owned" }, `×${ownedCount(loco.id)}`)
          : null,
      ),
    );
  }

  function showList(): void {
    if (!sheet) return;
    sheet.setHeaderExtra(null);
    sheet.body.replaceChildren(
      h(
        "div",
        { className: "ros-rows" },
        ...ROWS.map((type) => {
          const models = ordered.filter((l) => l.type === type);
          return h(
            "div",
            { className: `ros-row ros-${type}` },
            h(
              "div",
              { className: "ros-tag" },
              icon(tractionIcon(type)),
              h("span", null, strings.roster.rows[type]),
            ),
            h("div", { className: "ros-strip" }, ...models.map(card)),
          );
        }),
      ),
    );
    sheet.footer.replaceChildren();
    sheet.footer.style.display = "none";
    sheet.body
      .querySelector(".ros-card.focus")
      ?.scrollIntoView({ inline: "center", block: "nearest" });
  }

  function showDetail(loco: LocomotiveDef): void {
    if (!sheet) return;
    const price = computeBuyTrainPlan(state, loco.id, []).cost;
    const running = loco.maintenancePerYear * eraInflation(year);
    const glyph = wheelGlyph(loco);
    const owned = ownedCount(loco.id);
    sheet.body.replaceChildren(
      h(
        "div",
        { className: "ros-detail" },
        h(
          "div",
          { className: "ros-detail-left" },
          h(
            "button",
            { className: "ros-back", onClick: showList },
            icon("back", "icon-sm"),
            r.detailBack,
          ),
          heroPlate(loco, 96),
          h("div", { className: "hero-title" }, h("div", { className: "hero-name" }, loco.name)),
          h(
            "div",
            { className: "hero-chips" },
            typeChip(loco),
            glyph ? h("span", { className: "chip chip-glyph" }, glyph) : null,
            h("span", { className: "chip" }, r.introduced(loco.introYear)),
            h("span", { className: "chip" }, r.owned(owned)),
          ),
        ),
        h(
          "div",
          { className: "ros-detail-right" },
          h("p", { className: "ros-note" }, strings.rosterNotes[loco.id] ?? ""),
          statBlock({
            loco,
            pool: LOCOMOTIVES,
            price,
            running,
          }),
        ),
      ),
    );
  }

  sheet = openSheet(container, {
    title: r.title,
    subtitle: r.subtitle(built.length, LOCOMOTIVES.length),
    className: "roster-sheet",
    onClose: () => {
      sheet = null;
    },
  });
  const detail = options.detail ? LOCOMOTIVES.find((l) => l.id === options.detail) : undefined;
  if (detail && detail.introYear <= year) showDetail(detail);
  else showList();
}
