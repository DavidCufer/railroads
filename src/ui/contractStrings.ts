/** Renders a `Contract` (Phase 45) as one line — shared by the Contracts panel and the news, like goalStrings. */
import { CARGO } from "../data/cargo";
import { CONNECTION } from "../data/contracts";
import { INDUSTRIES } from "../data/industries";
import type { Contract } from "../sim/contracts/types";
import type { GameState } from "../sim/state";
import { MONTH_NAMES, calendarFromTicks } from "../sim/time";
import { formatMoney } from "./format";
import { strings } from "./strings";

function cityName(state: GameState, id: number | undefined): string {
  return (id !== undefined ? state.cities[id]?.name : undefined) ?? strings.fallback.city;
}

export function nearestCity(state: GameState, x: number, y: number): string {
  let best: { name: string; d: number } | undefined;
  for (const c of state.cities) {
    const d = Math.hypot(c.anchorX - x, c.anchorY - y);
    if (c.tiles.length > 0 && (!best || d < best.d)) best = { name: c.name, d };
  }
  return best?.name ?? strings.fallback.place;
}

export function amountText(c: Contract): string {
  const def = CARGO[c.cargo ?? "passengers"];
  const n = c.target.toLocaleString("en-US");
  return def.unit && c.kind !== "service" ? `${n} ${def.unit}` : n;
}

/** "Mar 1862" of the contract's deadline (or, for an open offer, of the deadline were it accepted today). */
export function deadlineText(state: GameState, c: Contract): string {
  const tick = c.deadlineTick ?? state.ticks + c.durationTicks;
  const cal = calendarFromTicks(state.startYear, tick);
  return `${(MONTH_NAMES[cal.month - 1] ?? "").slice(0, 3)} ${cal.year}`;
}

export function describeContract(state: GameState, c: Contract): string {
  const date = deadlineText(state, c);
  switch (c.kind) {
    case "delivery":
      return strings.contracts.delivery(
        cityName(state, c.cityId),
        amountText(c),
        CARGO[c.cargo ?? "coal"].name.toLowerCase(),
        date,
      );
    case "connection":
      return strings.contracts.connection(
        cityName(state, c.cityId),
        Math.round(CONNECTION.subsidyShare * 100),
        date,
      );
    case "service":
      return strings.contracts.service(
        cityName(state, c.cityId),
        cityName(state, c.city2Id),
        amountText(c),
        date,
      );
    case "rescue": {
      const industry = state.industries[c.industryId ?? -1];
      return strings.contracts.rescue(
        industry ? INDUSTRIES[industry.type].name : strings.fallback.place,
        industry ? nearestCity(state, industry.x, industry.y) : strings.fallback.place,
        amountText(c),
        CARGO[c.cargo ?? "coal"].name.toLowerCase(),
        date,
      );
    }
  }
}

/** Where to look on the map when the player taps the contract. */
export function contractFocusTile(state: GameState, c: Contract): { x: number; y: number } | null {
  if (c.kind === "rescue") {
    const i = state.industries[c.industryId ?? -1];
    return i ? { x: i.x, y: i.y } : null;
  }
  const city = state.cities[c.cityId ?? -1];
  return city ? { x: city.anchorX, y: city.anchorY } : null;
}

export function rewardText(c: Contract): string {
  return c.kind === "connection"
    ? strings.contracts.paysUpTo(formatMoney(c.reward))
    : strings.contracts.pays(formatMoney(c.reward));
}
