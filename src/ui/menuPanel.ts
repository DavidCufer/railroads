/**
 * The ☰ menu (SPEC §10.1): overlay toggles (SPEC §10.2) and the mini-map toggle. Overlay/mini-map
 * visibility is presentation state, not simulation state — it lives in src/main.ts alongside
 * `currentTool`/`quickBuild`, the same pattern every other UI-only toggle in this codebase already
 * uses, and is just read/written here through `MenuPanelHandlers`.
 */
import { CARGO, CARGO_TYPES, type CargoType } from "../data/cargo";
import { h } from "./h";
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
}

export function openMenuPanel(container: HTMLElement, handlers: MenuPanelHandlers): void {
  const render = (): void => {
    const state = handlers.getOverlayState();

    const toggleBtn = (key: OverlayToggle, label: string): HTMLElement =>
      h(
        "button",
        {
          className: `menu-toggle-btn${state[key] ? " active" : ""}`,
          onClick: () => {
            handlers.onToggle(key);
            render();
          },
        },
        label,
      );

    const body: Node[] = [
      h("div", { className: "panel-section-title" }, strings.menu.overlays),
      toggleBtn("catchments", strings.menu.overlayNames.catchments),
      toggleBtn("cargoHeatmap", strings.menu.overlayNames.cargoHeatmap),
    ];

    if (state.cargoHeatmap) {
      body.push(
        h("div", { className: "panel-row" }, strings.menu.cargoHeatmapPrompt),
        h(
          "div",
          { className: "menu-cargo-picker" },
          ...CARGO_TYPES.map((cargo) =>
            h(
              "button",
              {
                className: `menu-cargo-btn${cargo === state.heatmapCargo ? " active" : ""}`,
                style: { background: CARGO[cargo].color },
                onClick: () => {
                  handlers.onSetHeatmapCargo(cargo);
                  render();
                },
              },
              CARGO[cargo].name,
            ),
          ),
        ),
      );
    }

    body.push(
      toggleBtn("trackType", strings.menu.overlayNames.trackType),
      toggleBtn("trainProfit", strings.menu.overlayNames.trainProfit),
      h("div", { className: "panel-section-title" }, strings.menu.miniMap),
      toggleBtn("miniMap", strings.menu.miniMap),
    );

    openPanel(container, { title: strings.menu.title, body });
  };

  render();
}
