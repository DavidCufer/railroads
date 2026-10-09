/**
 * Contract lifecycle (Phase 45): offers, acceptance, progress from real deliveries and real track, completion,
 * failure. Only deliveries made and track built *after* acceptance count. All cash moves here and in commands.ts's
 * accept/decline wrappers; the UI never touches contract state.
 */
import {
  MAX_ACTIVE,
  MAX_OFFERS,
  MIN_MONTHS_BEFORE_OFFERS,
  MIN_STATIONS,
  OFFER_GAP_MONTHS,
  PENALTY_SHARE,
  RESCUE,
  WARY_MONTHS,
  CONNECTION,
} from "../../data/contracts";
import { INDUSTRY_GROWTH_MULT_MAX, INDUSTRY_GROWTH_MULT_MIN } from "../../data/industries";
import { addExpense } from "../finance/ledger";
import { getOrCreateIndustryEconomy } from "../economy/processing";
import { pushNews } from "../news";
import { nextInt } from "../rng";
import type { GameState } from "../state";
import type { Station } from "../stations/types";
import { stationAtTile } from "../stations/placement";
import { DAYS_PER_MONTH, HOURS_PER_DAY } from "../time";
import { generateOffer } from "./generate";
import { networkStations, stationCoversCity, stationCoversIndustry, tileDistance } from "./places";
import type { Contract } from "./types";

const MONTH_TICKS = DAYS_PER_MONTH * HOURS_PER_DAY;

export type ContractReason = "invalid-contract" | "too-many-contracts";

// --- Commands' bodies ---------------------------------------------------------------------------------------------

export function acceptContractImpl(state: GameState, id: number): ContractReason | null {
  const cs = state.contracts;
  const i = cs.offers.findIndex((c) => c.id === id);
  if (i < 0) return "invalid-contract";
  if (cs.active.length >= MAX_ACTIVE) return "too-many-contracts";
  const [c] = cs.offers.splice(i, 1) as [Contract];
  c.acceptedTick = state.ticks;
  c.deadlineTick = state.ticks + c.durationTicks;
  if (c.kind === "connection") c.anchorStationIds = networkStations(state).map((s) => s.id);
  cs.active.push(c);
  return null;
}

export function declineContractImpl(state: GameState, id: number): ContractReason | null {
  const i = state.contracts.offers.findIndex((c) => c.id === id);
  if (i < 0) return "invalid-contract";
  state.contracts.offers.splice(i, 1);
  return null;
}

export function abandonContractImpl(state: GameState, id: number): ContractReason | null {
  const c = state.contracts.active.find((x) => x.id === id);
  if (!c) return "invalid-contract";
  failContract(state, c);
  return null;
}

// --- Finishing ----------------------------------------------------------------------------------------------------

function removeActive(state: GameState, c: Contract): void {
  state.contracts.active = state.contracts.active.filter((x) => x !== c);
}

function completeContract(state: GameState, c: Contract): void {
  removeActive(state, c);
  const stats = state.contracts.stats;
  stats.completed++;
  // a connection's money was the track subsidy, paid as it was built
  let money = c.paid ?? 0;
  if (c.kind !== "connection") {
    money = c.reward;
    state.cash += money;
    stats.income += money;
  }
  if (c.kind === "rescue" && c.industryId !== undefined) {
    const econ = getOrCreateIndustryEconomy(state, c.industryId);
    econ.growthMult = Math.min(
      INDUSTRY_GROWTH_MULT_MAX,
      (econ.growthMult ?? 1) * RESCUE.successGrowth,
    );
  }
  pushNews(state, { kind: "contract", event: "completed", contract: { ...c }, money });
}

function failContract(state: GameState, c: Contract): void {
  removeActive(state, c);
  const stats = state.contracts.stats;
  stats.failed++;
  const penalty = Math.min(Math.max(0, state.cash), Math.round(c.reward * PENALTY_SHARE));
  state.cash -= penalty;
  stats.penalties += penalty;
  if (c.kind === "rescue" && c.industryId !== undefined) {
    const econ = getOrCreateIndustryEconomy(state, c.industryId);
    econ.growthMult = Math.max(
      INDUSTRY_GROWTH_MULT_MIN,
      (econ.growthMult ?? 1) * RESCUE.failureDecline,
    );
  }
  // the towns are wary: the next offer comes later
  const wary = state.ticks + WARY_MONTHS * MONTH_TICKS;
  state.contracts.nextOfferTick = Math.max(state.contracts.nextOfferTick ?? 0, wary);
  pushNews(state, { kind: "contract", event: "failed", contract: { ...c }, money: penalty });
}

// --- Progress hooks -----------------------------------------------------------------------------------------------

/** A paid delivery of `units` of `cargo` at `station`, loaded at `origin` (tile): counts towards every matching active
 * contract. Called from the unload only after the delivery paid, so a hop too short to earn anything never counts. */
export function recordContractDelivery(
  state: GameState,
  station: Station,
  cargo: string,
  units: number,
  origin: number | undefined,
): void {
  const active = state.contracts.active;
  if (active.length === 0 || units <= 0) return;
  const originStation = origin !== undefined ? stationAtTile(state.stations, origin) : undefined;
  for (const c of [...active]) {
    let hit = false;
    if (c.kind === "delivery" && c.cargo === cargo && c.cityId !== undefined) {
      const city = state.cities[c.cityId];
      hit = !!city && stationCoversCity(state, station, city);
    } else if (c.kind === "service" && cargo === "passengers" && originStation) {
      const a = state.cities[c.cityId ?? -1];
      const b = state.cities[c.city2Id ?? -1];
      hit =
        !!a &&
        !!b &&
        ((stationCoversCity(state, station, b) && stationCoversCity(state, originStation, a)) ||
          (stationCoversCity(state, station, a) && stationCoversCity(state, originStation, b)));
    } else if (
      c.kind === "rescue" &&
      c.cargo === cargo &&
      c.industryId !== undefined &&
      originStation
    ) {
      const industry = state.industries[c.industryId];
      hit = !!industry && stationCoversIndustry(state, originStation, industry);
    }
    if (!hit) continue;
    c.progress += units;
    if (c.progress >= c.target) completeContract(state, c);
  }
}

/** Track subsidy for a build (called by `buildTrack` with the new steps and what they cost): each active connection
 * contract refunds its share of the steps inside its corridor, up to its cap, and all together never more than the
 * best single share. Returns the cash refunded. */
export function contractSubsidy(
  state: GameState,
  steps: ReadonlyArray<{ a: number; b: number; cost: number; land: number }>,
  buildCost: number,
): number {
  const conns = state.contracts.active.filter((c) => c.kind === "connection");
  if (conns.length === 0 || steps.length === 0 || buildCost <= 0) return 0;
  const w = state.map.width;
  let total = 0;
  const maxTotal = CONNECTION.subsidyShare * buildCost;
  for (const c of conns) {
    const from = c.fromTile as number;
    const to = c.toTile as number;
    const sep = tileDistance(w, from, to);
    let qualifying = 0;
    for (const s of steps) {
      const reach =
        tileDistance(w, s.a, from) + tileDistance(w, s.a, to) <=
        CONNECTION.corridorFactor * sep + CONNECTION.corridorMarginTiles;
      if (reach) qualifying += s.cost + s.land;
    }
    const left = c.reward - (c.paid ?? 0);
    const pay = Math.max(0, Math.min(CONNECTION.subsidyShare * qualifying, left, maxTotal - total));
    if (pay <= 0) continue;
    c.paid = (c.paid ?? 0) + pay;
    c.progress = Math.min(c.reward, c.paid);
    total += pay;
  }
  if (total > 0) {
    state.cash += total;
    state.finance.capitalInvested -= total;
    addExpense(state, "construction", -total);
    state.contracts.stats.income += total;
  }
  return total;
}

// --- Steps --------------------------------------------------------------------------------------------------------

/** Stations reachable from `start` over track. */
function reachableTiles(state: GameState, start: number): Set<number> {
  const seen = new Set<number>([start]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    for (const next of state.trackGraph.neighborsOf(queue[i] as number)) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

function connectionDone(state: GameState, c: Contract): boolean {
  const city = state.cities[c.cityId ?? -1];
  if (!city) return false;
  const serving = networkStations(state).filter((s) => stationCoversCity(state, s, city));
  if (serving.length === 0) return false;
  const anchors = networkStations(state).filter(
    (s) => (c.anchorStationIds ?? []).includes(s.id) && !serving.includes(s),
  );
  if (anchors.length === 0) return false;
  for (const s of serving) {
    const reach = reachableTiles(state, s.tile);
    if (anchors.some((a) => reach.has(a.tile))) return true;
  }
  return false;
}

/** Daily: connection contracts complete when the town is served and on the network. */
export function dailyContractsStep(state: GameState): void {
  for (const c of [...state.contracts.active])
    if (c.kind === "connection" && connectionDone(state, c)) completeContract(state, c);
}

/** Monthly: lapse old offers, fail contracts past their deadline, and draw a new offer when it is time. */
export function monthlyContractsStep(state: GameState): void {
  const cs = state.contracts;
  cs.offers = cs.offers.filter((c) => c.expiresTick > state.ticks);
  for (const c of [...cs.active])
    if ((c.deadlineTick ?? Infinity) <= state.ticks) failContract(state, c);

  if (state.finance.bankrupt) return;
  if (state.ticks < MIN_MONTHS_BEFORE_OFFERS * MONTH_TICKS) return;
  if (networkStations(state).length < MIN_STATIONS) return;
  const [lo, hi] = OFFER_GAP_MONTHS;
  if (cs.nextOfferTick === undefined) {
    cs.nextOfferTick = state.ticks + nextInt(cs.rng, lo, hi) * MONTH_TICKS;
    return;
  }
  if (state.ticks < cs.nextOfferTick || cs.offers.length >= MAX_OFFERS) return;
  const offer = generateOffer(state);
  if (!offer) {
    cs.nextOfferTick = state.ticks + MONTH_TICKS; // nothing sensible this month: look again next month
    return;
  }
  cs.nextId++;
  cs.offers.push(offer);
  cs.stats.offered++;
  cs.nextOfferTick = state.ticks + nextInt(cs.rng, lo, hi) * MONTH_TICKS;
  pushNews(state, {
    kind: "contract",
    event: "offered",
    contract: { ...offer },
    money: offer.reward,
  });
}
