/**
 * Industry processing chains (SPEC §8.2): a monthly step that turns a processor's accumulated
 * input stock into output, which becomes next month's `monthlyOutput` — the figure
 * src/sim/stations/economy.ts distributes to covering stations as daily supply (in place of the
 * static `produces` table raw producers use directly).
 */
import { CARGO, CARGO_TYPES, type CargoType } from "../../data/cargo";
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

  // "any": each accepted input contributes toward the shared output cap *carload for carload*
  // (PLAN Phase 16) rather than raw unit for raw unit — real per-cargo capacities differ (e.g. the
  // Food Plant's grain-or-livestock recipe: 20 units/car of grain vs. 15 units/car of livestock), so
  // a straight unit-for-unit sum would make one input's carloads worth more output than the other's.
  let remainingCarloads = capacity / CARGO[outputCargo].capacity;
  let outputCarloads = 0;
  for (const [cargo] of consumesEntries) {
    const inputCarloads = (inputStock[cargo] ?? 0) / CARGO[cargo].capacity;
    const useCarloads = Math.min(inputCarloads, remainingCarloads);
    consumed[cargo] = useCarloads * CARGO[cargo].capacity;
    outputCarloads += useCarloads;
    remainingCarloads -= useCarloads;
  }
  return { output: { [outputCargo]: outputCarloads * CARGO[outputCargo].capacity }, consumed };
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
    econ.lastReport = { received: econ.receivedMonth ?? {}, made: output };
    econ.receivedMonth = {};
    for (const cargo of CARGO_TYPES) {
      const used = consumed[cargo];
      if (!used) continue;
      econ.inputStock[cargo] = Math.max(0, (econ.inputStock[cargo] ?? 0) - used);
    }
    econ.monthlyOutput = output;
  }
}

/** A processor's books for the UI (Phase 33): what it got last month, what it made, what it holds and which
 * input is holding it up. Pure. `missing` is judged on the live stock — "all" recipes (Steel Mill) need every
 * input, so any empty one is missing; "any" recipes only miss inputs when none has arrived. */
export interface ProcessorStatus {
  receivedLast: Partial<Record<CargoType, number>>;
  madeLast: Partial<Record<CargoType, number>>;
  stock: Partial<Record<CargoType, number>>;
  missing: CargoType[];
}

const STOCK_EPSILON = 0.05;

export function processorStatus(state: GameState, industry: Industry): ProcessorStatus | undefined {
  const def = INDUSTRIES[industry.type];
  const inputs = Object.keys(def.consumes) as CargoType[];
  if (inputs.length === 0) return undefined;
  const econ = state.industryEconomy.get(industry.id);
  const stock = econ?.inputStock ?? {};
  const empty = inputs.filter((c) => (stock[c] ?? 0) < STOCK_EPSILON);
  const missing = def.recipeMode === "all" || empty.length === inputs.length ? empty : [];
  return {
    receivedLast: econ?.lastReport?.received ?? {},
    madeLast: econ?.lastReport?.made ?? {},
    stock,
    missing,
  };
}
