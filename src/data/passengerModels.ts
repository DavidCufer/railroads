/**
 * Phase 89: passenger-model exploration (a dev flag, OFF by default; the shipped game is the "today" model of SPEC §9.5d).
 * `PAX.model` is a module-level switch read by the sim; benches (env PAX_MODEL) and debug builds (`?paxModel=route`) set it.
 * It is not saved. All numbers of the prototypes live here. See docs/explore/passengers-2.md.
 */
import { MAX_WAIT_DAYS } from "./economy";

export type PaxModel = "today" | "route" | "service" | "ticket";

export const PAX: { model: PaxModel } = { model: "today" };

/** Days of arrivals a platform holds under the prototypes (today: `MAX_WAIT_DAYS` = 30). The people who do not fit leave. */
export const PAX_HOLD_DAYS = 20;

/** Route demand (model "route"): every pair of towns your trains connect has its own monthly number each way,
 * `perHead x sqrt(popA x popB) x distance factor`, independent of what else you build. */
export const ROUTE_DEMAND = {
  /** Share of the geometric-mean town total (population x trips per head / party) that one pair sends each way. */
  pairShare: 0.28,
  /** Pairs nearer than this many tiles are not penalised; farther ones lose (ref / d) ^ exponent. */
  refTiles: 20,
  distExponent: 0.5,
  /** A town never sends more than this many times its own total (a hub with many pairs). */
  townCap: 1.5,
};

/** Service-driven demand (model "service"): the ceiling is the route demand x `ceilingMult`; the part that really travels is
 * `1 - exp(-departures a week / halfWeek)` of it, so the first trains add a lot and the sixth almost nothing. */
export const SERVICE_DEMAND = {
  ceilingMult: 1.3,
  /** Departures a week (each way) at which 63 % of the ceiling is reached. */
  scaleDeparturesPerWeek: 0.4,
  /** Even a rare service draws this share of the ceiling (people who plan around one train a week). */
  floor: 0.12,
};

/** Ticket office (model "ticket"): a town's travellers are a fixed budget of tickets a month, `budgetShare` of its total,
 * and all of it is sold to the destinations you serve (split by population / distance among those only). More destinations
 * share the budget, they do not add to it. */
export const TICKET_OFFICE = {
  budgetShare: 0.22,
};

/** Days a platform holds people: 30 today (`MAX_WAIT_DAYS`), `PAX_HOLD_DAYS` under a prototype. */
export function maxWaitDays(): number {
  return PAX.model === "today" ? MAX_WAIT_DAYS : PAX_HOLD_DAYS;
}
