/**
 * What the long-haul chain pays (Phase 40), for the station panel's one line: the chain's final cargo is paid only on
 * arrival at its customer (Mint / Nuclear Power Plant), by the distance from the mine, so before anything is built the
 * player can see what it is worth. Pure.
 */
import { CARGO, type CargoType } from "../../data/cargo";
import { INDUSTRIES, LONG_HAUL_CHAINS, longHaulOutputMult } from "../../data/industries";
import { calendarFromTicks } from "../time";
import type { GameState } from "../state";
import { computeRevenue, expectedTransitDays } from "../trains/loading";
import type { Industry } from "./types";

export interface ChainPayEstimate {
  /** The customer, e.g. "Mint". */
  sinkName: string;
  /** Dollars per ton of `cargo` asked about, at today's fares and a delivery on schedule. */
  perTon: number;
  /** Dollars a year if the mine's current output were all carried and delivered on schedule (Phase 41). */
  perYear: number;
}

const producerOf = (state: GameState, cargo: CargoType, raw: boolean): Industry | undefined =>
  state.industries.find((i) => {
    const def = INDUSTRIES[i.type];
    return (def.produces[cargo] ?? 0) > 0 && (Object.keys(def.consumes).length === 0) === raw;
  });

/** For ore or for the final cargo of the chain: what a ton is worth on arrival at the customer. Undefined for any
 * other cargo or when the map has no such chain. For ore the value is that of the bars it makes (a 20 t ore car makes
 * a 10 t bar car). */
export function chainPayEstimate(state: GameState, cargo: CargoType): ChainPayEstimate | undefined {
  const leg = CARGO[cargo].chainLeg;
  if (!leg) return undefined;
  const processor = Object.values(INDUSTRIES).find((d) =>
    leg === "intermediate"
      ? d.consumes[cargo] !== undefined
      : (d.produces[cargo] ?? 0) > 0 && Object.keys(d.consumes).length > 0,
  );
  if (!processor) return undefined;
  const final = leg === "final" ? cargo : (Object.keys(processor.produces)[0] as CargoType);
  const mine = producerOf(
    state,
    leg === "intermediate" ? cargo : (Object.keys(processor.consumes)[0] as CargoType),
    true,
  );
  const sink = state.industries.find((i) => (INDUSTRIES[i.type].acceptancePoints[final] ?? 0) > 0);
  if (!mine || !sink) return undefined;
  const distance = Math.hypot(mine.x - sink.x, mine.y - sink.y);
  const perCar = computeRevenue(state, final, distance, expectedTransitDays(final, distance));
  const perTonOfFinal = perCar / CARGO[final].capacity;
  const yieldPerTon = leg === "intermediate" ? CARGO[final].capacity / CARGO[cargo].capacity : 1;
  const oreCargo =
    leg === "intermediate" ? cargo : (Object.keys(processor.consumes)[0] as CargoType);
  const orePerMonth =
    state.industryEconomy.get(mine.id)?.monthlyOutput[oreCargo] ??
    (INDUSTRIES[mine.type].produces[oreCargo] ?? 0) *
      longHaulOutputMult(
        calendarFromTicks(state.startYear, state.ticks).year,
        mine.type === LONG_HAUL_CHAINS.uranium.mine ? "uranium" : "silver",
      );
  return {
    sinkName: INDUSTRIES[sink.type].name,
    perTon: perTonOfFinal * yieldPerTon,
    perYear: perTonOfFinal * (CARGO[final].capacity / CARGO[oreCargo].capacity) * orePerMonth * 12,
  };
}

/** Whether `cargo` has any use on this map: ordinary cargo always, a chain's ore and bars only when the map has an
 * industry that makes or takes them (a uranium game offers no silver cars). */
export function cargoUsableOnMap(state: GameState, cargo: CargoType): boolean {
  if (!CARGO[cargo].chainLeg) return true;
  return state.industries.some((i) => {
    const def = INDUSTRIES[i.type];
    return (
      (def.produces[cargo] ?? 0) > 0 ||
      def.consumes[cargo] !== undefined ||
      (def.acceptancePoints[cargo] ?? 0) > 0
    );
  });
}
