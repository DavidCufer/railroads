/** One-tap passing loop (Phase 41): the jam toast opens this at the suggested tile. */
import { buildPassingLoop, computePassingLoopPlan } from "../sim/commands";
import type { GameState } from "../sim/state";
import { footerButton } from "./components/footer";
import { formatMoney } from "./format";
import { h } from "./h";
import { icon } from "./icons";
import { closePanel, openPanel } from "./panel";
import { strings } from "./strings";
import { showToast } from "./toast";

export function openPassingLoopPanel(container: HTMLElement, state: GameState, tile: number): void {
  const t = strings.loop;
  const render = (): void => {
    const plan = computePassingLoopPlan(state, tile);
    openPanel(container, {
      title: t.title,
      thumb: icon("track"),
      body: [h("div", { className: "panel-row", "data-testid": "loop-line" }, t.line)],
      footer: [
        footerButton({
          kind: "primary",
          icon: "plus",
          label: `${t.build} · ${formatMoney(plan.cost)}`,
          className: "loop-build-btn",
          disabled: !plan.valid || plan.cost > state.cash,
          onClick: () => {
            const result = buildPassingLoop(state, tile);
            if (!result.ok) {
              showToast(container, strings.build.reasons[result.reason], "warn");
              render();
              return;
            }
            closePanel();
            showToast(container, t.built(formatMoney(result.cost)));
          },
        }),
      ],
      key: `loop:${tile}`,
      live: render,
    });
  };
  render();
}
