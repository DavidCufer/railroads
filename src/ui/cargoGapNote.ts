/** The "no stop on this route accepts steel" note (PLAN Phase 33), shared by the Buy Train route step and the train panel. */
import { CARGO } from "../data/cargo";
import { INDUSTRIES } from "../data/industries";
import type { GameState } from "../sim/state";
import type { AcceptingPlace } from "../sim/stations/acceptors";
import type { CargoGap } from "../sim/trains/cargoGaps";
import { h } from "./h";
import { icon } from "./icons";
import { strings } from "./strings";

/** Name of the town nearest `tile` (to say where a Port or Factory is). */
export function nearestPlaceName(state: GameState, tile: number): string {
  const w = state.map.width;
  const tx = tile % w;
  const ty = Math.floor(tile / w);
  let best: { name: string; d: number } | undefined;
  for (const city of state.cities) {
    for (const ct of city.tiles) {
      const d = Math.hypot((ct % w) - tx, Math.floor(ct / w) - ty);
      if (!best || d < best.d) best = { name: city.name, d };
    }
  }
  return best?.name ?? "";
}

function placeName(state: GameState, place: AcceptingPlace): string {
  if (place.kind === "station") {
    return state.stations.find((s) => s.id === place.stationId)?.name ?? strings.fallback.place;
  }
  const industry = state.industries[place.industryId];
  const near = industry ? nearestPlaceName(state, industry.y * state.map.width + industry.x) : "";
  return `${near ? `${near} ` : ""}${INDUSTRIES[place.type].name}`;
}

export function cargoGapNote(state: GameState, gap: CargoGap): HTMLElement {
  const t = strings.trains.cargoGap;
  return h(
    "div",
    { className: "chip warn-chip cargo-gap-chip" },
    icon("warning", "icon-xs"),
    h(
      "span",
      null,
      t.text(CARGO[gap.cargo].name.toLowerCase(), gap.cars),
      gap.nearest.length > 0
        ? h(
            "span",
            { className: "cargo-gap-near" },
            `. ${t.nearest(gap.nearest.map((p) => placeName(state, p)))}${
              gap.nearest[0]?.kind === "industry" ? ` — ${t.buildBeside}` : ""
            }`,
          )
        : null,
    ),
  );
}
