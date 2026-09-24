/** Station cost calculator (SPEC §6.1: base cost by type; "upgrade in place, paying the
 * difference"). Same era-inflation/difficulty scaling as track (src/sim/track/cost.ts). */
import { eraInflation } from "../../data/finance";
import { STATION_TYPE_DEFS, type StationType } from "../../data/stations";
import type { CostContext } from "../track/cost";

export function stationCost(type: StationType, ctx: CostContext): number {
  return STATION_TYPE_DEFS[type].cost * eraInflation(ctx.year) * ctx.buildCostMult;
}

/** Cost to upgrade from `from` to `to` — the difference between their (currently) scaled costs.
 * Only valid for `to` strictly above `from` in the Depot→Station→Terminal order; callers check
 * that via STATION_UPGRADE_ORDER before charging this. */
export function stationUpgradeCost(from: StationType, to: StationType, ctx: CostContext): number {
  return stationCost(to, ctx) - stationCost(from, ctx);
}
