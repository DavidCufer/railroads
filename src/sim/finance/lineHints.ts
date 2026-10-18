/**
 * The "add a train" hint (Phase 47): a line whose trains run nearly full while more is waiting for it than one train
 * carries. Pure reading of the state; the one-time news item is the only thing it writes.
 */
import type { CargoType } from "../../data/cargo";
import { ADD_TRAIN_HINT } from "../../data/trains";
import { pushNews } from "../news";
import type { GameState } from "../state";
import { pileShareFor } from "../stations/boarding";
import { HOURS_PER_DAY } from "../time";
import { booksStartTick } from "../trains/profit";
import { carCapacity } from "../trains/capacity";
import type { Train } from "../trains/types";
import { lineSummaries } from "./lines";

export interface AddTrainHint {
  /** People or units waiting at the line's stops who could board its trains (of the cargo with the most waiting). */
  waiting: number;
  cargo: CargoType;
}

function trainCapacity(train: Train, cargo: CargoType): number {
  let cap = 0;
  for (const car of train.cars) if (car.cargoType === cargo) cap += carCapacity(car);
  return cap;
}

/** Is the line served by `trainIds` full with more waiting than one of its trains carries? */
export function addTrainHint(
  state: GameState,
  trainIds: readonly number[],
): AddTrainHint | undefined {
  const trains = state.trains.filter((t) => trainIds.includes(t.id) && t.cars.length > 0);
  const loads = trains
    .filter(
      (t) =>
        t.loadShare !== undefined &&
        state.ticks - booksStartTick(t) >= ADD_TRAIN_HINT.minAgeDays * HOURS_PER_DAY,
    )
    .map((t) => t.loadShare as number);
  if (loads.length === 0) return undefined;
  if (loads.reduce((a, b) => a + b, 0) / loads.length < ADD_TRAIN_HINT.minLoad) return undefined;

  const stops = [...new Set(trains.flatMap((t) => t.orders.map((o) => o.stationId)))];
  const cargos = [...new Set(trains.flatMap((t) => t.cars.map((c) => c.cargoType)))];
  let best: AddTrainHint | undefined;
  for (const cargo of cargos) {
    const carriers = trains.filter((t) => trainCapacity(t, cargo) > 0);
    const oneTrain =
      carriers.reduce((sum, t) => sum + trainCapacity(t, cargo), 0) / carriers.length;
    let waiting = 0;
    for (const stationId of stops) {
      const pile = state.stationCargo.get(stationId)?.[cargo];
      if (!pile) continue;
      const carrier = carriers.find((t) => t.orders.some((o) => o.stationId === stationId));
      const station = state.stations.find((s) => s.id === stationId);
      if (!carrier || !station) continue;
      waiting +=
        cargo === "passengers"
          ? pile.amount *
            pileShareFor(
              state,
              station,
              carrier.orders.map((o) => o.stationId),
            )
          : pile.amount;
    }
    if (waiting > oneTrain && (!best || waiting > best.waiting))
      best = { waiting: Math.round(waiting), cargo };
  }
  return best;
}

/** Once a month: the first line in the game that needs another train is announced (a hint card, also in News). */
export function monthlyLineHintStep(state: GameState): void {
  const mem = state.history.memory;
  if (mem.addTrainHint) return;
  for (const line of lineSummaries(state)) {
    const hint = addTrainHint(state, line.trainIds);
    if (!hint) continue;
    mem.addTrainHint = true;
    pushNews(state, {
      kind: "addTrain",
      trainId: line.trainIds[0] as number,
      waiting: hint.waiting,
    });
    return;
  }
}
