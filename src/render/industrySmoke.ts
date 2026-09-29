/** Live chimney smoke for working processors, through the shared particle pool (STYLE §10). The baked
 * industry icons (industries.ts) carry no smoke of their own. Renderer-only; reads state, never writes. */
import type { IndustryType } from "../data/industries";
import { emitSmoke, INDUSTRY_EMITTER_BASE, lastSmokeDt, SMOKE_MIN_ZOOM } from "./art/smoke";
import type { Camera } from "./camera";
import { TILE_SIZE } from "./camera";
import { industrySmokeSources } from "./industries";

interface SmokeIndustry {
  id: number;
  type: IndustryType;
  x: number;
  y: number;
}
interface SmokeEconomy {
  monthlyOutput: Partial<Record<string, number>>;
}

/** Puffs per chimney per second. */
const RATE = 1.1;

/** A processor is "working" when it has a positive monthly output this month. */
export function isWorking(econ: SmokeEconomy | undefined): boolean {
  if (!econ) return false;
  for (const v of Object.values(econ.monthlyOutput)) if ((v ?? 0) > 0) return true;
  return false;
}

/** Emits chimney smoke for visible working industries. Call once per frame after `drawTrains`
 * (which advances the shared clock); emitted puffs are drawn from the next frame on. */
export function emitIndustrySmoke(
  camera: Camera,
  viewportW: number,
  viewportH: number,
  industries: readonly SmokeIndustry[],
  economy: ReadonlyMap<number, SmokeEconomy>,
): void {
  if (camera.zoom < SMOKE_MIN_ZOOM) return;
  const dt = lastSmokeDt();
  if (dt <= 0) return;
  const margin = TILE_SIZE * camera.zoom * 2;
  for (const ind of industries) {
    const sources = industrySmokeSources(ind.type);
    if (sources.length === 0) continue;
    const s = camera.worldToScreen(ind.x * TILE_SIZE, ind.y * TILE_SIZE, viewportW, viewportH);
    if (s.x < -margin || s.y < -margin || s.x > viewportW + margin || s.y > viewportH + margin)
      continue;
    if (!isWorking(economy.get(ind.id))) continue;
    sources.forEach(([fx, fy], i) => {
      emitSmoke(
        INDUSTRY_EMITTER_BASE + ind.id * 8 + i,
        dt,
        RATE,
        (ind.x + fx) * TILE_SIZE,
        (ind.y + fy) * TILE_SIZE,
        0,
        0,
        "chimney",
      );
    });
  }
}
