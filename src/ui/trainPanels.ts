/**
 * Train UI entry points (SPEC §7, PLAN Phases 6 and 22): the buy wizard (`train/buyWizard.ts`), the
 * per-train panel (`train/trainPanel.ts`) and the train list below. main.ts imports from here.
 */
import type { GameState } from "../sim/state";
import { cardRow, cardList } from "./components/cardRow";
import { emptyState } from "./components/emptyState";
import { locomotiveById } from "../data/trains";
import { icon } from "./icons";
import { openPanel } from "./panel";
import { strings } from "./strings";
import { locoThumb } from "./train/pictures";
import { statusLine, statusText } from "./train/trainStatus";
import { openTrainPanel, type TrainPanelHandlers } from "./train/trainPanel";

export { openBuyTrainPanel, type BuyTrainHandlers } from "./train/buyWizard";
export { openTrainPanel, type TrainPanelHandlers } from "./train/trainPanel";
export { statusText } from "./train/trainStatus";

/** Opens the train list; tapping a row focuses the camera on that train (via `onFocus`) and opens
 * its management panel. */
export function openTrainListPanel(
  container: HTMLElement,
  state: GameState,
  onFocus: (trainId: number) => void,
  handlers: TrainPanelHandlers = {},
): void {
  const rows = state.trains.map((t) => {
    const loco = locomotiveById(t.locoModelId);
    const status = statusLine(state, t);
    return cardRow({
      className: "train-list-row",
      thumb: loco ? locoThumb(loco, 72, 30) : icon("trains"),
      title: t.name,
      meta: status.text,
      chevron: true,
      onClick: () => {
        onFocus(t.id);
        openTrainPanel(container, state, t.id, handlers);
      },
    });
  });
  void statusText;
  openPanel(container, {
    key: "train-list",
    title: strings.trains.listTitle,
    body:
      state.trains.length === 0 ? [emptyState(strings.trains.none, "trains")] : [cardList(...rows)],
  });
}
