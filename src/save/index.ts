/**
 * Public save/load API (SPEC §13): 3 rotating monthly autosaves + 5 named manual slots in
 * IndexedDB, versioned + migrated JSON underneath. This is the only module main.ts/ui talks to —
 * everything else in src/save/ is an implementation detail.
 */
import type { GameState } from "../sim/state";
import { deserializeGameState, serializeGameState } from "./serialize";
import { migrateSaveFile } from "./migrate";
import { CURRENT_SAVE_VERSION, type SaveFileV1, type SaveMeta } from "./format";
import {
  AUTO_SLOT_IDS,
  MANUAL_SLOT_IDS,
  deleteSave,
  getAllSaves,
  getSave,
  putSave,
  type AutoSlotId,
  type ManualSlotId,
  type SlotId,
} from "./db";
import { REGIONS } from "../sim/regions";
import { calendarFromTicks } from "../sim/time";

export type { SlotId, AutoSlotId, ManualSlotId } from "./db";
export { AUTO_SLOT_IDS, MANUAL_SLOT_IDS, isAutoSlot } from "./db";
export type { SaveMeta } from "./format";

export interface SaveSlotInfo {
  slotId: SlotId;
  meta: SaveMeta;
}

const AUTOSAVE_CURSOR_KEY = "railroads.autosaveCursor";

function mapLabelFor(state: GameState): string {
  if (state.regionId) return REGIONS[state.regionId]?.name ?? state.regionId;
  return "Random map";
}

function buildMeta(state: GameState, name?: string): SaveMeta {
  const calendar = calendarFromTicks(state.startYear, state.ticks);
  return {
    ...(name !== undefined ? { name } : {}),
    savedAt: Date.now(),
    year: calendar.year,
    month: calendar.month,
    day: calendar.day,
    cash: state.cash,
    mapLabel: mapLabelFor(state),
  };
}

function buildSaveFile(state: GameState, name?: string): SaveFileV1 {
  return {
    version: CURRENT_SAVE_VERSION,
    meta: buildMeta(state, name),
    state: serializeGameState(state),
  };
}

/** Reads the next autosave slot to overwrite and advances the rotation (SPEC §13: "rotating 3
 * slots") — a simple round-robin counter in localStorage, not "oldest timestamp wins", so a
 * player who never triggers an autosave for a while doesn't get surprised by which slot goes next. */
function nextAutoSlot(): AutoSlotId {
  let index = 0;
  try {
    index = Number(window.localStorage.getItem(AUTOSAVE_CURSOR_KEY) ?? "0") || 0;
  } catch {
    index = 0;
  }
  const slot = AUTO_SLOT_IDS[index % AUTO_SLOT_IDS.length] as AutoSlotId;
  try {
    window.localStorage.setItem(AUTOSAVE_CURSOR_KEY, String((index + 1) % AUTO_SLOT_IDS.length));
  } catch {
    // localStorage unavailable — rotation just restarts at auto-0 next time, harmless.
  }
  return slot;
}

export async function autosave(state: GameState): Promise<SlotId> {
  const slot = nextAutoSlot();
  await putSave(slot, buildSaveFile(state));
  return slot;
}

export async function saveToSlot(
  state: GameState,
  slotId: ManualSlotId,
  name: string,
): Promise<void> {
  await putSave(slotId, buildSaveFile(state, name));
}

export async function loadSlot(slotId: SlotId): Promise<GameState | null> {
  const raw = await getSave(slotId);
  if (!raw) return null;
  const file = migrateSaveFile(raw);
  return deserializeGameState(file.state);
}

export async function deleteSlot(slotId: SlotId): Promise<void> {
  await deleteSave(slotId);
}

/** Every slot with a save in it, autosaves first (in slot order) then manual slots, each already
 * migrated to the current meta shape. Used by the Load screen. */
export async function listSaveSlots(): Promise<SaveSlotInfo[]> {
  const all = await getAllSaves();
  const bySlot = new Map(all.map((r) => [r.slotId, r.file]));
  const order: SlotId[] = [...AUTO_SLOT_IDS, ...MANUAL_SLOT_IDS];
  const result: SaveSlotInfo[] = [];
  for (const slotId of order) {
    const raw = bySlot.get(slotId);
    if (!raw) continue;
    const file = migrateSaveFile(raw);
    result.push({ slotId, meta: file.meta });
  }
  return result;
}

/** The most recently saved slot across every autosave + manual slot (SPEC §13/PLAN's "Continue =
 * latest save"), or null if nothing has ever been saved. */
export async function latestSaveSlot(): Promise<SaveSlotInfo | null> {
  const slots = await listSaveSlots();
  if (slots.length === 0) return null;
  return slots.reduce((latest, s) => (s.meta.savedAt > latest.meta.savedAt ? s : latest));
}
