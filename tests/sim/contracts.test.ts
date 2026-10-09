import { describe, expect, it } from "vitest";
import {
  MAX_ACTIVE,
  MAX_OFFERS,
  MIN_REWARD_1830,
  OFFER_LIFE_MONTHS,
  PENALTY_SHARE,
  REWARD_CAP_NET_WORTH,
  SUPPLY_SHARE,
  WARY_MONTHS,
} from "../../src/data/contracts";
import { priceIndex } from "../../src/data/economy";
import { acceptContract, abandonContract, declineContract } from "../../src/sim/commands";
import { generateOffer, rewardFor } from "../../src/sim/contracts/generate";
import {
  contractSubsidy,
  monthlyContractsStep,
  recordContractDelivery,
} from "../../src/sim/contracts/progress";
import type { Contract } from "../../src/sim/contracts/types";
import { netWorth } from "../../src/sim/finance/ledger";
import { createGameState, type GameState } from "../../src/sim/state";
import type { Station } from "../../src/sim/stations/types";
import { deserializeGameState, serializeGameState } from "../../src/save/serialize";

const MONTH = 30 * 24;

function station(state: GameState, tile: number): Station {
  const s: Station = {
    id: state.nextStationId++,
    tile,
    type: "station",
    name: `S${state.nextStationId}`,
    hasEngineShed: true,
    hasWaterTower: false,
    improvements: [],
  };
  state.stations.push(s);
  return s;
}

function bigCities(state: GameState, n: number) {
  return [...state.cities]
    .filter((c) => c.tiles.length > 0)
    .sort((a, b) => b.population - a.population)
    .slice(0, n);
}

function tileOf(state: GameState, c: { anchorX: number; anchorY: number }): number {
  return c.anchorY * state.map.width + c.anchorX;
}

/** A 1900 game with two stations in the two biggest cities that are not too far apart, and plenty of cash. */
function setup(seed = 1): GameState {
  const state = createGameState({ seed, region: "central-eu", startYear: 1900 });
  state.cash = 5_000_000;
  const cities = bigCities(state, 8);
  const a = cities[0]!;
  const b =
    cities.slice(1).find((c) => Math.hypot(c.anchorX - a.anchorX, c.anchorY - a.anchorY) < 60) ??
    cities[1]!;
  station(state, tileOf(state, a));
  station(state, tileOf(state, b));
  return state;
}

function delivery(state: GameState, over: Partial<Contract> = {}): Contract {
  const city = bigCities(state, 1)[0]!;
  return {
    id: state.contracts.nextId++,
    kind: "delivery",
    cityId: city.id,
    cargo: "goods",
    target: 40,
    progress: 0,
    reward: 50_000,
    durationTicks: 12 * MONTH,
    offeredTick: state.ticks,
    expiresTick: state.ticks + 3 * MONTH,
    ...over,
  };
}

describe("contract commands", () => {
  it("accepts an offer, sets the deadline, and refuses a third active contract", () => {
    const state = setup();
    const offers = [delivery(state), delivery(state), delivery(state)];
    state.contracts.offers.push(...offers);
    expect(acceptContract(state, offers[0]!.id).ok).toBe(true);
    expect(state.contracts.active[0]?.deadlineTick).toBe(state.ticks + 12 * MONTH);
    expect(acceptContract(state, offers[1]!.id).ok).toBe(true);
    const third = acceptContract(state, offers[2]!.id);
    expect(third).toEqual({ ok: false, reason: "too-many-contracts" });
    expect(state.contracts.active).toHaveLength(MAX_ACTIVE);
    expect(acceptContract(state, 999)).toEqual({ ok: false, reason: "invalid-contract" });
  });

  it("declining an offer costs nothing", () => {
    const state = setup();
    const c = delivery(state);
    state.contracts.offers.push(c);
    const cash = state.cash;
    expect(declineContract(state, c.id).ok).toBe(true);
    expect(state.contracts.offers).toHaveLength(0);
    expect(state.cash).toBe(cash);
  });

  it("abandoning counts as a failure with the penalty", () => {
    const state = setup();
    const c = delivery(state);
    state.contracts.offers.push(c);
    acceptContract(state, c.id);
    const cash = state.cash;
    expect(abandonContract(state, c.id).ok).toBe(true);
    expect(state.cash).toBe(cash - Math.round(c.reward * PENALTY_SHARE));
    expect(state.contracts.stats.failed).toBe(1);
  });
});

describe("contract progress", () => {
  it("counts only deliveries made after acceptance, completes at the target and pays the reward", () => {
    const state = setup();
    const city = bigCities(state, 1)[0]!;
    const st = state.stations[0]!;
    const c = delivery(state, { cityId: city.id });
    state.contracts.offers.push(c);
    // a delivery before acceptance is nobody's business
    recordContractDelivery(state, st, "goods", 100, 0);
    acceptContract(state, c.id);
    expect(c.progress).toBe(0);
    const cash = state.cash;
    recordContractDelivery(state, st, "goods", 20, 0);
    expect(c.progress).toBe(20);
    recordContractDelivery(state, st, "coal", 20, 0); // wrong cargo
    expect(c.progress).toBe(20);
    expect(state.contracts.active).toHaveLength(1);
    recordContractDelivery(state, st, "goods", 20, 0);
    expect(state.contracts.active).toHaveLength(0);
    expect(state.cash).toBe(cash + 50_000);
    expect(state.contracts.stats.completed).toBe(1);
    expect(state.contracts.stats.income).toBe(50_000);
    expect(state.news.at(-1)?.kind).toBe("contract");
  });

  it("ignores a delivery at a station that does not serve the town", () => {
    const state = setup();
    const c = delivery(state, { cityId: bigCities(state, 1)[0]!.id });
    state.contracts.offers.push(c);
    acceptContract(state, c.id);
    const far = station(state, 0);
    recordContractDelivery(state, far, "goods", 100, 0);
    expect(c.progress).toBe(0);
  });

  it("a service counts passengers only between its two towns, either way", () => {
    const state = setup();
    const [sa, sb] = [state.stations[0]!, state.stations[1]!];
    const cityAt = (tile: number) => state.cities.find((c) => tileOf(state, c) === tile)!;
    const [a, b] = [cityAt(sa.tile), cityAt(sb.tile)];
    const c = delivery(state, {
      kind: "service",
      cityId: a.id,
      city2Id: b.id,
      cargo: "passengers",
      target: 100,
    });
    state.contracts.offers.push(c);
    acceptContract(state, c.id);
    recordContractDelivery(state, sb, "passengers", 30, sa.tile);
    recordContractDelivery(state, sa, "passengers", 30, sb.tile);
    expect(c.progress).toBe(60);
    recordContractDelivery(state, sb, "passengers", 30, sb.tile); // from the same town
    recordContractDelivery(state, sb, "passengers", 30, undefined);
    expect(c.progress).toBe(60);
  });

  it("fails past the deadline: a penalty of 10 % and a wary pause before the next offer", () => {
    const state = setup();
    const c = delivery(state);
    state.contracts.offers.push(c);
    acceptContract(state, c.id);
    state.ticks = 24 * MONTH;
    state.contracts.nextOfferTick = state.ticks;
    const cash = state.cash;
    monthlyContractsStep(state);
    expect(state.contracts.active).toHaveLength(0);
    expect(state.contracts.stats.failed).toBe(1);
    expect(state.cash).toBe(cash - Math.round(50_000 * PENALTY_SHARE));
    expect(state.contracts.nextOfferTick).toBeGreaterThanOrEqual(state.ticks + WARY_MONTHS * MONTH);
    expect(state.contracts.offers).toHaveLength(0);
  });

  it("a rescue's success lifts the producer, failure cuts it", () => {
    const state = setup();
    const industry = state.industries[0]!;
    const make = () =>
      delivery(state, { kind: "rescue", industryId: industry.id, cargo: "coal", target: 20 });
    const ok = make();
    state.contracts.offers.push(ok);
    acceptContract(state, ok.id);
    const origin = station(state, industry.y * state.map.width + industry.x);
    const dest = state.stations[0]!;
    recordContractDelivery(state, dest, "coal", 20, origin.tile);
    const up = state.industryEconomy.get(industry.id)?.growthMult ?? 1;
    expect(up).toBeGreaterThan(1);
    const bad = make();
    state.contracts.offers.push(bad);
    acceptContract(state, bad.id);
    abandonContract(state, bad.id);
    expect(state.industryEconomy.get(industry.id)?.growthMult ?? 1).toBeLessThan(up);
  });
});

describe("offers", () => {
  it("lapse after three months and never exceed the cap", () => {
    const state = setup();
    state.ticks = 13 * MONTH;
    state.contracts.nextOfferTick = state.ticks;
    for (let i = 0; i < 6; i++) {
      state.contracts.nextOfferTick = state.ticks;
      monthlyContractsStep(state);
      expect(state.contracts.offers.length).toBeLessThanOrEqual(MAX_OFFERS);
    }
    const first = state.contracts.offers[0];
    if (first) {
      expect(first.expiresTick - first.offeredTick).toBe(OFFER_LIFE_MONTHS * MONTH);
      state.ticks = first.expiresTick;
      state.contracts.nextOfferTick = Infinity;
      monthlyContractsStep(state);
      expect(state.contracts.offers.find((o) => o.id === first.id)).toBeUndefined();
    }
  });

  it("wait for a network and for the first year", () => {
    const young = setup();
    young.ticks = 6 * MONTH;
    monthlyContractsStep(young);
    expect(young.contracts.nextOfferTick).toBeUndefined();
    const empty = createGameState({ seed: 1, region: "central-eu", startYear: 1900 });
    empty.ticks = 30 * MONTH;
    monthlyContractsStep(empty);
    expect(empty.contracts.offers).toHaveLength(0);
  });

  it("are feasible, capped and priced by the formula over many draws", () => {
    for (const seed of [1, 2, 3]) {
      const state = setup(seed);
      // give a processor some output so a town has something real to ask for
      for (const industry of state.industries) {
        const econ = state.industryEconomy.get(industry.id);
        if (econ && Object.keys(econ.monthlyOutput).length === 0) continue;
      }
      let made = 0;
      for (let i = 0; i < 40; i++) {
        const offer = generateOffer(state);
        if (!offer) continue;
        made++;
        const cap = REWARD_CAP_NET_WORTH * netWorth(state);
        expect(offer.reward).toBeLessThanOrEqual(cap + 1);
        expect(offer.reward).toBeGreaterThanOrEqual(MIN_REWARD_1830 * priceIndex(1900));
        expect(offer.durationTicks).toBeGreaterThanOrEqual(MONTH);
        if (offer.kind === "delivery" || offer.kind === "rescue") {
          expect(offer.target).toBeGreaterThan(0);
          if (offer.kind === "rescue") {
            const out = state.industryEconomy.get(offer.industryId!)!.monthlyOutput[offer.cargo!]!;
            expect(offer.target).toBeLessThanOrEqual(
              SUPPLY_SHARE * out * (offer.durationTicks / MONTH),
            );
          }
        }
        if (offer.kind === "connection") {
          expect(offer.paid).toBe(0);
          const from = state.stations.find((s) => s.tile === offer.fromTile);
          expect(from).toBeDefined();
        }
        state.contracts.nextId++;
      }
      expect(made).toBeGreaterThan(0);
    }
  });

  it("are deterministic for a seed and do not touch the main random stream", () => {
    const a = setup(4);
    const b = setup(4);
    const rngBefore = { ...a.rng };
    const oa = generateOffer(a);
    const ob = generateOffer(b);
    expect(oa).toEqual(ob);
    expect(a.rng).toEqual(rngBefore);
  });

  it("reward formula: effort times margin, difficulty and the net-worth cap", () => {
    const state = setup();
    state.difficulty = "normal";
    const nw = netWorth(state);
    expect(rewardFor(state, 100_000, 0.5)).toBe(150_000);
    state.difficulty = "easy";
    expect(rewardFor(state, 100_000, 0.5)).toBe(190_000); // 187.5k rounded to 5k
    state.difficulty = "hard";
    expect(rewardFor(state, 100_000, 0.5)).toBe(120_000);
    state.difficulty = "normal";
    expect(rewardFor(state, 1e9, 0.5)).toBeLessThanOrEqual(REWARD_CAP_NET_WORTH * nw);
    expect(rewardFor(state, 100, 0.5)).toBeNull();
  });
});

describe("connection subsidy", () => {
  function connection(state: GameState): Contract {
    const [a, b] = bigCities(state, 2);
    return {
      id: state.contracts.nextId++,
      kind: "connection",
      cityId: b!.id,
      target: 0,
      progress: 0,
      reward: 30_000,
      paid: 0,
      fromTile: tileOf(state, a!),
      toTile: tileOf(state, b!),
      durationTicks: 30 * MONTH,
      offeredTick: 0,
      expiresTick: 3 * MONTH,
    };
  }

  it("refunds half of the qualifying track, never beyond its cap, and nothing off the corridor", () => {
    const state = setup();
    const c = connection(state);
    state.contracts.offers.push(c);
    acceptContract(state, c.id);
    const w = state.map.width;
    const mid = Math.floor((c.fromTile! + c.toTile!) / 2);
    const on = [{ a: mid, b: mid + 1, cost: 10_000, land: 2_000 }];
    const cash = state.cash;
    const paid = contractSubsidy(state, on, 12_000);
    expect(paid).toBe(6_000);
    expect(state.cash).toBe(cash + 6_000);
    // a long build is refunded only up to the cap
    const big = [{ a: mid, b: mid + 1, cost: 200_000, land: 0 }];
    expect(contractSubsidy(state, big, 200_000)).toBe(24_000);
    expect(contractSubsidy(state, big, 200_000)).toBe(0);
    // far from the corridor: nothing
    const c2 = connection(state);
    c2.reward = 1e6;
    state.contracts.active = [Object.assign(c2, { acceptedTick: 0 })];
    const far = [{ a: w * 3 + 3, b: w * 3 + 4, cost: 50_000, land: 0 }];
    const [fa] = bigCities(state, 1);
    if (Math.hypot((far[0]!.a % w) - fa!.anchorX, Math.floor(far[0]!.a / w) - fa!.anchorY) > 200)
      expect(contractSubsidy(state, far, 50_000)).toBe(0);
  });

  it("two overlapping contracts never refund more than half of the bill", () => {
    const state = setup();
    const c1 = connection(state);
    const c2 = connection(state);
    c1.reward = c2.reward = 1e6;
    state.contracts.active = [c1, c2];
    const mid = Math.floor((c1.fromTile! + c1.toTile!) / 2);
    const paid = contractSubsidy(state, [{ a: mid, b: mid + 1, cost: 100_000, land: 0 }], 100_000);
    expect(paid).toBeLessThanOrEqual(50_000);
  });
});

describe("save", () => {
  it("round-trips contracts, and an old save without them starts empty", () => {
    const state = setup();
    const c = delivery(state);
    state.contracts.offers.push(c);
    acceptContract(state, c.id);
    state.contracts.stats.income = 123;
    const back = deserializeGameState(JSON.parse(JSON.stringify(serializeGameState(state))));
    expect(back.contracts.active).toHaveLength(1);
    expect(back.contracts.stats.income).toBe(123);
    expect(back.contracts.rng).toEqual(state.contracts.rng);
    const old = JSON.parse(JSON.stringify(serializeGameState(state)));
    delete old.contracts;
    const loaded = deserializeGameState(old);
    expect(loaded.contracts.active).toHaveLength(0);
    expect(loaded.contracts.offers).toHaveLength(0);
  });
});
