/**
 * Economic model v2 (PLAN Phase 28A, SPEC §9 "Economic model v2"). Every number that decides whether a railway
 * makes money lives here, grouped by the real-world cause it models. Nothing in this file is a flat
 * "make it harder" multiplier: each table is a historical curve or a physical/organisational fact, and the
 * player sees the money it moves as its own Finance line.
 *
 *  1. Fares follow a real-terms curve, wages rise faster than prices, crews scale with the train.
 *  2. Track wear grows with gross tonnage × axle load × speed.
 *  3. Locomotive complexity drives repair parts; new models have teething trouble, proven ones are cheap to fix.
 *  4. Repair call-outs: crew wages for the distance driven from the nearest Engine Shed, plus parts.
 *  5. Property tax from the start, corporate income tax from the 1910s in steps.
 *  6. Road and air competition take short-haul traffic; fast and bulk traffic keeps its share.
 *  7. Freight rates: early bulk freight competes with canals and wagons.
 */
import type { CargoType } from "./cargo";
import { eraInflation } from "./finance";
import type { LocomotiveDef } from "./trains";

type Anchors = ReadonlyArray<readonly [year: number, value: number]>;

/** Piecewise-linear value of `anchors` at `year` (clamped to the first/last anchor). */
export function interpolateYear(anchors: Anchors, year: number): number {
  const first = anchors[0] as readonly [number, number];
  if (year <= first[0]) return first[1];
  for (let i = 1; i < anchors.length; i++) {
    const [y1, v1] = anchors[i] as readonly [number, number];
    if (year <= y1) {
      const [y0, v0] = anchors[i - 1] as readonly [number, number];
      return v0 + ((v1 - v0) * (year - y0)) / (y1 - y0);
    }
  }
  return (anchors[anchors.length - 1] as readonly [number, number])[1];
}

// --- 1. Prices, wages and fares ------------------------------------------------------------------

/** General price level (locomotives, rails, sleepers, coal, parts): `eraInflation`, 1.0 in 1830. */
export function priceIndex(year: number): number {
  return eraInflation(year);
}

/** Real (after-inflation) wage growth: a railwayman in 1980 earned about 3.5× what one did in 1830 in terms of
 * what the money buys. Wages therefore outrun prices, and labour-heavy costs (crews, station staff, track
 * gangs) grow faster than anything else the railway buys. */
export const REAL_WAGE_ANCHORS: Anchors = [
  [1830, 1.0],
  [1880, 1.5],
  [1930, 2.2],
  [1980, 3.4],
  [2030, 4.2],
];

/** Nominal wage level: prices × real wage growth. One railwayman costs `CREW_WAGE_1830 × wageIndex(year)` a year. */
export function wageIndex(year: number): number {
  return priceIndex(year) * interpolateYear(REAL_WAGE_ANCHORS, year);
}

/** Annual wage of one railwayman (driver, fireman, guard, porter, platelayer) at 1830 prices. */
export const WAGE_1830 = 350;

/** Real-terms passenger and mail fare level, relative to the general price level. Rail was a premium novelty in
 * the 1830s (stagecoach-priced, first class only); the 1844 Railway Regulation Act forced cheap third-class
 * fares, and mass suburban and excursion traffic pushed real fares down for the next sixty years. */
export const PASSENGER_REAL_FARE_ANCHORS: Anchors = [
  [1830, 1.9],
  [1845, 1.45],
  [1860, 1.0],
  [1885, 0.78],
  [1905, 0.62],
  [1935, 0.55],
  [1965, 0.5],
  [2030, 0.5],
];

/** Real-terms freight rate level: bulk rail freight beat the wagon and (where one existed) the canal, then
 * competition between lines and rate regulation (Interstate Commerce Act 1887, Railway and Canal Traffic Act
 * 1888) drove ton-mile rates steadily down in real terms. */
export const FREIGHT_REAL_RATE_ANCHORS: Anchors = [
  [1830, 1.5],
  [1850, 1.3],
  [1875, 1.05],
  [1905, 0.8],
  [1935, 0.74],
  [1965, 0.7],
  [2030, 0.7],
];

/** Nominal fare/rate multiplier on `CargoDef.baseRate` (which is quoted at 1830 prices). */
export function fareIndex(year: number, cargo: CargoType): number {
  const real =
    cargo === "passengers" || cargo === "mail"
      ? interpolateYear(PASSENGER_REAL_FARE_ANCHORS, year)
      : interpolateYear(FREIGHT_REAL_RATE_ANCHORS, year);
  return priceIndex(year) * real;
}

/** Crew on the footplate by locomotive: steam needs a driver and a fireman (a second fireman on the big
 * articulateds), early diesels and electrics a driver and an assistant, late electrics one driver. */
export function footplateCrew(loco: LocomotiveDef): number {
  if (loco.type === "steam") return loco.weightClass === "heavy" && loco.power >= 20 ? 3 : 2;
  if (loco.type === "diesel") return 2;
  return loco.introYear >= 1960 ? 1 : 2;
}

/** One guard/brakeman/conductor per this many cars (a short train's guard rides with the crew). */
export const CARS_PER_TRAIN_STAFF = 4;

/** Everyone on a train: footplate crew plus guards/conductors for the cars. A Grasshopper with three cars has
 * a crew of 2; a 10-car Pacific train needs 2 + 2 = 4, a 22-car articulated freight 3 + 5 = 8. */
export function trainCrewSize(loco: LocomotiveDef, cars: number): number {
  return footplateCrew(loco) + Math.floor(cars / CARS_PER_TRAIN_STAFF);
}

/** The part of `LocomotiveDef.maintenancePerYear` that is fuel, oil, water and depot servicing (the rest of
 * the old figure was the crew, which is now paid as wages). Scales with general prices. */
export const RUNNING_COST_SHARE = 0.45;

/** Monthly station upkeep splits into the building (general prices) and its staff (wages). */
export const STATION_STAFF: Record<"depot" | "station" | "terminal", number> = {
  depot: 1,
  station: 2,
  terminal: 6,
};
/** Non-wage monthly station upkeep at 1830 prices (buildings, lamps, coal for the waiting rooms). */
export const STATION_UPKEEP_MONTHLY: Record<"depot" | "station" | "terminal", number> = {
  depot: 15,
  station: 35,
  terminal: 90,
};

/** Share of a track tile's monthly upkeep that is labour (platelayers/gangers, paid wages); the rest is
 * ballast, sleepers and rail (general prices). */
export const TRACK_LABOUR_SHARE = 0.7;

// --- 3. Locomotive complexity, teething troubles and wear -------------------------------------------

/** A new model has a teething period: its first `TEETHING_YEARS` on the market it is one reliability step worse
 * than its rating (new designs always had faults the first users found). Models already on the market when the
 * game starts are taken as established: the teething period only applies to designs that arrive during the game. */
export const TEETHING_YEARS = 5;
/** A model more than `PROVEN_YEARS` past its introduction is a proven design: fewer breakdowns, cheaper parts
 * (spares are stocked, every fitter knows it). */
export const PROVEN_YEARS = 10;
export const PROVEN_BREAKDOWN_MULT = 0.85;
export const PROVEN_PARTS_MULT = 0.75;
/** Kilometres run that add +100 % to the breakdown chance (wear from use, on top of age). */
export const WEAR_KM_DOUBLING = 800_000;

/** Parts for one breakdown as a share of the locomotive's price: a bigger, more complex engine (more
 * cylinders, boilers, traction motors) costs proportionally more to put right. Grasshopper ≈ $800, Mikado ≈ $4.8k
 * at 1830 prices, a big diesel ≈ $14k, before the price level. */
export const REPAIR_PARTS_SHARE_OF_PRICE = 0.04;
/** Old engines need more parts per fix: +100 % at 40 years. */
export const REPAIR_PARTS_AGE_DOUBLING_YEARS = 40;

// --- 4. Repair logistics ---------------------------------------------------------------------------

/** A repair crew: a fitter and two labourers. They are paid for every day away from the depot — the dispatch
 * wait, the trip out and back, and the fix. */
export const REPAIR_CREW_SIZE = 3;
/** Working days a year a wage is spread over. */
export const WORK_DAYS_PER_YEAR = 300;

// --- 2. Track wear ---------------------------------------------------------------------------------

/** Gross weight of the locomotive with its tender/fuel, tonnes, by weight class. */
export const LOCO_TONS: Record<"light" | "medium" | "heavy", number> = {
  light: 18,
  medium: 45,
  heavy: 90,
};
/** Rail wear grows steeply with axle load (roughly the fourth power in engineering practice; tamed here):
 * a heavy engine concentrates its weight on few axles and hammers the rail, a light one barely marks it. */
export const AXLE_LOAD_FACTOR: Record<"light" | "medium" | "heavy", number> = {
  light: 0.7,
  medium: 1.0,
  heavy: 1.6,
};
/** A car weighs this empty (tonnes) and this much more when full. */
export const CAR_EMPTY_TONS = 12;
export const CAR_LOAD_TONS = 18;
/** Cars spread their weight over more axles than the engine. */
export const CAR_AXLE_FACTOR = 0.8;
/** Speed makes wear worse: factor 1 + (v / `WEAR_SPEED_REF_KMH`)². */
export const WEAR_SPEED_REF_KMH = 100;
/** Cost of one wear unit (100 t-axle-equivalents over one tile at walking pace) at 1830 prices: rail, sleepers and
 * the gangs that renew them. */
export const WEAR_COST_PER_UNIT = 1.0;
/** Share of wear cost that is labour (wages); the rest is rail and sleepers (prices). */
export const WEAR_LABOUR_SHARE = 0.5;

// --- 5. Taxes and regulation -----------------------------------------------------------------------

/** Annual property tax (local rates) as a share of what the company has put into its track, stations and
 * improvements: "0.5 % of the book value of your line". Charged monthly from the first day. */
export const PROPERTY_TAX_RATE = 0.005;

/** Corporate income tax on the year's operating profit (after interest), by year. There was none before the 1910s
 * (the income taxes of the 1840s were personal); it was introduced low, went up with the First World War, again
 * in the thirties and with the Second World War, and stayed high afterwards. Losses are carried forward. */
export const INCOME_TAX_STEPS: ReadonlyArray<readonly [fromYear: number, rate: number]> = [
  [1910, 0.06],
  [1920, 0.12],
  [1935, 0.18],
  [1945, 0.26],
  [1960, 0.32],
];

export function incomeTaxRate(year: number): number {
  let rate = 0;
  for (const [from, r] of INCOME_TAX_STEPS) if (year >= from) rate = r;
  return rate;
}

// --- 6. Competition from other transport -------------------------------------------------------------

/** Trips shorter than this are the road's (and, for freight, the truck's) territory. */
export const SHORT_HAUL_KM = 150;
/** Airlines compete beyond `AIR_FROM_KM`, fully from `AIR_FULL_KM`. */
export const AIR_FROM_KM = 300;
export const AIR_FULL_KM = 800;

/** Share of short-distance passengers and mail lost to buses and private cars. */
export const ROAD_SHARE_ANCHORS: Anchors = [
  [1915, 0],
  [1930, 0.12],
  [1950, 0.25],
  [1970, 0.38],
  [1990, 0.45],
  [2030, 0.45],
];
/** Share of short-haul freight lost to lorries (scaled per cargo by `TRUCK_SUSCEPTIBILITY`). */
export const TRUCK_SHARE_ANCHORS: Anchors = [
  [1920, 0],
  [1935, 0.1],
  [1955, 0.25],
  [1975, 0.35],
  [2030, 0.4],
];
/** Share of long-distance passengers and mail lost to airlines. */
export const AIR_SHARE_ANCHORS: Anchors = [
  [1945, 0],
  [1960, 0.15],
  [1980, 0.3],
  [2030, 0.35],
];
/** How much of the truck share a cargo loses: bulk cargo (coal, ore, timber, grain) stays on rails, valuable
 * general cargo goes by lorry. */
export const TRUCK_SUSCEPTIBILITY: Partial<Record<CargoType, number>> = {
  coal: 0.25,
  ironOre: 0.25,
  wood: 0.4,
  grain: 0.4,
  oil: 0.3,
  fuel: 0.3,
  steel: 0.5,
  lumber: 0.6,
  livestock: 1,
  food: 1,
  goods: 1,
};
/** Trains at or above this speed (km/h) win passengers back from road and air. */
export const FAST_TRAIN_KMH = 200;
/** What a fast train keeps of the competition's bite (0.3 = loses only 30 % as many passengers). */
export const FAST_TRAIN_COMPETITION_MULT = 0.3;

/** Milestones announced in the news when the competition arrives. */
export const COMPETITION_NEWS_YEARS = { road: 1920, truck: 1930, air: 1955 } as const;

/** Share of a delivery's revenue lost to road/air competition (0–1) for `cargo` carried `distanceKm` by a train
 * whose top speed is `trainKmh`. Short trips lose to buses and lorries, long passenger trips to airlines; bulk
 * cargo and fast trains keep most of their traffic. */
export function competitionLoss(
  year: number,
  cargo: CargoType,
  distanceKm: number,
  trainKmh: number,
): number {
  const fast = trainKmh >= FAST_TRAIN_KMH ? FAST_TRAIN_COMPETITION_MULT : 1;
  const shortness = Math.max(0, 1 - distanceKm / SHORT_HAUL_KM);
  if (cargo === "passengers" || cargo === "mail") {
    const road = interpolateYear(ROAD_SHARE_ANCHORS, year) * shortness * fast;
    const airReach = Math.min(
      1,
      Math.max(0, (distanceKm - AIR_FROM_KM) / (AIR_FULL_KM - AIR_FROM_KM)),
    );
    const air = interpolateYear(AIR_SHARE_ANCHORS, year) * airReach * fast;
    return 1 - (1 - road) * (1 - air);
  }
  return (
    interpolateYear(TRUCK_SHARE_ANCHORS, year) * (TRUCK_SUSCEPTIBILITY[cargo] ?? 1) * shortness
  );
}

// --- Electrification and frontier towns --------------------------------------------------------------

/** An electric locomotive has no reciprocating masses hammering the rail: its share of the wear is this much lower. */
export const ELECTRIC_WEAR_MULT = 0.8;

/** Railway towns boom (PLAN Phase 28A): a frontier village that a train stops at this month gets growth points worth
 * this share of one growth step — 0.25 means a step (+5 %) every four served months, about 1.25 %/month, so a
 * village of 1,000 passes 3,000 in about seven years of service. The boom ends when it has become a town. */
export const FRONTIER_BOOM_STEP_SHARE = 0.25;

// --- Track condition (Phase 30A, PLAYTEST-2 Top 10 #4) -----------------------------------------------------------

/** Share of the track-wear bill that is paid as routine maintenance every month (tamping, oiling, replacing a
 * broken sleeper). The rest is the *renewal* of rail and sleepers: it accumulates as wear on each edge and is paid
 * when the player relays the track (`relayTrack`), so the same money is spent as before — only later, in lumps. */
export const WEAR_ROUTINE_SHARE = 0.3;

/** How many wear units per tile (see `wearUnitsPerTile`) a track can take before its rail and sleepers are used up,
 * by the year they were laid. Wrought-iron rail wore out in years under heavy traffic; Bessemer steel rail (from
 * the 1860s) lasted several times longer; heavy-section, welded rail after the First World War longer again. A line
 * of 2 trains in 1840 hardly wears; one of 8 fast trains in 1910 wants relaying about every twenty years. */
export const RAIL_LIFE_UNITS: ReadonlyArray<{ fromYear: number; life: number }> = [
  { fromYear: 1800, life: 2_500 }, // wrought-iron rail
  { fromYear: 1865, life: 10_000 }, // Bessemer steel arriving
  { fromYear: 1885, life: 20_000 }, // steel rail, standard section
  { fromYear: 1925, life: 30_000 }, // heavy section, welded joints
];

/** Wear ratio (units ÷ life) below which a track has no speed restriction, and the ratio at which the speed limit
 * reaches its floor. Between them the restriction ("slow order") deepens linearly. */
export const SLOW_ORDER_START_RATIO = 0.6;
export const SLOW_ORDER_FLOOR_RATIO = 1.2;
/** Slowest a worn track lets a train go, as a share of the train's speed (a 40 % slow order). */
export const SLOW_ORDER_MIN_SPEED_MULT = 0.4;
/** Track at or above this ratio is offered for relaying and counted in the yearly slow-order news. */
export const RELAY_OFFER_RATIO = 0.25;

// --- Locomotive ageing (Phase 30A, PLAYTEST-2 Top 10 #4) ----------------------------------------------------------

/** Years a locomotive of each kind runs before its frames, boiler (or traction motors) are worn out: a steam boiler
 * is condemned after ~35 years of firing, diesels and electrics last longer. Beyond it the engine is unreliable and
 * dear to keep, until it is overhauled or replaced. */
export const LOCO_LIFE_YEARS = { steam: 35, diesel: 40, electric: 45 } as const;
/** Years a locomotive runs at full health; ageing starts after this. */
export const LOCO_PRIME_YEARS = 15;
/** Running cost (fuel, oil, servicing) rises by this share of its base per year of age beyond `LOCO_PRIME_YEARS`
 * (worn valves and cylinders burn more coal, more time in the shed). */
export const LOCO_AGE_RUNNING_COST_PER_YEAR = 0.03;
/** Breakdown chance multiplier at the end of the locomotive's life (grows with the square of the age past prime),
 * then +`LOCO_OVERAGE_BREAKDOWN_PER_YEAR` for every year beyond it, up to `LOCO_BREAKDOWN_MULT_MAX`. */
export const LOCO_END_OF_LIFE_BREAKDOWN_MULT = 4;
export const LOCO_OVERAGE_BREAKDOWN_PER_YEAR = 0.6;
export const LOCO_BREAKDOWN_MULT_MAX = 12;
/** Overhaul (heavy general repair in the shed): costs this share of the locomotive's price, takes the engine out of
 * service for `LOCO_OVERHAUL_DAYS`, and takes `LOCO_OVERHAUL_AGE_RESET` of its mechanical age off (new boiler or
 * windings, the old frames stay). Possible once the engine is at least `LOCO_OVERHAUL_MIN_AGE` years old. */
export const LOCO_OVERHAUL_COST_SHARE = 0.3;
export const LOCO_OVERHAUL_DAYS = 25;
export const LOCO_OVERHAUL_AGE_RESET = 0.6;
export const LOCO_OVERHAUL_MIN_AGE = 10;
