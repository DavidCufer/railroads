/** Tiny IndexedDB wrapper (SPEC §1: "IndexedDB (via a tiny wrapper) for saves"). One object store,
 * one record per slot, keyed by `SlotId`. No external dependency — the native IndexedDB API is a
 * handful of calls for what this needs (put/get/delete/getAll). */
import type { AnySaveFile } from "./format";

const DB_NAME = "railroads-saves";
const DB_VERSION = 1;
const STORE_NAME = "saves";

export const AUTO_SLOT_IDS = ["auto-0", "auto-1", "auto-2"] as const;
export const MANUAL_SLOT_IDS = [
  "manual-0",
  "manual-1",
  "manual-2",
  "manual-3",
  "manual-4",
] as const;
export type AutoSlotId = (typeof AUTO_SLOT_IDS)[number];
export type ManualSlotId = (typeof MANUAL_SLOT_IDS)[number];
export type SlotId = AutoSlotId | ManualSlotId;

export function isAutoSlot(id: SlotId): id is AutoSlotId {
  return (AUTO_SLOT_IDS as readonly string[]).includes(id);
}

interface SaveRecord {
  slotId: SlotId;
  file: AnySaveFile;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "slotId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const request = fn(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
    });
  } finally {
    db.close();
  }
}

export async function putSave(slotId: SlotId, file: AnySaveFile): Promise<void> {
  await withStore("readwrite", (store) => store.put({ slotId, file } satisfies SaveRecord));
}

export async function getSave(slotId: SlotId): Promise<AnySaveFile | undefined> {
  const record = await withStore<SaveRecord | undefined>("readonly", (store) => store.get(slotId));
  return record?.file;
}

export async function deleteSave(slotId: SlotId): Promise<void> {
  await withStore("readwrite", (store) => store.delete(slotId));
}

export async function getAllSaves(): Promise<Array<{ slotId: SlotId; file: AnySaveFile }>> {
  const records = await withStore<SaveRecord[]>("readonly", (store) => store.getAll());
  return records.map((r) => ({ slotId: r.slotId, file: r.file }));
}
