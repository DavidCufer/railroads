/** Phase 90 bench helper (import for the side effect; bench only, nothing under src/ changes). Rewrites data tables in place
 * before any run starts:
 *   PAX_PAIRSHARE=<x>   route-demand pair share (`ROUTE_DEMAND.pairShare`)
 *   FREIGHT_OUT=<x>     monthly output of every raw producer x this (coal, ore, wood, grain, livestock, oil, silver and uranium ore)
 *   FREIGHT_RATE=<x>    base rate of every freight cargo (not passengers or mail) x this
 */
import { ROUTE_DEMAND } from "../../src/data/economy";
import { INDUSTRIES } from "../../src/data/industries";
import { CARGO, type CargoType } from "../../src/data/cargo";

if (process.env["PAX_PAIRSHARE"]) ROUTE_DEMAND.pairShare = Number(process.env["PAX_PAIRSHARE"]);
const out = Number(process.env["FREIGHT_OUT"] ?? 1);
if (out !== 1)
  for (const def of Object.values(INDUSTRIES))
    if (Object.keys(def.consumes).length === 0)
      for (const c of Object.keys(def.produces) as CargoType[])
        def.produces[c] = (def.produces[c] ?? 0) * out;
const rate = Number(process.env["FREIGHT_RATE"] ?? 1);
if (rate !== 1)
  for (const c of Object.keys(CARGO) as CargoType[])
    if (c !== "passengers" && c !== "mail") CARGO[c].baseRate *= rate;
