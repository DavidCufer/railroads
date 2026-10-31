/** Phase 66/74: putting a train into the sidings of the station it stands at. Shared by the command and the sim step. */
import type { GameState } from "../state";
import { stationAtTile } from "../stations/placement";
import type { Train } from "./types";

/** Lays `train` up if it stands loading at a station; returns whether it did. Clears any queued lay-up. */
export function applyLayUp(state: GameState, train: Train): boolean {
  const tile = train.route[train.routeIndex];
  const atStation = tile !== undefined && !!stationAtTile(state.stations, tile);
  if (
    !atStation ||
    train.status !== "loading" ||
    train.edgeProgress !== 0 ||
    train.sectionTargetStationId !== undefined ||
    train.inYardOf !== undefined ||
    train.breakdownTicksLeft > 0
  )
    return false;
  train.laidUp = true;
  delete train.layUpQueued;
  delete train.returnTicksLeft;
  train.heldBlocks = [];
  train.speed = 0;
  train.status = "laidUp";
  train.waitTicks = 0;
  return true;
}
