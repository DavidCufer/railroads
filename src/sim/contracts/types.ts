/** Contract runtime types (Phase 45). Balance numbers: src/data/contracts.ts. */
import type { CargoType } from "../../data/cargo";
import type { ContractKind } from "../../data/contracts";
import { createRng, type RngState } from "../rng";

export interface Contract {
  id: number;
  kind: ContractKind;
  /** A delivery's or connection's town; a service's first town. */
  cityId?: number;
  /** A service's second town. */
  city2Id?: number;
  /** A rescue's producer. */
  industryId?: number;
  /** A delivery's or rescue's cargo (a service carries passengers). */
  cargo?: CargoType;
  /** Units to deliver/carry (0 for a connection). */
  target: number;
  /** Units counted so far, after acceptance only. */
  progress: number;
  /** Cash paid on completion; for a connection the cap on the track subsidy. */
  reward: number;
  /** Connection only: subsidy paid so far, the anchor tile on the network and the town's tile. */
  paid?: number;
  fromTile?: number;
  toTile?: number;
  /** Connection only: the stations that were on the network at acceptance. */
  anchorStationIds?: number[];
  offeredTick: number;
  /** An unaccepted offer lapses at this tick. */
  expiresTick: number;
  acceptedTick?: number;
  /** Time allowed once accepted, and the tick it runs out. */
  durationTicks: number;
  deadlineTick?: number;
}

export interface ContractStats {
  offered: number;
  completed: number;
  failed: number;
  /** Cash earned from rewards and track subsidies, and paid in penalties. */
  income: number;
  penalties: number;
}

export interface ContractsState {
  /** Own seeded stream: contracts never draw from the main one, so they cannot change a map or an economy. */
  rng: RngState;
  nextId: number;
  offers: Contract[];
  active: Contract[];
  /** Tick of the next offer attempt; unset until the first eligible month. */
  nextOfferTick?: number;
  stats: ContractStats;
}

export function createContractsState(seed: number): ContractsState {
  return {
    rng: createRng((seed ^ 0x434f4e54) >>> 0),
    nextId: 1,
    offers: [],
    active: [],
    stats: { offered: 0, completed: 0, failed: 0, income: 0, penalties: 0 },
  };
}
