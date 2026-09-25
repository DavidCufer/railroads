/**
 * Title/main menu screen (PLAN Phase 10): New Game, Continue (disabled until Phase 11 adds saves),
 * Settings (placeholder until Phase 11 builds the real settings screen). Shown on load for a real
 * player; skipped entirely under `?debug=1` so every existing e2e test that expects the game to be
 * immediately interactive keeps working unchanged.
 */
import type { NewGameOptions } from "../sim/state";
import { renderNewGameScreen } from "./newGameScreen";
import { h } from "./h";
import { strings } from "./strings";

export interface TitleScreenHandlers {
  onStart: (options: NewGameOptions) => void;
}

/** Mounts the title screen into `container` and returns a function that removes it — call after
 * `onStart` fires so the game underneath is visible. */
export function openTitleScreen(container: HTMLElement, handlers: TitleScreenHandlers): void {
  const root = h("div", { className: "title-screen" });
  container.appendChild(root);

  function showMenu(): void {
    const t = strings.titleScreen;
    root.replaceChildren(
      h(
        "div",
        { className: "title-menu" },
        h("div", { className: "title-game-name" }, t.gameTitle),
        h("button", { className: "title-btn title-btn-primary", onClick: showNewGame }, t.newGame),
        h(
          "button",
          { className: "title-btn", disabled: true, title: t.continueDisabled },
          t.continue,
        ),
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

  function showSettings(): void {
    const t = strings.settingsPlaceholder;
    root.replaceChildren(
      h(
        "div",
        { className: "settings-placeholder" },
        h("div", { className: "settings-placeholder-title" }, t.title),
        h("div", { className: "settings-placeholder-body" }, t.body),
        h("button", { className: "title-btn", onClick: showMenu }, t.back),
      ),
    );
  }

  showMenu();
}
