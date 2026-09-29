/**
 * Resource discoveries (Phase 26A "empty land becomes useful"): every few years a new raw producer
 * (mine, forest, farm, ranch, oil field) appears in an under-served part of the map, so the empty
 * corners eventually get something worth a railway. Deterministic: seeded RNG only.
 */
import {
  DISCOVERY_CHANCE_PER_MONTH,
  DISCOVERY_EMPTY_FRACTION,
  INDUSTRIES,
  INDUSTRY_TYPES,
  type IndustryType,
} from "../../data/industries";
import { pushNews } from "../news";
import { createRng, nextFloat, nextInt } from "../rng";
import type { GameState } from "../state";
import { calendarFromTicks } from "../time";
import { industrySites, placeNewIndustry } from "./industryDynamics";

/** Distance (tiles) from `idx` to the nearest industry or city anchor — the emptiness score. */
function isolation(state: GameState, idx: number): number {
  const x = idx % state.map.width;
  const y = Math.floor(idx / state.map.width);
  let best = Infinity;
  for (const i of state.industries) best = Math.min(best, Math.hypot(x - i.x, y - i.y));
  for (const c of state.cities) best = Math.min(best, Math.hypot(x - c.anchorX, y - c.anchorY));
  return best;
}

export function monthlyDiscoveryStep(state: GameState): void {
  // Own stream derived from (seed, tick): deterministic, and it leaves the shared `state.rng` sequence
  // (breakdowns, growth, ...) untouched.
  const rng = createRng((state.seed ^ (state.ticks * 2654435761) ^ 101) >>> 0);
  if (nextFloat(rng) >= DISCOVERY_CHANCE_PER_MONTH) return;
  const year = calendarFromTicks(state.startYear, state.ticks).year;
  const eligible = INDUSTRY_TYPES.filter(
    (t) => INDUSTRIES[t].placement.kind === "terrain" && INDUSTRIES[t].era <= year,
  );
  if (eligible.length === 0) return;
  const type = eligible[nextInt(rng, 0, eligible.length - 1)] as IndustryType;
  const { candidates } = industrySites(state, type);
  if (candidates.length === 0) return;

  const ranked = candidates
    .map((idx) => ({ idx, score: isolation(state, idx) }))
    .sort((a, b) => b.score - a.score || a.idx - b.idx);
  const pool = ranked.slice(0, Math.max(1, Math.ceil(ranked.length * DISCOVERY_EMPTY_FRACTION)));
  const pick = pool[nextInt(rng, 0, pool.length - 1)] as { idx: number };
  const id = placeNewIndustry(state, type, pick.idx);
  pushNews(state, { kind: "discovery", industryId: id });
}
