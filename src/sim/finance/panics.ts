/**
 * Financial panics (Phase 39): a pure function of the seed, the start year, the region and the difficulty — no state is
 * stored, so saves need nothing. During a panic demand for every cargo falls and lenders cut the credit limit.
 */
import {
  PANICS,
  PANIC_DEPTH_MAX,
  PANIC_DEPTH_RANGE,
  PANIC_MONTHS_RANGE,
  PANIC_QUIET_MONTHS,
  PANIC_RECOVERY_MONTHS,
} from "../../data/panics";
import { DIFFICULTY } from "../../data/finance";
import { createRng, nextFloat } from "../rng";
import { DAYS_PER_MONTH, HOURS_PER_DAY, MONTHS_PER_YEAR } from "../time";
import type { GameState } from "../state";

export interface Panic {
  name: string;
  year: number;
  startMonth: number; // months since the game began
  months: number;
  /** Fall in demand at the bottom, 0–1. */
  depth: number;
  /** Fuel price rise for steam and diesel while it lasts (0 = none). */
  fuelRise: number;
}

const TICKS_PER_MONTH = DAYS_PER_MONTH * HOURS_PER_DAY;
const cache = new Map<string, Panic[]>();

/** The game's panics, oldest first. */
export function panicSchedule(state: GameState): Panic[] {
  const key = `${state.seed}|${state.startYear}|${state.regionId ?? ""}|${state.difficulty}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const diff = DIFFICULTY[state.difficulty];
  const out: Panic[] = [];
  for (const def of PANICS) {
    if (def.regions && !(state.regionId && def.regions.includes(state.regionId))) continue;
    const rng = createRng((state.seed ^ Math.imul(def.year, 2654435761)) >>> 0);
    const happens = nextFloat(rng) < diff.panicChance;
    const monthInYear = Math.floor(nextFloat(rng) * MONTHS_PER_YEAR);
    const depth0 =
      PANIC_DEPTH_RANGE[0] + nextFloat(rng) * (PANIC_DEPTH_RANGE[1] - PANIC_DEPTH_RANGE[0]);
    const months0 =
      PANIC_MONTHS_RANGE[0] + nextFloat(rng) * (PANIC_MONTHS_RANGE[1] - PANIC_MONTHS_RANGE[0]);
    const startMonth = (def.year - state.startYear) * MONTHS_PER_YEAR + monthInYear;
    if (!happens || startMonth < PANIC_QUIET_MONTHS) continue;
    out.push({
      name: def.name,
      year: def.year,
      startMonth,
      months: Math.round(months0 * diff.panicDurationMult),
      depth: Math.min(PANIC_DEPTH_MAX, depth0 * diff.panicDepthMult),
      fuelRise: def.fuelRise ?? 0,
    });
  }
  cache.set(key, out);
  return out;
}

export interface PanicNow {
  panic: Panic;
  monthsLeft: number;
  /** Demand now as a fall 0–1: full depth, easing off over the last `PANIC_RECOVERY_MONTHS`. */
  demandFall: number;
}

/** The panic in force right now, if any. */
export function activePanic(state: GameState): PanicNow | undefined {
  const month = state.ticks / TICKS_PER_MONTH;
  for (const panic of panicSchedule(state)) {
    if (month < panic.startMonth || month >= panic.startMonth + panic.months) continue;
    const monthsLeft = Math.ceil(panic.startMonth + panic.months - month);
    return {
      panic,
      monthsLeft,
      demandFall: panic.depth * Math.min(1, monthsLeft / PANIC_RECOVERY_MONTHS),
    };
  }
  return undefined;
}

/** Multiplier on every station's supply of every cargo. */
export function panicDemandMult(state: GameState): number {
  const now = activePanic(state);
  return now ? 1 - now.demandFall : 1;
}

/** Multiplier on the credit limit: lenders pull back while the panic lasts. */
export function panicCreditMult(state: GameState): number {
  return activePanic(state) ? DIFFICULTY[state.difficulty].panicCreditMult : 1;
}

/** The panic that begins this very month (for the news item), if any. */
export function panicStartingNow(state: GameState): Panic | undefined {
  const month = state.ticks / TICKS_PER_MONTH;
  return panicSchedule(state).find((p) => p.startMonth === month);
}

/** Oil shock (Phase 42): fuel price factor for a locomotive of this type; electric traction is unaffected. The rise
 * eases off over the panic's last months like demand does. */
export function fuelPriceMult(state: GameState, locoType: string): number {
  if (locoType === "electric") return 1;
  const now = activePanic(state);
  if (!now || now.panic.fuelRise === 0) return 1;
  return 1 + now.panic.fuelRise * Math.min(1, now.monthsLeft / PANIC_RECOVERY_MONTHS);
}
