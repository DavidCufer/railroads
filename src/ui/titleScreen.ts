/**
 * Title/main menu screen (PLAN Phase 10/11): New Game, Continue (loads the latest save), Load
 * Game (browse all slots), Settings. Shown on load for a real player; skipped entirely under
 * `?debug=1` so every existing e2e test that expects the game to be immediately interactive keeps
 * working unchanged.
 */
import type { GameState, NewGameOptions } from "../sim/state";
import { latestSaveSlot, loadSlot } from "../save";
import { renderNewGameScreen } from "./newGameScreen";
import { renderSaveLoadScreen } from "./saveLoadScreen";
import { renderSettingsScreen } from "./settingsScreen";
import { h } from "./h";
import { strings } from "./strings";

export interface TitleScreenHandlers {
  onStart: (options: NewGameOptions) => void;
  onLoad: (state: GameState) => void;
}

/** Mounts the title screen into `container` and returns a function that removes it — call after
 * `onStart`/`onLoad` fires so the game underneath is visible. */
export function openTitleScreen(container: HTMLElement, handlers: TitleScreenHandlers): void {
  const root = h("div", { className: "title-screen" });
  container.appendChild(root);

  function showMenu(): void {
    const t = strings.titleScreen;
    const continueBtn = h(
      "button",
      { className: "title-btn", disabled: true },
      t.continue,
    ) as HTMLButtonElement;
    continueBtn.title = t.continueDisabled;

    void latestSaveSlot()
      .then((latest) => {
        if (!latest) return;
        continueBtn.disabled = false;
        continueBtn.title = "";
        continueBtn.onclick = () => {
          void loadSlot(latest.slotId).then((state) => {
            if (state) {
              handlers.onLoad(state);
              root.remove();
            }
          });
        };
      })
      .catch(() => {
        // IndexedDB unavailable — Continue just stays disabled.
      });

    root.replaceChildren(
      h(
        "div",
        { className: "title-menu" },
        h("div", { className: "title-game-name" }, t.gameTitle),
        h("button", { className: "title-btn title-btn-primary", onClick: showNewGame }, t.newGame),
        continueBtn,
        h("button", { className: "title-btn", onClick: showLoad }, t.loadGame),
        h("button", { className: "title-btn", onClick: showSettings }, t.settings),
      ),
    );
  }

  function showNewGame(): void {
    root.replaceChildren(
      renderNewGameScreen({
        onBack: showMenu,
        onStart: (options: NewGameOptions) => {
          handlers.onStart(options);
          root.remove();
        },
      }),
    );
  }

  function showLoad(): void {
    root.replaceChildren(
      renderSaveLoadScreen({
        mode: "load",
        onBack: showMenu,
        onLoad: (slotId) => {
          void loadSlot(slotId).then((state) => {
            if (state) {
              handlers.onLoad(state);
              root.remove();
            }
          });
        },
      }),
    );
  }

  function showSettings(): void {
    root.replaceChildren(renderSettingsScreen({ onBack: showMenu }));
  }

  showMenu();
}
