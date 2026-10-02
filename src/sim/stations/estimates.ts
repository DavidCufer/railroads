/**
 * "≈ +$X/yr at current traffic" for station upgrade cards (PLAN Phase 30B). Estimates only: they scale this
 * station's own recorded revenue (`state.stationFlow`) by the effect each upgrade documents in SPEC §6, and
 * return `undefined` when the station has no traffic to scale or the upgrade has no revenue effect to estimate.
 * Pure; nothing here feeds back into the sim.
 */
import { CARGO_TYPES, type CargoType } from "../../data/cargo";
import {
  COLD_STORAGE_REVENUE_MULT,
  HOTEL_PASSENGER_REVENUE_MULT,
  POST_OFFICE_MAIL_REVENUE_MULT,
  POST_OFFICE_MAIL_SUPPLY_MULT,
  type StationImprovementType,
  type StationType,
} from "../../data/stations";
import type { GameState } from "../state";
import { STATION_TYPE_DEFS } from "../../data/stations";
import { DAYS_PER_MONTH, calendarFromTicks } from "../time";
import { stationCatchmentTiles } from "./placement";
import { destinationSets } from "./destinations";
import { computeStationEconomies } from "./economy";
import { emptyStationFlow } from "./flow";
import type { Station } from "./types";

/** Whether any town or city tile lies in `station`'s catchment — the one answer the upgrade card's "No town or city
 * in range" hint and the Post Office / Hotel estimates both use (Phase 31), counting a city by its footprint list as
 * well as by the map's tile owner so the two can never disagree. */
export function cityInCatchment(state: GameState, station: Station): boolean {
  const tiles = stationCatchmentTiles(
    state.map,
    station.tile,
    STATION_TYPE_DEFS[station.type].catchmentRadius,
  );
  if (tiles.some((t) => (state.map.cityId[t] as number) >= 0)) return true;
  const inRange = new Set(tiles);
  return state.cities.some((c) => c.tiles.some((t) => inRange.has(t)));
}

/** Per-cargo annual revenue of cargo loaded at `station`: this year so far scaled to a year once two months are
 * in, else last year, else the last full month × 12. */
export function annualStationRevenue(
  state: GameState,
  station: Station,
): Partial<Record<CargoType, number>> {
  const flow = state.stationFlow.get(station.id) ?? emptyStationFlow();
  const cal = calendarFromTicks(state.startYear, state.ticks);
  const days = (cal.month - 1) * DAYS_PER_MONTH + cal.day;
  const out: Partial<Record<CargoType, number>> = {};
  for (const cargo of CARGO_TYPES) {
    const ytd = flow.year[cargo]?.revenue ?? 0;
    const last = flow.lastYear[cargo]?.revenue ?? 0;
    const month = flow.lastMonth[cargo]?.revenue ?? 0;
    const est =
      days >= 2 * DAYS_PER_MONTH && ytd > 0
        ? (ytd / days) * 12 * DAYS_PER_MONTH
        : last > 0
          ? last
          : month * 12;
    if (est > 0) out[cargo] = est;
  }
  return out;
}

function annualLost(state: GameState, station: Station, cargo: CargoType): number {
  const flow = state.stationFlow.get(station.id);
  return (flow?.lastMonth[cargo]?.lostRevenue ?? 0) * 12;
}

const sum = (r: Partial<Record<CargoType, number>>, cargos: readonly CargoType[]): number =>
  cargos.reduce((a, c) => a + (r[c] ?? 0), 0);

/** Estimated extra revenue per year from an improvement, or undefined when it has no revenue effect to estimate. */
export function improvementEstimate(
  state: GameState,
  station: Station,
  type: StationImprovementType,
): number | undefined {
  // Post Office and Hotel feed on a city's mail/passengers: with none in range there is nothing to gain.
  if ((type === "postOffice" || type === "hotel") && !cityInCatchment(state, station))
    return undefined;
  const rev = annualStationRevenue(state, station);
  let gain = 0;
  switch (type) {
    case "postOffice": {
      const mail = rev.mail ?? 0;
      // +25 % fare on mail carried; +50 % mail supply helps only as far as mail is now turned away.
      gain =
        mail * (POST_OFFICE_MAIL_REVENUE_MULT - 1) +
        annualLost(state, station, "mail") * (POST_OFFICE_MAIL_SUPPLY_MULT - 1);
      break;
    }
    case "hotel":
      // Pays on passengers delivered here; passenger traffic is two-way, so use what is loaded here.
      gain = (rev.passengers ?? 0) * (HOTEL_PASSENGER_REVENUE_MULT - 1);
      break;
    case "coldStorage":
      gain = sum(rev, ["food", "livestock"]) * (COLD_STORAGE_REVENUE_MULT - 1);
      break;
    default:
      return undefined;
  }
  return gain > 0 ? gain : undefined;
}

/** Estimated extra revenue per year from upgrading the station type: the catchment's extra supply, per cargo,
 * applied to what that cargo earns here today. */
export function typeUpgradeEstimate(
  state: GameState,
  station: Station,
  next: StationType,
): number | undefined {
  const rev = annualStationRevenue(state, station);
  const year = calendarFromTicks(state.startYear, state.ticks).year;
  const stations = state.stations.map((s) => (s.id === station.id ? { ...s, type: next } : s));
  const after = computeStationEconomies(
    state.map,
    state.cities,
    state.industries,
    stations,
    year,
    state.industryEconomy,
    destinationSets(state.trains),
  ).get(station.id);
  const before = state.stationEconomy.get(station.id);
  if (!after || !before) return undefined;
  let gain = 0;
  for (const cargo of CARGO_TYPES) {
    const old = before.supply[cargo] ?? 0;
    const now = after.supply[cargo] ?? 0;
    const r = rev[cargo] ?? 0;
    if (old > 0 && r > 0 && now > old) gain += r * (now / old - 1);
  }
  return gain > 0 ? gain : undefined;
}
