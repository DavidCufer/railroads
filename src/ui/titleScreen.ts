/**
 * Title/main menu screen (PLAN Phase 10/11): New Game, Continue (loads the latest save), Load
 * Game (browse all slots), Settings. Shown on load for a real player; skipped entirely under
 * `?debug=1` so every existing e2e test that expects the game to be immediately interactive keeps
 * working unchanged.
 */
import type { GameState, NewGameOptions } from "../sim/state";
import { latestSaveSlot, loadSlot, OldMapScaleError } from "../save";
import { startTitleScene, type TitleSceneHandle } from "../render/titleScene";
import { renderNewGameScreen } from "./newGameScreen";
import { renderSaveLoadScreen } from "./saveLoadScreen";
import { renderScenariosScreen } from "./scenariosScreen";
import { renderAchievementsScreen } from "./achievementsScreen";
import { renderSettingsScreen } from "./settingsScreen";
import { h } from "./h";
import { strings } from "./strings";

export interface TitleScreenHandlers {
  onStart: (options: NewGameOptions) => void;
  onLoad: (state: GameState) => void;
}

const APP_VERSION = "0.1.0";

/** A save that cannot be loaded (from before the 5 km/tile world) gets a clear message. */
function reportLoadFailure(err: unknown): void {
  if (err instanceof OldMapScaleError) window.alert(strings.saveLoad.oldMapScale);
  else window.alert(err instanceof Error ? err.message : String(err));
}

/** Mounts the title screen into `container` and returns a function that removes it — call after
 * `onStart`/`onLoad` fires so the game underneath is visible. */
export function openTitleScreen(
  container: HTMLElement,
  handlers: TitleScreenHandlers,
  screen?: "scenarios",
): void {
  const root = h("div", { className: "title-screen" });
  container.appendChild(root);

  // Full-bleed engraved scene (STYLE §12): a steam locomotive with a smoke trail, running only
  // while the title screen (any of its sub-screens) is mounted.
  const bgCanvas = h("canvas", { className: "title-bg-canvas" });
  root.appendChild(bgCanvas);
  let background: TitleSceneHandle | null = startTitleScene(bgCanvas);
  function stopBackground(): void {
    background?.stop();
    background = null;
  }

  function showMenu(): void {
    const t = strings.titleScreen;

    const newGameBtn = h(
      "button",
      { className: "title-btn title-btn-primary", onClick: showNewGame },
      t.newGame,
    );

    // Continue is only ever shown once a save is confirmed to exist (STYLE: never shown disabled).
    const btnGrid = h(
      "div",
      { className: "title-btn-grid" },
      newGameBtn,
      h("button", { className: "title-btn", onClick: showScenarios }, t.scenarios),
      h("button", { className: "title-btn", onClick: showLoad }, t.loadGame),
      h("button", { className: "title-btn", onClick: showAchievements }, t.achievements),
      h("button", { className: "title-btn", onClick: showSettings }, t.settings),
    );

    void latestSaveSlot()
      .then((latest) => {
        if (!latest) return;
        const continueBtn = h(
          "button",
          {
            className: "title-btn title-btn-primary",
            onClick: () => {
              void loadSlot(latest.slotId)
                .then((state) => {
                  if (state) {
                    stopBackground();
                    handlers.onLoad(state);
                    root.remove();
                  }
                })
                .catch(reportLoadFailure);
            },
          },
          t.continue,
        );
        newGameBtn.classList.remove("title-btn-primary");
        btnGrid.insertBefore(continueBtn, newGameBtn);
      })
      .catch(() => {
        // IndexedDB unavailable — Continue just stays hidden.
      });

    root.replaceChildren(
      bgCanvas,
      h("div", { className: "title-scrim" }),
      h("div", { className: "title-frame" }),
      h(
        "div",
        { className: "title-menu" },
        h(
          "div",
          { className: "title-cartouche plaque" },
          h("div", { className: "title-overline" }, t.overline),
          h("div", { className: "title-game-name" }, t.gameTitle),
          h("div", { className: "rule-double" }),
          h("div", { className: "title-subtitle" }, t.tagline),
        ),
        btnGrid,
      ),
      h("div", { className: "title-version" }, `v${APP_VERSION}`),
    );
  }

  function showNewGame(): void {
    root.replaceChildren(
      renderNewGameScreen({
        onBack: showMenu,
        onStart: (options: NewGameOptions) => {
          stopBackground();
          handlers.onStart(options);
          root.remove();
        },
      }),
    );
  }

  function showScenarios(): void {
    root.replaceChildren(
      renderScenariosScreen({
        onBack: showMenu,
        onStart: (options: NewGameOptions) => {
          stopBackground();
          handlers.onStart(options);
          root.remove();
        },
      }),
    );
  }

  function showAchievements(): void {
    root.replaceChildren(renderAchievementsScreen(showMenu));
  }

  function showLoad(): void {
    root.replaceChildren(
      renderSaveLoadScreen({
        mode: "load",
        onBack: showMenu,
        onLoad: (slotId) => {
          void loadSlot(slotId)
            .then((state) => {
              if (state) {
                stopBackground();
                handlers.onLoad(state);
                root.remove();
              }
            })
            .catch(reportLoadFailure);
        },
      }),
    );
  }

  function showSettings(): void {
    root.replaceChildren(renderSettingsScreen({ onBack: showMenu }));
  }

  showMenu();
  if (screen === "scenarios") showScenarios();
}
