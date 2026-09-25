import { GameLoop, type GameSpeed } from "./render/loop";
import { FpsCounter } from "./render/fps";
import { Camera, TILE_SIZE } from "./render/camera";
import { TerrainRenderer } from "./render/terrain";
import { TrackRenderer } from "./render/track";
import { drawBuildPreview, type BuildMode, type GhostPreview } from "./render/buildPreview";
import { drawCityLabels, cityWorldCenter } from "./render/labels";
import { drawStations, drawStationLabels } from "./render/stations";
import { drawStationCatchment, type StationCatchmentPreview } from "./render/stationPreview";
import { drawTrains } from "./render/trains";
import { drawDeliveryLabels, isLabelExpired, type FloatingLabel } from "./render/deliveryLabels";
import {
  drawCatchmentsOverlay,
  drawCargoHeatmapOverlay,
  drawTrackTypeOverlay,
  drawTrainProfitOverlay,
} from "./render/overlays";
import { MiniMapRenderer } from "./render/minimap";
import type { ReservedScreenRect } from "./render/reservedRects";
import { CameraInput, type BuildDragHandlers } from "./ui/cameraInput";
import { createDebugControls } from "./ui/debugControls";
import { createTopBar } from "./ui/topBar";
import { createToolbar, createQuickBuildToggle, type ToolId } from "./ui/toolbar";
import { openCityPanel, openIndustryPanel } from "./ui/infoPanels";
import { openStationPanel, openStationPlacementPanel } from "./ui/stationPanels";
import { closePanel } from "./ui/panel";
import { initBackButton } from "./ui/backButton";
import { showToast } from "./ui/toast";
import { strings } from "./ui/strings";
import {
  defaultOverlayState,
  openMenuPanel,
  type OverlayState,
  type OverlayToggle,
} from "./ui/menuPanel";
import {
  hideConfirmBar,
  hideDragCostLabel,
  showConfirmBar,
  showDragCostLabel,
} from "./ui/buildHud";
import {
  createGameState,
  type GameState,
  type NewGameOptions,
  type RandomNewGameOptions,
} from "./sim/state";
import {
  buildImprovement,
  buildStation,
  buildTrack,
  bulldoze,
  buyTrain,
  civicInvestment,
  computeBuildPlan,
  computeBulldozePlan,
  computeElectrifyPlan,
  computeUpgradePlan,
  electrifyTrack,
  refreshStationEconomy,
  repayLoan,
  sellTrain,
  setOrders,
  takeLoan,
  upgradeTrack,
  type BuildPlan,
  type BulldozePlan,
  type ElectrifyPlan,
  type UpgradePlan,
} from "./sim/commands";
import { INDUSTRIES, type IndustryType } from "./data/industries";
import type { City } from "./sim/economy/types";
import { findBuildPath } from "./sim/track/pathfind";
import { directionIndex } from "./sim/track/graph";
import { spanTilesBetween, validBridgeTypes } from "./sim/track/cost";
import { canPlaceStationAt, stationAtTile, stationCatchmentTiles } from "./sim/stations";
import { terrainId } from "./sim/map/terrain";
import { inBounds, tileIndex } from "./sim/map/grid";
import { calendarFromTicks, isMonthBoundary, isYearBoundary } from "./sim/time";
import type { MapSizeName, Roughness, WaterLevel } from "./data/mapGen";
import type { Difficulty } from "./data/finance";
import type { RegionId } from "./sim/regions";
import type { BridgeType } from "./data/track";
import { STATION_TYPE_DEFS, type StationImprovementType, type StationType } from "./data/stations";
import { CARGO, type CargoType } from "./data/cargo";
import { advanceOneHour } from "./sim/tick";
import type { TrainOrder } from "./sim/trains/types";
import type { Station } from "./sim/stations/types";
import { debugTriggerCrash, installErrorBoundary } from "./ui/errorBoundary";
import { openBuyTrainPanel, openTrainListPanel, openTrainPanel } from "./ui/trainPanels";
import { createTrainListButton } from "./ui/toolbar";
import { createNewsButton, formatNewsItem, openNewsPanel } from "./ui/newsPanel";
import { openFinancePanel } from "./ui/financePanel";
import { openYearlyReport } from "./ui/yearlyReport";
import { createGoalsButton, openGoalCelebration, openGoalsPanel } from "./ui/goalsPanel";
import { isPanelOpen } from "./ui/panel";
import { formatMoney } from "./ui/format";
import { openTitleScreen } from "./ui/titleScreen";
import { autosave } from "./save";
import { App } from "@capacitor/app";
import { loadSettings, type Settings } from "./ui/settings";
import { renderSettingsScreen } from "./ui/settingsScreen";
import { renderSaveLoadScreen } from "./ui/saveLoadScreen";
import { drawGridOverlay } from "./render/overlays";
import { showFirstGameHints } from "./ui/hints";
import { initSound, playSound } from "./ui/sound";

const RIVER_ID = terrainId("river");
const WATER_ID = terrainId("water");

const DEBUG = new URLSearchParams(window.location.search).has("debug");

const DEFAULT_NEW_GAME: NewGameOptions = {
  seed: 12345,
  size: "medium",
  waterLevel: "normal",
  roughness: "normal",
};

interface DragState {
  mode: BuildMode;
  path: number[];
  /** Last tile the path was extended to, so onMove can skip recomputing A* for sub-tile jitter. */
  lastGoalTile: number;
  bridgeOverride: BridgeType | null;
  plan: BuildPlan | UpgradePlan | ElectrifyPlan | BulldozePlan;
  cost: number;
  ok: boolean;
}

function main(): void {
  const canvas = document.getElementById("game-canvas") as HTMLCanvasElement | null;
  if (!canvas) throw new Error("missing #game-canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas context unavailable");
  const uiRoot = document.getElementById("ui");
  if (!uiRoot) throw new Error("missing #ui");
  const ui: HTMLElement = uiRoot;

  const dpr = window.devicePixelRatio || 1;
  function resize(): void {
    const canvasEl = canvas as HTMLCanvasElement;
    canvasEl.width = Math.round(window.innerWidth * dpr);
    canvasEl.height = Math.round(window.innerHeight * dpr);
  }
  resize();
  window.addEventListener("resize", resize);

  let currentOptions: NewGameOptions = DEFAULT_NEW_GAME;
  let state: GameState = createGameState(currentOptions);
  // Installed as early as possible so it covers everything below too — an uncaught exception
  // during map generation or the very first render is exactly the kind of thing a player should
  // see a recovery dialog for, not a silently frozen title screen.
  installErrorBoundary(ui, () => state);
  const camera = new Camera(state.map.width, state.map.height);
  const terrainRenderer = new TerrainRenderer(state.map, state.cities, state.industries);
  const trackRenderer = new TrackRenderer(state.map.width, state.map.height, state.trackGraph);
  const miniMapRenderer = new MiniMapRenderer(state.map);
  let lastMapContentVersion = state.mapContentVersion;
  const cameraInput = new CameraInput(canvas, camera, () => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  let currentTool: ToolId = "info";
  let quickBuild = false;
  let settings: Settings = loadSettings();
  let overlayState: OverlayState = defaultOverlayState();
  let dragState: DragState | null = null;
  let ghost: GhostPreview | null = null;
  let stationPreview: StationCatchmentPreview | null = null;
  let stationPlacementOpen = false;
  /** Set while the Buy Train dialog's orders editor is "tap a station to add it" mode is active —
   * intercepts the next station tap instead of opening that station's own panel. */
  let stationPickHandler: ((stationId: number) => void) | null = null;
  /** Floating `+$` delivery labels (SPEC §8.1) — drained from `state.pendingDeliveries` each tick,
   * pruned once their real-time animation finishes. */
  let floatingLabels: FloatingLabel[] = [];

  function currentYear(): number {
    return calendarFromTicks(state.startYear, state.ticks).year;
  }

  function screenToTile(canvasX: number, canvasY: number): number | null {
    const world = camera.screenToWorld(canvasX, canvasY, window.innerWidth, window.innerHeight);
    const tx = Math.floor(world.x / TILE_SIZE);
    const ty = Math.floor(world.y / TILE_SIZE);
    if (!inBounds(state.map, tx, ty)) return null;
    return tileIndex(state.map, tx, ty);
  }

  function invalidateAlongPath(path: readonly number[]): void {
    const touched = [...path];
    for (let i = 0; i < path.length - 1; i++) {
      touched.push(...spanTilesBetween(state.map, path[i] as number, path[i + 1] as number));
    }
    trackRenderer.invalidateTiles(touched);
  }

  /** Common wiring for "the live GameState object changed out from under every renderer/input
   * handler" — a brand-new random/region map (`regenerate`) and a loaded save (`loadGame`) both
   * need every one of these resets, so a save/load bug can't silently diverge from a New Game one. */
  function applyState(newState: GameState): void {
    state = newState;
    camera.setMapSize(state.map.width, state.map.height);
    terrainRenderer.setMap(state.map, state.cities, state.industries);
    trackRenderer.setMap(state.map.width, state.map.height, state.trackGraph);
    miniMapRenderer.setMap(state.map);
    lastMapContentVersion = state.mapContentVersion;
    dragState = null;
    ghost = null;
    stationPickHandler = null;
    floatingLabels = [];
    hideConfirmBar();
    hideDragCostLabel();
    newsButton.refreshBadge(state);
    setTool("info");
  }

  function regenerate(options: NewGameOptions): void {
    currentOptions = options;
    applyState(createGameState(options));
    if (!DEBUG) showFirstGameHints(ui);
  }

  /** A save loaded from the title screen/Load screen (SPEC §13) — unlike `regenerate`, the map
   * isn't being freshly generated, so `currentOptions` is only a best-effort guess (only used by
   * the `?debug=1`-only regenerate control, never reachable from a real loaded game). */
  function loadGame(loaded: GameState): void {
    currentOptions = loaded.regionId
      ? { seed: loaded.seed, region: loaded.regionId }
      : { seed: loaded.seed, size: "medium", waterLevel: "normal", roughness: "normal" };
    applyState(loaded);
  }

  function startStationPlacement(tile: number): void {
    stationPlacementOpen = true;
    openStationPlacementPanel(ui, state, tile, {
      onPreview: (previewTile, type, ok) => {
        stationPreview = {
          tile: previewTile,
          catchment: stationCatchmentTiles(
            state.map,
            previewTile,
            STATION_TYPE_DEFS[type].catchmentRadius,
          ),
          ok,
        };
      },
      onClose: () => {
        stationPreview = null;
        stationPlacementOpen = false;
      },
    });
  }

  /** World-px point roughly at a river mouth (midway between the last river tile and the water
   * it flows into) — used by e2e tests to frame a closeup screenshot without guessing coordinates. */
  function findRiverMouth(): { x: number; y: number } | null {
    const map = state.map;
    for (let idx = 0; idx < map.terrain.length; idx++) {
      if ((map.terrain[idx] as number) !== RIVER_ID) continue;
      const next = map.riverNext[idx] as number;
      if (next < 0 || (map.terrain[next] as number) !== WATER_ID) continue;
      const x = idx % map.width;
      const y = Math.floor(idx / map.width);
      const nx = next % map.width;
      const ny = Math.floor(next / map.width);
      return { x: ((x + nx) / 2 + 0.5) * TILE_SIZE, y: ((y + ny) / 2 + 0.5) * TILE_SIZE };
    }
    return null;
  }

  /** Screen-space hit test against every train's current head position — trains are small and
   * moving, so this is simpler and more accurate than mapping the tap back to a tile. */
  function findTrainAt(canvasX: number, canvasY: number, viewportW: number, viewportH: number) {
    const hitRadius = TILE_SIZE * camera.zoom * 0.6;
    for (const train of state.trains) {
      const screen = camera.worldToScreen(
        train.renderToX * TILE_SIZE,
        train.renderToY * TILE_SIZE,
        viewportW,
        viewportH,
      );
      if (Math.hypot(screen.x - canvasX, screen.y - canvasY) <= hitRadius) return train;
    }
    return null;
  }

  function openBuyTrain(stationId: number): void {
    openBuyTrainPanel(ui, state, stationId, {
      pickStationOnMap: (onPicked) => {
        stationPickHandler = onPicked;
      },
      cancelPickStationOnMap: () => {
        stationPickHandler = null;
      },
    });
  }

  function handleTap(canvasX: number, canvasY: number): void {
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    // Mini-map tap-to-jump (SPEC §10.1) takes priority over everything else under it.
    if (overlayState.miniMap && !isPanelOpen()) {
      const jumpTo = miniMapRenderer.worldPointAt(canvasX, canvasY, viewportH);
      if (jumpTo) {
        camera.x = jumpTo.x;
        camera.y = jumpTo.y;
        return;
      }
    }

    const trainHit = findTrainAt(canvasX, canvasY, viewportW, viewportH);
    if (trainHit) {
      openTrainPanel(ui, state, trainHit.id);
      return;
    }

    const world = camera.screenToWorld(canvasX, canvasY, viewportW, viewportH);
    const tileX = Math.floor(world.x / TILE_SIZE);
    const tileY = Math.floor(world.y / TILE_SIZE);
    if (!inBounds(state.map, tileX, tileY)) return;
    const idx = tileIndex(state.map, tileX, tileY);

    // An existing station is manageable from either Info or Station mode.
    const station = stationAtTile(state.stations, idx);
    if (station) {
      if (stationPickHandler) {
        const picked = stationPickHandler;
        stationPickHandler = null;
        picked(station.id);
        return;
      }
      openStationPanel(ui, state, station.id, { onBuyTrain: () => openBuyTrain(station.id) });
      return;
    }

    if (currentTool === "station") {
      if (canPlaceStationAt(state.map, state.trackGraph, idx)) {
        startStationPlacement(idx);
      } else {
        showToast(ui, strings.station.tapTrackTile, "warn");
      }
      return;
    }
    if (currentTool !== "info") return;

    const cityId = state.map.cityId[idx] as number;
    const industryIdx = state.map.industryId[idx] as number;
    if (cityId >= 0 && state.cities[cityId]) {
      openCityPanel(ui, state, cityId);
    } else if (industryIdx >= 0 && state.industries[industryIdx]) {
      openIndustryPanel(ui, state.industries[industryIdx]);
    }
  }
  cameraInput.setOnTap(handleTap);

  // --- Build mode drag handling (SPEC §5.2) ---------------------------------------------------

  function planFor(
    mode: BuildMode,
    path: number[],
  ): { plan: BuildPlan | UpgradePlan | ElectrifyPlan | BulldozePlan; cost: number; ok: boolean } {
    if (mode === "track") {
      const plan = computeBuildPlan(state, path, dragState?.bridgeOverride ?? undefined);
      return { plan, cost: plan.cost, ok: plan.valid };
    }
    if (mode === "double") {
      const plan = computeUpgradePlan(state, path);
      return { plan, cost: plan.cost, ok: plan.valid };
    }
    if (mode === "electrify") {
      const plan = computeElectrifyPlan(state, path);
      return { plan, cost: plan.cost, ok: plan.valid };
    }
    const plan = computeBulldozePlan(state, path);
    return { plan, cost: plan.refund, ok: plan.valid };
  }

  function firstBridgeStep(plan: BuildPlan): { kind: "river" | "water"; span: number } | null {
    const step = plan.toBuild.find((s) => s.bridge !== null);
    if (!step || !step.bridgeKind) return null;
    return { kind: step.bridgeKind, span: step.bridgeSpan.length || 1 };
  }

  function bridgeLabelFor(type: BridgeType): string {
    if (type === "wood") return "Wood bridge";
    if (type === "stone") return "Stone bridge";
    return "Steel bridge";
  }

  function updateDragVisuals(canvasX: number, canvasY: number): void {
    if (!dragState) return;
    ghost = { mode: dragState.mode, path: dragState.path, ok: dragState.ok };
    showDragCostLabel(
      ui,
      canvasX,
      canvasY,
      dragState.cost,
      dragState.ok,
      window.innerWidth,
      window.innerHeight,
    );
  }

  function showConfirm(): void {
    if (!dragState) return;
    const { mode, cost, ok, plan } = dragState;
    let bridgeLabel: string | undefined;
    if (mode === "track") {
      const bridge = firstBridgeStep(plan as BuildPlan);
      if (bridge) {
        const options = validBridgeTypes(bridge.kind, bridge.span, currentYear());
        const active = dragState.bridgeOverride ?? options[0];
        if (active) bridgeLabel = bridgeLabelFor(active);
      }
    }
    showConfirmBar(ui, {
      mode,
      cost,
      ok,
      ...(bridgeLabel !== undefined ? { bridgeLabel } : {}),
      onConfirm: () => {
        commit();
      },
      onCancel: () => {
        cancelDrag();
      },
      onCycleBridge: () => {
        cycleBridge();
      },
    });
  }

  function cycleBridge(): void {
    if (!dragState || dragState.mode !== "track") return;
    const bridge = firstBridgeStep(dragState.plan as BuildPlan);
    if (!bridge) return;
    const options = validBridgeTypes(bridge.kind, bridge.span, currentYear());
    if (options.length <= 1) return;
    const current = dragState.bridgeOverride ?? options[0];
    const idx = current ? options.indexOf(current) : -1;
    const next = options[(idx + 1) % options.length] as BridgeType;
    dragState.bridgeOverride = next;
    const { plan, cost, ok } = planFor("track", dragState.path);
    dragState.plan = plan;
    dragState.cost = cost;
    dragState.ok = ok;
    showConfirm();
  }

  function commit(): void {
    if (!dragState) return;
    const { mode, path, bridgeOverride } = dragState;
    const result =
      mode === "track"
        ? buildTrack(state, path, bridgeOverride ?? undefined)
        : mode === "double"
          ? upgradeTrack(state, path)
          : mode === "electrify"
            ? electrifyTrack(state, path)
            : bulldoze(state, path);

    if (!result.ok) {
      showToast(ui, strings.build.reasons[result.reason], "warn");
    } else {
      invalidateAlongPath(path);
    }
    cancelDrag();
  }

  function cancelDrag(): void {
    dragState = null;
    ghost = null;
    hideConfirmBar();
    hideDragCostLabel();
  }

  const buildHandlers: BuildDragHandlers = {
    onStart: (canvasX, canvasY) => {
      const tile = screenToTile(canvasX, canvasY);
      if (tile === null) return;
      const mode = currentTool as BuildMode;
      const { plan, cost, ok } = planFor(mode, [tile]);
      dragState = { mode, path: [tile], lastGoalTile: tile, bridgeOverride: null, plan, cost, ok };
      updateDragVisuals(canvasX, canvasY);
    },
    onMove: (canvasX, canvasY) => {
      if (!dragState) return;
      const goal = screenToTile(canvasX, canvasY);
      if (goal === null || goal === dragState.lastGoalTile) {
        updateDragVisuals(canvasX, canvasY);
        return;
      }
      dragState.lastGoalTile = goal;
      const start = dragState.path[0] as number;

      let path: number[] | null;
      if (dragState.mode === "double") {
        path = findBuildPath(state.map, start, goal, currentYear(), {
          existingTrackOnly: state.trackGraph,
        });
      } else if (dragState.mode === "electrify") {
        // SPEC §5.2: "drag along existing track (single or double)" — unlike Double mode, both
        // are valid to traverse here.
        path = findBuildPath(state.map, start, goal, currentYear(), {
          existingAnyTrack: state.trackGraph,
        });
      } else if (dragState.mode === "bulldoze") {
        // Bulldozing traces the raw tiles the finger passes over — no pathfinding, just remove
        // whatever track already exists along the way.
        path = bresenhamTiles(state.map.width, start, goal);
      } else {
        path = findBuildPath(state.map, start, goal, currentYear());
      }
      if (path && path.length >= 2) {
        dragState.path = path;
        const { plan, cost, ok } = planFor(dragState.mode, path);
        dragState.plan = plan;
        dragState.cost = cost;
        dragState.ok = ok;
      }
      updateDragVisuals(canvasX, canvasY);
    },
    onEnd: (committed) => {
      if (!dragState) return;
      hideDragCostLabel();
      if (!committed || dragState.path.length < 2) {
        cancelDrag();
        return;
      }
      if (quickBuild) {
        commit();
      } else {
        showConfirm();
      }
    },
  };

  function bresenhamTiles(mapWidth: number, from: number, to: number): number[] {
    let x0 = from % mapWidth;
    let y0 = Math.floor(from / mapWidth);
    const x1 = to % mapWidth;
    const y1 = Math.floor(to / mapWidth);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    const tiles: number[] = [y0 * mapWidth + x0];
    for (let guard = 0; guard < mapWidth + Math.floor(from / mapWidth) + mapWidth * 2; guard++) {
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
      tiles.push(y0 * mapWidth + x0);
    }
    return tiles;
  }

  function setTool(tool: ToolId): void {
    currentTool = tool;
    toolbar.setActive(tool);
    cancelDrag();
    if (stationPlacementOpen) closePanel();
    // Track/Double/Electrify/Bulldoze are drag-to-build; Station and Info are tap-driven (SPEC
    // §6.1's placement flow is a tap + panel, not a drag).
    const isDragBuildMode =
      tool === "track" || tool === "double" || tool === "electrify" || tool === "bulldoze";
    cameraInput.setBuildMode(isDragBuildMode, isDragBuildMode ? buildHandlers : null);
  }

  /** Applies everything about `settings` that isn't just "read it when needed" — the UI-scale CSS
   * variable and WebAudio init/mute state. Called once at startup and again on every change from
   * the Settings screen (SPEC §13: units/quick build/sound/grid are read live where they're used;
   * only these two need an explicit push). */
  function applySettings(): void {
    ui.style.setProperty("--ui-scale", String(settings.uiScale));
    initSound(settings.sound);
  }
  applySettings();

  /** Mounts a full-screen overlay (matching the title screen's own look) above the live game —
   * used for the in-game ☰ menu's Settings and Save Game entries, both of which reuse the same
   * screens the title screen shows pre-game. */
  function openFullScreenOverlay(render: (close: () => void) => Node): void {
    const overlay = document.createElement("div");
    overlay.className = "title-screen";
    const close = (): void => overlay.remove();
    overlay.appendChild(render(close));
    ui.appendChild(overlay);
  }

  function openSettingsOverlay(): void {
    openFullScreenOverlay((close) =>
      renderSettingsScreen({
        onBack: close,
        onChange: (newSettings, newQuickBuild) => {
          settings = newSettings;
          quickBuild = newQuickBuild;
          quickBuildToggle.classList.toggle("active", newQuickBuild);
          applySettings();
        },
      }),
    );
  }

  function openSaveScreen(): void {
    openFullScreenOverlay((close) => renderSaveLoadScreen({ mode: "save", onBack: close, state }));
  }

  const fps = new FpsCounter();

  /** One in-game hour of simulation — shared by the real-time game loop and the `runDays` debug
   * hook (SPEC/PLAN Phase 6 e2e tests drive the sim directly instead of waiting on wall-clock). */
  function tickOnce(): void {
    const tickStart = performance.now();
    advanceOneHour(state);
    fps.sampleTickDuration(performance.now() - tickStart);

    // SPEC §13: autosave monthly (rotating 3 slots). Fire-and-forget — a failed autosave (e.g.
    // IndexedDB unavailable in a private-browsing context) shouldn't interrupt play.
    if (isMonthBoundary(state.ticks)) {
      void autosave(state).catch(() => {});
    }

    if (state.pendingDeliveries.length > 0) {
      const now = performance.now();
      for (const delivery of state.pendingDeliveries) {
        const station = state.stations.find((s) => s.id === delivery.stationId);
        if (!station) continue;
        floatingLabels.push({
          stationTile: station.tile,
          text: `+${formatMoney(delivery.revenue)}`,
          color: CARGO[delivery.cargoType].color,
          startMs: now,
        });
      }
      playSound("cashDing");
      state.pendingDeliveries.length = 0;
    }

    if (state.pendingNews.length > 0) {
      for (const item of state.pendingNews) {
        showToast(ui, formatNewsItem(state, item), "warn");
      }
      state.pendingNews.length = 0;
      newsButton.refreshBadge(state);
    }

    if (state.pendingGoalCelebrations.length > 0 && !isPanelOpen()) {
      const goal = state.pendingGoalCelebrations.shift();
      if (goal) openGoalCelebration(ui, state, goal);
    }

    if (isYearBoundary(state.ticks) && !isPanelOpen()) {
      openYearlyReport(ui, state);
    }
  }

  const loop = new GameLoop({
    tick: (_dt) => {
      tickOnce();
    },
    render: (alpha) => {
      const now = performance.now();
      fps.sample(now);
      cameraInput.update(loop.lastFrameDeltaMs);

      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, viewportW, viewportH);

      if (state.mapContentVersion !== lastMapContentVersion) {
        lastMapContentVersion = state.mapContentVersion;
        terrainRenderer.refreshContent();
      }

      const renderStart = performance.now();
      terrainRenderer.draw(ctx, camera, viewportW, viewportH, now);
      trackRenderer.draw(ctx, camera, viewportW, viewportH);
      if (settings.grid) {
        drawGridOverlay(ctx, camera, viewportW, viewportH, state.map.width, state.map.height);
      }
      if (overlayState.trackType) {
        drawTrackTypeOverlay(ctx, camera, viewportW, viewportH, state.map.width, state.trackGraph);
      }
      if (overlayState.catchments) {
        drawCatchmentsOverlay(ctx, camera, viewportW, viewportH, state.map, state.stations);
      }
      if (overlayState.cargoHeatmap) {
        drawCargoHeatmapOverlay(
          ctx,
          camera,
          viewportW,
          viewportH,
          state.map,
          state.stations,
          state.stationEconomy,
          overlayState.heatmapCargo,
        );
      }
      drawStations(ctx, camera, viewportW, viewportH, state.map.width, state.stations);
      if (overlayState.trainProfit) {
        drawTrainProfitOverlay(ctx, camera, viewportW, viewportH, state.trains, state.ticks);
      }
      drawTrains(
        ctx,
        camera,
        viewportW,
        viewportH,
        state.map.width,
        state.trackGraph,
        state.trains,
        alpha,
        now,
      );
      if (ghost) drawBuildPreview(ctx, camera, viewportW, viewportH, state.map.width, ghost);
      if (stationPreview) {
        drawStationCatchment(ctx, camera, viewportW, viewportH, state.map.width, stationPreview);
      }

      // Floating bottom-right buttons hide entirely while a panel is open (Phase 8 review carry-
      // over — they'd otherwise render on top of/through the panel); labels near them or near the
      // mini-map skip drawing rather than rendering underneath (same review, the station-label/
      // News-button overlap).
      const panelOpen = isPanelOpen();
      for (const el of [newsButton.root, trainListButton, quickBuildToggle, goalsButton]) {
        el.classList.toggle("floating-hidden", panelOpen);
      }
      const reserved: ReservedScreenRect[] = [];
      if (!panelOpen) {
        for (const el of [newsButton.root, trainListButton, quickBuildToggle, goalsButton]) {
          const r = el.getBoundingClientRect();
          reserved.push({ x0: r.left, y0: r.top, x1: r.right, y1: r.bottom });
        }
      }
      if (overlayState.miniMap) {
        const r = miniMapRenderer.screenRect(viewportH);
        reserved.push({ x0: r.x, y0: r.y, x1: r.x + r.width, y1: r.y + r.height });
      }

      drawCityLabels(ctx, camera, viewportW, viewportH, state.cities, state.map.width, reserved);
      drawStationLabels(
        ctx,
        camera,
        viewportW,
        viewportH,
        state.map.width,
        state.stations,
        state.cities,
        (tile) => state.map.cityId[tile] ?? -1,
        reserved,
      );
      if (floatingLabels.length > 0) {
        floatingLabels = floatingLabels.filter((l) => !isLabelExpired(l, now));
        drawDeliveryLabels(ctx, camera, viewportW, viewportH, state.map.width, floatingLabels, now);
      }
      if (overlayState.miniMap) {
        miniMapRenderer.draw(
          ctx,
          camera,
          viewportW,
          viewportH,
          state.trackGraph,
          state.stations,
          state.cities,
          state.trackVersion,
          state.mapContentVersion,
        );
      }
      fps.sampleRenderDuration(performance.now() - renderStart);

      const calendar = calendarFromTicks(state.startYear, state.ticks);
      topBar.update(calendar, state.cash);

      if (DEBUG && debugOverlay) {
        debugOverlay.textContent =
          `fps ${fps.fps.toFixed(1)}  frame ${fps.avgFrameMs.toFixed(2)}ms  render ${fps.avgRenderMs.toFixed(2)}ms\n` +
          `ticks ${state.ticks}  zoom ${camera.zoom.toFixed(2)}  cash ${Math.round(state.cash)}`;
      }
    },
  });

  const topBar = createTopBar(ui, {
    onSetSpeed: (speed: GameSpeed) => loop.setSpeed(speed),
    getSpeed: () => loop.getSpeed(),
    onOpenFinance: () => openFinancePanel(ui, state),
    onOpenMenu: () =>
      openMenuPanel(ui, {
        getOverlayState: () => overlayState,
        onToggle: (key: OverlayToggle) => {
          overlayState = { ...overlayState, [key]: !overlayState[key] };
        },
        onSetHeatmapCargo: (cargo) => {
          overlayState = { ...overlayState, heatmapCargo: cargo };
        },
        onSaveGame: () => openSaveScreen(),
        onOpenSettings: () => openSettingsOverlay(),
      }),
  });
  const toolbar = createToolbar(ui, (tool) => setTool(tool));
  const quickBuildToggle = createQuickBuildToggle(ui, (enabled) => {
    quickBuild = enabled;
  });
  const trainListButton = createTrainListButton(ui, () => {
    openTrainListPanel(ui, state, (trainId) => {
      const train = state.trains.find((t) => t.id === trainId);
      if (train) {
        camera.x = train.renderToX * TILE_SIZE;
        camera.y = train.renderToY * TILE_SIZE;
      }
    });
  });
  const newsButton = createNewsButton(ui, () => {
    openNewsPanel(ui, state);
    newsButton.refreshBadge(state);
  });
  const goalsButton = createGoalsButton(ui, () => openGoalsPanel(ui, state));

  loop.start();
  initBackButton();

  // Autosave on app pause (SPEC §13), both the Capacitor native-app event and the web/PWA
  // equivalent — whichever fires first wins, the other is a harmless duplicate write to the same
  // rotating slot. Skipped under `?debug=1` so e2e tests never touch IndexedDB unexpectedly.
  if (!DEBUG) {
    App.addListener("pause", () => {
      void autosave(state).catch(() => {});
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) void autosave(state).catch(() => {});
    });
  }

  // Title/New Game screen (PLAN Phase 10/11): skipped under `?debug=1` so the game stays
  // immediately interactive for every existing e2e test and debug tool, which all assume that.
  if (!DEBUG) {
    openTitleScreen(ui, {
      onStart: (options) => regenerate(options),
      onLoad: (loaded) => loadGame(loaded),
    });
  }

  let debugOverlay: HTMLDivElement | null = null;

  if (DEBUG) {
    debugOverlay = document.createElement("div");
    debugOverlay.id = "debug-overlay";
    ui.appendChild(debugOverlay);

    createDebugControls(ui, {
      onRegenerate: (seed, size: MapSizeName) => {
        const base: RandomNewGameOptions = currentOptions.region
          ? { seed, size, waterLevel: "normal", roughness: "normal" }
          : { ...currentOptions, seed, size };
        regenerate(base);
      },
    });

    (
      window as unknown as {
        __game: {
          getState: () => GameState;
          getMap: () => GameState["map"];
          getTicks: () => number;
          getCalendar: () => ReturnType<typeof calendarFromTicks>;
          getCities: () => GameState["cities"];
          getIndustries: () => GameState["industries"];
          getCityWorldCenter: (cityId: number) => { x: number; y: number } | null;
          setSpeed: (speed: GameSpeed) => void;
          getSpeed: () => GameSpeed;
          getAvgFrameMs: () => number;
          getAvgRenderMs: () => number;
          getAvgTickMs: () => number;
          findRiverMouth: () => { x: number; y: number } | null;
          regenerate: (options: {
            seed: number;
            size?: MapSizeName;
            waterLevel?: WaterLevel;
            roughness?: Roughness;
            startYear?: number;
            region?: RegionId;
            difficulty?: Difficulty;
          }) => void;
          camera: {
            getZoom: () => number;
            setZoom: (zoom: number) => void;
            pan: (dxScreen: number, dyScreen: number) => void;
            setCenter: (worldX: number, worldY: number) => void;
            getCenter: () => { x: number; y: number };
          };
          getCash: () => number;
          getTrackEdges: () => Array<{
            a: number;
            b: number;
            double: boolean;
            electrified: boolean;
            bridge: string | null;
            cost: number;
          }>;
          tileScreenPoint: (x: number, y: number) => { x: number; y: number };
          setQuickBuild: (enabled: boolean) => void;
          getStations: () => Array<{
            id: number;
            tile: number;
            x: number;
            y: number;
            type: string;
            name: string;
            hasEngineShed: boolean;
            hasWaterTower: boolean;
            improvements: string[];
          }>;
          getStationEconomy: (stationId: number) => {
            supply: Partial<Record<string, number>>;
            acceptPoints: Partial<Record<string, number>>;
            accepts: string[];
          } | null;
          runDays: (n: number) => void;
          buildTrackPath: (path: number[]) => { ok: boolean; reason?: string };
          electrifyTrackPath: (path: number[]) => { ok: boolean; reason?: string };
          buildStation: (tile: number, type: StationType) => { ok: boolean; reason?: string };
          buyTrain: (
            stationId: number,
            locoModelId: string,
            cars: CargoType[],
          ) => { ok: boolean; reason?: string; trainId?: number };
          setOrders: (trainId: number, orders: TrainOrder[]) => { ok: boolean; reason?: string };
          sellTrain: (trainId: number) => { ok: boolean; reason?: string };
          getTrains: () => Array<{
            id: number;
            name: string;
            locoModelId: string;
            status: string;
            tile: number;
            x: number;
            y: number;
            speed: number;
            cars: string[];
            orders: Array<{ stationId: number; rule: string }>;
            currentOrderIndex: number;
          }>;
          getTrainCars: (trainId: number) => Array<{ cargoType: CargoType; loaded: boolean }>;
          getStationCargo: (
            stationId: number,
          ) => Partial<Record<string, { amount: number; waitingDays: number }>> | null;
          getFinance: () => GameState["finance"];
          takeLoan: (amount: number) => { ok: boolean; reason?: string };
          repayLoan: (amount: number) => { ok: boolean; reason?: string };
          /** Test-only: injects a raw-producer/port industry directly (bypassing map-gen
           * placement) so e2e specs can set up a deterministic supply chain without hunting for
           * real industries near buildable track on a given seed. */
          debugPlaceIndustry: (tile: number, type: IndustryType) => number;
          /** Test-only: injects a city directly, same rationale as `debugPlaceIndustry`. */
          debugPlaceCity: (tiles: number[], population: number) => number;
          /** Test-only: sets cash directly, so e2e specs can trigger a netWorth-style goal without
           * simulating real revenue. */
          debugSetCash: (amount: number) => void;
          /** Test-only (Phase 12 perf/memory stress specs): builds a deterministic grid track
           * network directly, bypassing normal build validation — see the implementation below. */
          debugBuildStressNetwork: (options: {
            lines?: number;
            doubleEvery?: number;
            stationSpacing?: number;
          }) => { edges: number; stations: number; stationIds: number[] };
          /** Test-only: buys+orders `count` trains shuttling between adjacent stress-network
           * stations, via the real buyTrain/setOrders commands. */
          debugSpawnStressTrains: (count: number) => { spawned: number; failed: number };
          getFloatingLabels: () => Array<{ stationTile: number; text: string; color: string }>;
          buildImprovement: (
            stationId: number,
            type: StationImprovementType,
          ) => { ok: boolean; reason?: string };
          civicInvestment: (cityId: number) => { ok: boolean; reason?: string };
          getCityGrowth: (cityId: number) => {
            points: number;
            monthlyScore: number;
            lastServed: boolean;
            lastCivicInvestmentTick: number | undefined;
          } | null;
          getOverlayState: () => OverlayState;
          setOverlay: (key: OverlayToggle, enabled: boolean) => void;
          setHeatmapCargo: (cargo: CargoType) => void;
          getMiniMapRect: () => { x: number; y: number; width: number; height: number };
          tapMiniMap: (x: number, y: number) => void;
          /** Test-only (Phase 12 memory-bounds spec): current chunk-cache sizes, bounded by
           * TERRAIN_CHUNK_CACHE_MAX/TRACK_CHUNK_CACHE_MAX regardless of how much of the map the
           * camera has visited this session. */
          getChunkCacheStats: () => { terrainChunks: number; trackChunks: number };
          getFloatingLabelCount: () => number;
          getNewsCount: () => number;
          getNetWorthHistoryCount: () => number;
          /** Test-only (Phase 12 error-boundary spec): fires the same uncaught-exception/
           * unhandled-rejection path a real crash would, without actually corrupting anything. */
          debugThrow: (kind: "sync" | "async") => void;
        };
      }
    ).__game = {
      getState: () => state,
      getMap: () => state.map,
      getTicks: () => state.ticks,
      getCalendar: () => calendarFromTicks(state.startYear, state.ticks),
      getCities: () => state.cities,
      getIndustries: () => state.industries,
      getCityWorldCenter: (cityId) => {
        const city = state.cities[cityId];
        return city ? cityWorldCenter(city, state.map.width) : null;
      },
      setSpeed: (speed) => loop.setSpeed(speed),
      getSpeed: () => loop.getSpeed(),
      getAvgFrameMs: () => fps.avgFrameMs,
      getAvgRenderMs: () => fps.avgRenderMs,
      getAvgTickMs: () => fps.avgTickMs,
      findRiverMouth,
      regenerate: (options) => {
        if (options.region) {
          regenerate({
            seed: options.seed,
            region: options.region,
            ...(options.startYear !== undefined ? { startYear: options.startYear } : {}),
            ...(options.difficulty !== undefined ? { difficulty: options.difficulty } : {}),
          });
          return;
        }
        const base: RandomNewGameOptions = currentOptions.region
          ? { seed: options.seed, size: "medium", waterLevel: "normal", roughness: "normal" }
          : { ...currentOptions, ...options, region: undefined };
        regenerate(base);
      },
      camera: {
        getZoom: () => camera.zoom,
        setZoom: (zoom) => {
          camera.zoomAt(
            window.innerWidth / 2,
            window.innerHeight / 2,
            zoom / camera.zoom,
            window.innerWidth,
            window.innerHeight,
          );
        },
        pan: (dxScreen, dyScreen) => camera.pan(dxScreen, dyScreen),
        getCenter: () => ({ x: camera.x, y: camera.y }),
        setCenter: (worldX, worldY) => {
          camera.x = worldX;
          camera.y = worldY;
        },
      },
      getCash: () => state.cash,
      getTrackEdges: () =>
        state.trackGraph.allEdges().map((e) => ({
          a: e.a,
          b: e.b,
          double: e.double,
          electrified: e.electrified,
          bridge: e.bridge,
          cost: e.cost,
        })),
      tileScreenPoint: (x, y) => {
        const world = { x: (x + 0.5) * TILE_SIZE, y: (y + 0.5) * TILE_SIZE };
        return camera.worldToScreen(world.x, world.y, window.innerWidth, window.innerHeight);
      },
      setQuickBuild: (enabled) => {
        quickBuild = enabled;
      },
      getStations: () =>
        state.stations.map((s) => ({
          id: s.id,
          tile: s.tile,
          x: s.tile % state.map.width,
          y: Math.floor(s.tile / state.map.width),
          type: s.type,
          name: s.name,
          hasEngineShed: s.hasEngineShed,
          hasWaterTower: s.hasWaterTower,
          improvements: [...s.improvements],
        })),
      getStationEconomy: (stationId) => state.stationEconomy.get(stationId) ?? null,
      runDays: (n) => {
        const ticks = Math.round(n * 24);
        for (let i = 0; i < ticks; i++) tickOnce();
      },
      buildTrackPath: (path) => {
        const result = buildTrack(state, path);
        if (result.ok) invalidateAlongPath(path);
        return result.ok ? { ok: true } : { ok: false, reason: result.reason };
      },
      electrifyTrackPath: (path) => {
        const result = electrifyTrack(state, path);
        if (result.ok) invalidateAlongPath(path);
        return result.ok ? { ok: true } : { ok: false, reason: result.reason };
      },
      buildStation: (tile, type) => {
        const result = buildStation(state, tile, type);
        return result.ok ? { ok: true } : { ok: false, reason: result.reason };
      },
      buyTrain: (stationId, locoModelId, cars) => {
        const before = state.trains.length;
        const result = buyTrain(state, stationId, locoModelId, cars);
        if (!result.ok) return { ok: false, reason: result.reason };
        const created =
          state.trains.length > before ? state.trains[state.trains.length - 1] : undefined;
        return created ? { ok: true, trainId: created.id } : { ok: true };
      },
      setOrders: (trainId, orders) => {
        const result = setOrders(state, trainId, orders);
        return result.ok ? { ok: true } : { ok: false, reason: result.reason };
      },
      sellTrain: (trainId) => {
        const result = sellTrain(state, trainId);
        return result.ok ? { ok: true } : { ok: false, reason: result.reason };
      },
      getTrains: () =>
        state.trains.map((t) => {
          const tile = t.route[t.routeIndex] as number;
          return {
            id: t.id,
            name: t.name,
            locoModelId: t.locoModelId,
            status: t.status,
            tile,
            x: tile % state.map.width,
            y: Math.floor(tile / state.map.width),
            speed: t.speed,
            cars: t.cars.map((c) => c.cargoType),
            orders: t.orders.map((o) => ({ stationId: o.stationId, rule: o.rule })),
            currentOrderIndex: t.currentOrderIndex,
          };
        }),
      getTrainCars: (trainId) =>
        (state.trains.find((t) => t.id === trainId)?.cars ?? []).map((c) => ({
          cargoType: c.cargoType,
          loaded: c.loaded,
        })),
      getStationCargo: (stationId) => {
        const pile = state.stationCargo.get(stationId);
        if (!pile) return null;
        const result: Partial<Record<string, { amount: number; waitingDays: number }>> = {};
        for (const [cargo, entry] of Object.entries(pile)) {
          if (entry) result[cargo] = { amount: entry.amount, waitingDays: entry.waitingDays };
        }
        return result;
      },
      getFinance: () => state.finance,
      takeLoan: (amount) => {
        const result = takeLoan(state, amount);
        return result.ok ? { ok: true } : { ok: false, reason: result.reason };
      },
      repayLoan: (amount) => {
        const result = repayLoan(state, amount);
        return result.ok ? { ok: true } : { ok: false, reason: result.reason };
      },
      debugPlaceIndustry: (tile, type) => {
        const id =
          state.industries.length > 0 ? Math.max(...state.industries.map((i) => i.id)) + 1 : 0;
        state.map.industryId[tile] = id;
        state.industries.push({
          id,
          type,
          x: tile % state.map.width,
          y: Math.floor(tile / state.map.width),
        });
        const def = INDUSTRIES[type];
        const isRaw = Object.keys(def.consumes).length === 0;
        state.industryEconomy.set(id, {
          inputStock: {},
          monthlyOutput: isRaw ? { ...def.produces } : {},
        });
        refreshStationEconomy(state);
        state.mapContentVersion++; // this industry needs to be baked into the terrain chunk cache
        return id;
      },
      debugPlaceCity: (tiles, population) => {
        const id = state.cities.length;
        const anchor = tiles[0] as number;
        const city: City = {
          id,
          name: `Test City ${id}`,
          tier: "city",
          population,
          anchorX: anchor % state.map.width,
          anchorY: Math.floor(anchor / state.map.width),
          tiles: [...tiles],
          coastal: false,
        };
        for (const t of tiles) state.map.cityId[t] = id;
        state.cities.push(city);
        refreshStationEconomy(state);
        state.mapContentVersion++; // this city needs to be baked into the terrain chunk cache
        return id;
      },
      debugSetCash: (amount: number) => {
        state.cash = amount;
      },
      // Phase 12 stress-test scaffolding: builds a deterministic grid network directly on the
      // track graph (bypassing sim/commands.ts's cost/terrain/turn validation, same precedent as
      // debugPlaceIndustry/debugPlaceCity above) so the perf e2e spec gets an exact, stable edge
      // count regardless of the procedurally-generated terrain underneath — real terrain (water,
      // mountains, rivers) would make ~1,500 buildable edges non-deterministic across map seeds.
      debugBuildStressNetwork: (options) => {
        const width = state.map.width;
        const height = state.map.height;
        const lines = options.lines ?? 5;
        const doubleEvery = options.doubleEvery ?? 2;
        const stationSpacing = options.stationSpacing ?? 24;
        const tileAt = (x: number, y: number) => y * width + x;

        const xs = Array.from({ length: lines }, (_, i) =>
          Math.round(((i + 1) * width) / (lines + 1)),
        );
        const ys = Array.from({ length: lines }, (_, i) =>
          Math.round(((i + 1) * height) / (lines + 1)),
        );

        let edgesAdded = 0;
        const addEdge = (a: number, b: number, double: boolean) => {
          if (state.trackGraph.hasEdge(a, b)) return;
          const ax = a % width;
          const ay = Math.floor(a / width);
          const bx = b % width;
          const by = Math.floor(b / width);
          state.trackGraph.addEdge({
            a,
            b,
            direction: directionIndex(Math.sign(bx - ax), Math.sign(by - ay)),
            double,
            electrified: false,
            bridge: null,
            bridgeSpan: [],
            cost: 0,
          });
          edgesAdded++;
        };

        ys.forEach((y, i) => {
          const double = i % doubleEvery === 0;
          for (let x = 0; x < width - 1; x++) addEdge(tileAt(x, y), tileAt(x + 1, y), double);
        });
        xs.forEach((x, i) => {
          const double = i % doubleEvery === 0;
          for (let y = 0; y < height - 1; y++) addEdge(tileAt(x, y), tileAt(x, y + 1), double);
        });

        const stationIds: number[] = [];
        ys.forEach((y) => {
          for (let x = stationSpacing; x < width - stationSpacing; x += stationSpacing) {
            if (xs.some((vx) => Math.abs(vx - x) < 2)) continue; // keep off junction tiles
            const tile = tileAt(x, y);
            const id = state.nextStationId++;
            const station: Station = {
              id,
              tile,
              type: "station",
              name: `Stress ${id}`,
              hasEngineShed: true,
              hasWaterTower: false,
              improvements: [],
            };
            state.stations.push(station);
            stationIds.push(id);
          }
        });

        if (edgesAdded > 0 || stationIds.length > 0) state.trackVersion++;
        refreshStationEconomy(state);
        return { edges: edgesAdded, stations: stationIds.length, stationIds };
      },
      debugSpawnStressTrains: (count) => {
        // Pairs of adjacent stress stations (built by debugBuildStressNetwork, in x order along
        // each line) become a train's looping 2-stop order — real buyTrain/setOrders commands, so
        // this exercises normal purchase/routing validation, just driven in bulk.
        const byLine = new Map<number, Station[]>();
        for (const s of state.stations) {
          const y = Math.floor(s.tile / state.map.width);
          const list = byLine.get(y) ?? [];
          list.push(s);
          byLine.set(y, list);
        }
        const pairs: Array<[Station, Station]> = [];
        for (const list of byLine.values()) {
          list.sort((a, b) => a.tile - b.tile);
          for (let i = 0; i < list.length - 1; i++) {
            pairs.push([list[i] as Station, list[i + 1] as Station]);
          }
        }
        let spawned = 0;
        let failed = 0;
        for (let i = 0; i < count; i++) {
          const pair = pairs[i % pairs.length];
          if (!pair) {
            failed++;
            continue;
          }
          const [from, to] = pair;
          const result = buyTrain(state, from.id, "grasshopper-0-4-0", ["passengers"]);
          if (!result.ok) {
            failed++;
            continue;
          }
          const train = state.trains[state.trains.length - 1] as (typeof state.trains)[number];
          const orderResult = setOrders(state, train.id, [
            { stationId: from.id, rule: "auto" },
            { stationId: to.id, rule: "auto" },
          ]);
          if (orderResult.ok) spawned++;
          else failed++;
        }
        return { spawned, failed };
      },
      getFloatingLabels: () =>
        floatingLabels.map((l) => ({ stationTile: l.stationTile, text: l.text, color: l.color })),
      buildImprovement: (stationId, type) => {
        const result = buildImprovement(state, stationId, type);
        return result.ok ? { ok: true } : { ok: false, reason: result.reason };
      },
      civicInvestment: (cityId) => {
        const result = civicInvestment(state, cityId);
        return result.ok ? { ok: true } : { ok: false, reason: result.reason };
      },
      getCityGrowth: (cityId) => {
        const growth = state.cityGrowth.get(cityId);
        return growth
          ? {
              points: growth.points,
              monthlyScore: growth.monthlyScore,
              lastServed: growth.lastServed ?? false,
              lastCivicInvestmentTick: growth.lastCivicInvestmentTick,
            }
          : null;
      },
      getOverlayState: () => overlayState,
      setOverlay: (key, enabled) => {
        overlayState = { ...overlayState, [key]: enabled };
      },
      setHeatmapCargo: (cargo) => {
        overlayState = { ...overlayState, heatmapCargo: cargo };
      },
      getMiniMapRect: () => miniMapRenderer.screenRect(window.innerHeight),
      tapMiniMap: (x, y) => handleTap(x, y),
      getChunkCacheStats: () => ({
        terrainChunks: terrainRenderer.cacheSize,
        trackChunks: trackRenderer.cacheSize,
      }),
      getFloatingLabelCount: () => floatingLabels.length,
      getNewsCount: () => state.news.length,
      getNetWorthHistoryCount: () => state.finance.netWorthHistory.length,
      debugThrow: (kind) => debugTriggerCrash(kind),
    };
  }
}

main();
