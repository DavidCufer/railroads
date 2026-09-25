/**
 * Industry processing chains (SPEC §8.2): a monthly step that turns a processor's accumulated
 * input stock into output, which becomes next month's `monthlyOutput` — the figure
 * src/sim/stations/economy.ts distributes to covering stations as daily supply (in place of the
 * static `produces` table raw producers use directly).
 */
import { CARGO_TYPES, type CargoType } from "../../data/cargo";
import { INDUSTRIES, type IndustryDef } from "../../data/industries";
import type { GameState } from "../state";
import type { Industry, IndustryEconomyState } from "./types";

export function getOrCreateIndustryEconomy(
  state: GameState,
  industryId: number,
): IndustryEconomyState {
  let econ = state.industryEconomy.get(industryId);
  if (!econ) {
    econ = { inputStock: {}, monthlyOutput: {} };
    state.industryEconomy.set(industryId, econ);
  }
  return econ;
}

/** A fresh `industryEconomy` map for newly-placed industries (game creation) — raw producers (and
 * Port, which has no recipe) start producing immediately; processors start at 0 until their first
 * month of accumulated inputs is processed (SPEC §8.2: "appears... the following month"). */
export function initIndustryEconomy(
  industries: readonly Industry[],
): Map<number, IndustryEconomyState> {
  const map = new Map<number, IndustryEconomyState>();
  for (const industry of industries) {
    const def = INDUSTRIES[industry.type];
    const isRaw = Object.keys(def.consumes).length === 0;
    map.set(industry.id, { inputStock: {}, monthlyOutput: isRaw ? { ...def.produces } : {} });
  }
  return map;
}

/** Runs one month of processing for `def` against `inputStock` (not mutated here — the caller
 * applies `consumed`). SPEC §8.2: Steel Mill needs *both* coal and ore (`recipeMode: "all"`);
 * Food Plant/Factory/Sawmill/Refinery accept *either* listed input on its own (`"any"`), summing
 * toward the single monthly output cap (`produces`' value). */
export function processIndustryMonth(
  def: IndustryDef,
  inputStock: Partial<Record<CargoType, number>>,
): { output: Partial<Record<CargoType, number>>; consumed: Partial<Record<CargoType, number>> } {
  const consumesEntries = Object.entries(def.consumes) as Array<[CargoType, number]>;
  const producesEntries = Object.entries(def.produces) as Array<[CargoType, number]>;
  if (consumesEntries.length === 0 || producesEntries.length === 0)
    return { output: {}, consumed: {} };

  const [outputCargo, capacity] = producesEntries[0] as [CargoType, number];
  const consumed: Partial<Record<CargoType, number>> = {};

  if (def.recipeMode === "all") {
    const available = Math.min(...consumesEntries.map(([cargo]) => inputStock[cargo] ?? 0));
    const output = Math.min(available, capacity);
    for (const [cargo] of consumesEntries) consumed[cargo] = output;
    return { output: { [outputCargo]: output }, consumed };
  }

  let remaining = capacity;
  let output = 0;
  for (const [cargo] of consumesEntries) {
    const use = Math.min(inputStock[cargo] ?? 0, remaining);
    consumed[cargo] = use;
    output += use;
    remaining -= use;
  }
  return { output: { [outputCargo]: output }, consumed };
}

/** Monthly processing step for every industry (SPEC §8.2), called on the month boundary tick. */
export function monthlyIndustryStep(state: GameState): void {
  for (const industry of state.industries) {
    const def = INDUSTRIES[industry.type];
    const econ = getOrCreateIndustryEconomy(state, industry.id);
    if (Object.keys(def.consumes).length === 0) {
      // Raw (terrain-placed) producers scale with industry dynamics' growth/shrink multiplier
      // (SPEC §8.2, Phase 9); Port has no `consumes` either but isn't terrain-placed, so it's
      // untouched by dynamics and `growthMult` stays undefined for it.
      const mult = def.placement.kind === "terrain" ? (econ.growthMult ?? 1) : 1;
      econ.monthlyOutput = Object.fromEntries(
        Object.entries(def.produces).map(([cargo, amount]) => [cargo, amount * mult]),
      );
      continue;
    }
    const { output, consumed } = processIndustryMonth(def, econ.inputStock);
    for (const cargo of CARGO_TYPES) {
      const used = consumed[cargo];
      if (!used) continue;
      econ.inputStock[cargo] = Math.max(0, (econ.inputStock[cargo] ?? 0) - used);
    }
    econ.monthlyOutput = output;
  }
}
