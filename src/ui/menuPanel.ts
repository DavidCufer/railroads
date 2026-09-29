/**
 * The ☰ menu (SPEC §10.1): overlay toggles (SPEC §10.2) and the mini-map toggle. Overlay/mini-map
 * visibility is presentation state, not simulation state — it lives in src/main.ts alongside
 * `currentTool`/`quickBuild`, the same pattern every other UI-only toggle in this codebase already
 * uses, and is just read/written here through `MenuPanelHandlers`.
 */
import { CARGO, CARGO_TYPES, type CargoType } from "../data/cargo";
import { h } from "./h";
import { cargoIcon, icon, type IconName } from "./icons";
import { cardList, cardRow } from "./components/cardRow";
import { section } from "./components/section";
import { toggleRow } from "./components/toggleRow";
import { openPanel } from "./panel";
import { strings } from "./strings";

export type OverlayToggle = "catchments" | "cargoHeatmap" | "trackType" | "trainProfit" | "miniMap";

export interface OverlayState {
  catchments: boolean;
  cargoHeatmap: boolean;
  heatmapCargo: CargoType;
  trackType: boolean;
  trainProfit: boolean;
  miniMap: boolean;
}

export function defaultOverlayState(): OverlayState {
  return {
    catchments: false,
    cargoHeatmap: false,
    heatmapCargo: "passengers",
    trackType: false,
    trainProfit: false,
    miniMap: true,
  };
}

export interface MenuPanelHandlers {
  getOverlayState: () => OverlayState;
  onToggle: (key: OverlayToggle) => void;
  onSetHeatmapCargo: (cargo: CargoType) => void;
  onSaveGame: () => void;
  onOpenSettings: () => void;
  onOpenRoster?: () => void;
  onOpenHelp?: () => void;
}

const OVERLAY_ICONS: Record<Exclude<OverlayToggle, "miniMap">, IconName> = {
  catchments: "target",
  cargoHeatmap: "flame",
  trackType: "palette",
  trainProfit: "trendUp",
};

export function openMenuPanel(container: HTMLElement, handlers: MenuPanelHandlers): void {
  const render = (): void => {
    const state = handlers.getOverlayState();

    const overlayRow = (key: Exclude<OverlayToggle, "miniMap">): HTMLElement =>
      toggleRow({
        icon: OVERLAY_ICONS[key],
        label: strings.menu.overlayNames[key],
        on: state[key],
        onToggle: () => {
          handlers.onToggle(key);
          render();
        },
      });

    const gameRows = [
      cardRow({
        thumb: icon("save"),
        title: strings.menu.saveGame,
        chevron: true,
        onClick: handlers.onSaveGame,
      }),
      cardRow({
        thumb: icon("settings"),
        title: strings.menu.settings,
        chevron: true,
        onClick: handlers.onOpenSettings,
      }),
      handlers.onOpenRoster
        ? cardRow({
            thumb: icon("roster"),
            title: strings.menu.roster,
            chevron: true,
            onClick: handlers.onOpenRoster,
          })
        : null,
      handlers.onOpenHelp
        ? cardRow({
            thumb: icon("info"),
            title: strings.help.menuEntry,
            chevron: true,
            onClick: handlers.onOpenHelp,
            testId: "menu-help",
          })
        : null,
    ];

    const overlayRows: HTMLElement[] = [overlayRow("catchments"), overlayRow("cargoHeatmap")];
    if (state.cargoHeatmap) {
      overlayRows.push(
        h(
          "div",
          { className: "menu-cargo-picker" },
          ...CARGO_TYPES.map((cargo) =>
            h(
              "button",
              {
                className: `menu-cargo-btn${cargo === state.heatmapCargo ? " active" : ""}`,
                "aria-label": CARGO[cargo].name,
                title: CARGO[cargo].name,
                onClick: () => {
                  handlers.onSetHeatmapCargo(cargo);
                  render();
                },
              },
              cargoIcon(cargo, "cargo-icon-lg"),
            ),
          ),
        ),
      );
    }
    overlayRows.push(overlayRow("trackType"), overlayRow("trainProfit"));

    const body: Node[] = [
      section(strings.menu.game, [cardList(...gameRows)]),
      section(strings.menu.overlays, [cardList(...overlayRows)]),
      section(strings.menu.miniMap, [
        cardList(
          toggleRow({
            icon: "map",
            label: strings.menu.miniMap,
            on: state.miniMap,
            onToggle: () => {
              handlers.onToggle("miniMap");
              render();
            },
          }),
        ),
      ]),
    ];

    openPanel(container, { title: strings.menu.title, thumb: icon("menu"), body, key: "menu" });
  };

  render();
}
