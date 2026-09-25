/**
 * Save/Load screen (SPEC §13: "Load menu shows slot name, company date, cash, map"). One renderer
 * for both directions — Load (from the title screen, or the in-game ☰ menu) lists every slot with
 * a save in it; Save (in-game ☰ menu only) lists the 5 manual slots to save into. Autosave slots
 * are never a save *target* (SPEC: "Manual save to 5 named slots" — autosaving is automatic only).
 */
import {
  AUTO_SLOT_IDS,
  MANUAL_SLOT_IDS,
  deleteSlot,
  listSaveSlots,
  saveToSlot,
  type ManualSlotId,
  type SaveMeta,
  type SaveSlotInfo,
  type SlotId,
} from "../save";
import type { GameState } from "../sim/state";
import { formatMoney } from "./format";
import { h } from "./h";
import { strings } from "./strings";

export type SaveLoadMode = "load" | "save";

export interface SaveLoadScreenHandlers {
  mode: SaveLoadMode;
  onBack: () => void;
  /** Required in "load" mode. */
  onLoad?: (slotId: SlotId) => void;
  /** Required in "save" mode — the live state to write into whichever slot the player picks. */
  state?: GameState;
}

function slotLabel(slotId: SlotId, meta: SaveMeta | undefined): string {
  if (meta?.name) return meta.name;
  const autoIndex = AUTO_SLOT_IDS.indexOf(slotId as (typeof AUTO_SLOT_IDS)[number]);
  if (autoIndex !== -1) return strings.saveLoad.autosaveLabel(autoIndex + 1);
  return strings.saveLoad.emptySlot;
}

function slotDetail(meta: SaveMeta): string {
  const date = new Date(meta.savedAt);
  const savedAtStr = Number.isFinite(date.getTime()) ? date.toLocaleString() : "";
  return `${meta.mapLabel} · Year ${meta.year} · ${formatMoney(meta.cash)} · ${savedAtStr}`;
}

export function renderSaveLoadScreen(handlers: SaveLoadScreenHandlers): HTMLElement {
  const s = strings.saveLoad;
  const root = h("div", { className: "save-load-screen" });
  const slotIds: readonly SlotId[] =
    handlers.mode === "save" ? MANUAL_SLOT_IDS : [...AUTO_SLOT_IDS, ...MANUAL_SLOT_IDS];

  async function refresh(): Promise<void> {
    let slots: SaveSlotInfo[] = [];
    try {
      slots = await listSaveSlots();
    } catch {
      // IndexedDB unavailable — render as if nothing is saved yet, rather than crashing the menu.
    }
    const bySlot = new Map(slots.map((s2) => [s2.slotId, s2.meta]));
    renderList(bySlot);
  }

  function renderList(bySlot: Map<SlotId, SaveMeta>): void {
    const rows = slotIds.map((slotId) => {
      const meta = bySlot.get(slotId);
      const label = slotLabel(slotId, meta);
      const actions: Node[] = [];

      if (handlers.mode === "load") {
        if (meta) {
          actions.push(
            h(
              "button",
              {
                className: "save-slot-btn save-slot-btn-primary",
                onClick: () => handlers.onLoad?.(slotId),
              },
              s.load,
            ),
            h(
              "button",
              {
                className: "save-slot-btn save-slot-btn-danger",
                onClick: () => {
                  if (!window.confirm(s.deleteConfirm)) return;
                  void deleteSlot(slotId).then(refresh);
                },
              },
              s.delete,
            ),
          );
        }
      } else {
        // Safe: `slotIds` is `MANUAL_SLOT_IDS` whenever `mode === "save"` (see above).
        const manualSlotId = slotId as ManualSlotId;
        actions.push(
          h(
            "button",
            {
              className: "save-slot-btn save-slot-btn-primary",
              onClick: () => void doSave(manualSlotId, meta),
            },
            meta ? s.overwrite : s.save,
          ),
        );
        if (meta) {
          actions.push(
            h(
              "button",
              {
                className: "save-slot-btn save-slot-btn-danger",
                onClick: () => {
                  if (!window.confirm(s.deleteConfirm)) return;
                  void deleteSlot(slotId).then(refresh);
                },
              },
              s.delete,
            ),
          );
        }
      }

      return h(
        "div",
        { className: `save-slot-card${meta ? "" : " save-slot-empty"}` },
        h(
          "div",
          { className: "save-slot-info" },
          h("div", { className: "save-slot-name" }, label),
          meta
            ? h("div", { className: "save-slot-detail" }, slotDetail(meta))
            : h("div", { className: "save-slot-detail" }, s.emptySlot),
        ),
        h("div", { className: "save-slot-actions" }, ...actions),
      );
    });

    root.replaceChildren(
      h(
        "div",
        { className: "new-game-header" },
        h("span", null, handlers.mode === "load" ? s.loadTitle : s.saveTitle),
      ),
      h(
        "div",
        { className: "new-game-content" },
        h("div", { className: "save-slot-list" }, ...rows),
      ),
      h(
        "div",
        { className: "new-game-footer" },
        h(
          "button",
          { className: "new-game-back-btn settings-back-btn", onClick: handlers.onBack },
          s.back,
        ),
      ),
    );
  }

  async function doSave(slotId: ManualSlotId, existing: SaveMeta | undefined): Promise<void> {
    const state = handlers.state;
    if (!state) return;
    const name = window.prompt(s.namePrompt, existing?.name ?? s.nameDefault);
    if (name === null) return;
    await saveToSlot(state, slotId, name.trim() || s.nameDefault);
    await refresh();
  }

  root.replaceChildren(h("div", { className: "save-slot-empty-msg" }, "…"));
  void refresh();
  return root;
}
