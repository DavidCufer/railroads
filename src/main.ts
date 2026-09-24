import { GameLoop, type GameSpeed } from "./render/loop";
import { FpsCounter } from "./render/fps";
import { Camera, TILE_SIZE } from "./render/camera";
import { TerrainRenderer } from "./render/terrain";
import { TrackRenderer } from "./render/track";
import { drawBuildPreview, type BuildMode, type GhostPreview } from "./render/buildPreview";
import { drawCityLabels, cityWorldCenter } from "./render/labels";
import { drawStations, drawStationLabels } from "./render/stations";
import { drawStationCatchment, type StationCatchmentPreview } from "./render/stationPreview";
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
  hideConfirmBar,
  hideDragCostLabel,
  showConfirmBar,
  showDragCostLabel,
} from "./ui/buildHud";
import { createGameState, type GameState, type NewGameOptions } from "./sim/state";
import {
  buildTrack,
  bulldoze,
  computeBuildPlan,
  computeBulldozePlan,
  computeUpgradePlan,
  upgradeTrack,
  type BuildPlan,
  type BulldozePlan,
  type UpgradePlan,
} from "./sim/commands";
import { findBuildPath } from "./sim/track/pathfind";
import { spanTilesBetween, validBridgeTypes } from "./sim/track/cost";
import { canPlaceStationAt, stationAtTile, stationCatchmentTiles } from "./sim/stations";
import { terrainId } from "./sim/map/terrain";
import { inBounds, tileIndex } from "./sim/map/grid";
import { calendarFromTicks } from "./sim/time";
import type { MapSizeName, Roughness, WaterLevel } from "./data/mapGen";
import type { BridgeType } from "./data/track";
import { STATION_TYPE_DEFS } from "./data/stations";

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
  plan: BuildPlan | UpgradePlan | BulldozePlan;
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
  const camera = new Camera(state.map.width, state.map.height);
  const terrainRenderer = new TerrainRenderer(state.map, state.cities, state.industries);
  const trackRenderer = new TrackRenderer(state.map.width, state.map.height, state.trackGraph);
  const cameraInput = new CameraInput(canvas, camera, () => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  let currentTool: ToolId = "info";
  let quickBuild = false;
  let dragState: DragState | null = null;
  let ghost: GhostPreview | null = null;
  let stationPreview: StationCatchmentPreview | null = null;
  let stationPlacementOpen = false;

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

  function regenerate(options: NewGameOptions): void {
    currentOptions = options;
    state = createGameState(options);
    camera.setMapSize(state.map.width, state.map.height);
    terrainRenderer.setMap(state.map, state.cities, state.industries);
    trackRenderer.setMap(state.map.width, state.map.height, state.trackGraph);
    dragState = null;
    ghost = null;
    hideConfirmBar();
    hideDragCostLabel();
    setTool("info");
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

  function handleTap(canvasX: number, canvasY: number): void {
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const world = camera.screenToWorld(canvasX, canvasY, viewportW, viewportH);
    const tileX = Math.floor(world.x / TILE_SIZE);
    const tileY = Math.floor(world.y / TILE_SIZE);
    if (!inBounds(state.map, tileX, tileY)) return;
    const idx = tileIndex(state.map, tileX, tileY);

    // An existing station is manageable from either Info or Station mode.
    const station = stationAtTile(state.stations, idx);
    if (station) {
      openStationPanel(ui, state, station.id);
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
      const calendar = calendarFromTicks(state.startYear, state.ticks);
      openCityPanel(ui, state.cities[cityId], calendar.year);
    } else if (industryIdx >= 0 && state.industries[industryIdx]) {
      openIndustryPanel(ui, state.industries[industryIdx]);
    }
  }
  cameraInput.setOnTap(handleTap);

  // --- Build mode drag handling (SPEC §5.2) ---------------------------------------------------

  function planFor(
    mode: BuildMode,
    path: number[],
  ): { plan: BuildPlan | UpgradePlan | BulldozePlan; cost: number; ok: boolean } {
    if (mode === "track") {
      const plan = computeBuildPlan(state, path, dragState?.bridgeOverride ?? undefined);
      return { plan, cost: plan.cost, ok: plan.valid };
    }
    if (mode === "double") {
      const plan = computeUpgradePlan(state, path);
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
    // Track/Double/Bulldoze are drag-to-build; Station and Info are tap-driven (SPEC §6.1's
    // placement flow is a tap + panel, not a drag).
    const isDragBuildMode = tool === "track" || tool === "double" || tool === "bulldoze";
    cameraInput.setBuildMode(isDragBuildMode, isDragBuildMode ? buildHandlers : null);
  }

  const fps = new FpsCounter();

  const loop = new GameLoop({
    tick: (_dt) => {
      state.ticks++;
    },
    render: (_alpha) => {
      const now = performance.now();
      fps.sample(now);
      cameraInput.update(loop.lastFrameDeltaMs);

      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, viewportW, viewportH);

      const renderStart = performance.now();
      terrainRenderer.draw(ctx, camera, viewportW, viewportH, now);
      trackRenderer.draw(ctx, camera, viewportW, viewportH);
      drawStations(ctx, camera, viewportW, viewportH, state.map.width, state.stations);
      if (ghost) drawBuildPreview(ctx, camera, viewportW, viewportH, state.map.width, ghost);
      if (stationPreview) {
        drawStationCatchment(ctx, camera, viewportW, viewportH, state.map.width, stationPreview);
      }
      drawCityLabels(ctx, camera, viewportW, viewportH, state.cities, state.map.width);
      drawStationLabels(ctx, camera, viewportW, viewportH, state.map.width, state.stations);
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
  });
  const toolbar = createToolbar(ui, (tool) => setTool(tool));
  createQuickBuildToggle(ui, (enabled) => {
    quickBuild = enabled;
  });

  loop.start();
  initBackButton();

  let debugOverlay: HTMLDivElement | null = null;

  if (DEBUG) {
    debugOverlay = document.createElement("div");
    debugOverlay.id = "debug-overlay";
    ui.appendChild(debugOverlay);

    createDebugControls(ui, {
      onRegenerate: (seed, size: MapSizeName) => {
        regenerate({ ...currentOptions, seed, size });
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
          findRiverMouth: () => { x: number; y: number } | null;
          regenerate: (options: {
            seed: number;
            size?: MapSizeName;
            waterLevel?: WaterLevel;
            roughness?: Roughness;
            startYear?: number;
          }) => void;
          camera: {
            getZoom: () => number;
            setZoom: (zoom: number) => void;
            pan: (dxScreen: number, dyScreen: number) => void;
            setCenter: (worldX: number, worldY: number) => void;
          };
          getCash: () => number;
          getTrackEdges: () => Array<{
            a: number;
            b: number;
            double: boolean;
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
          }>;
          getStationEconomy: (stationId: number) => {
            supply: Partial<Record<string, number>>;
            acceptPoints: Partial<Record<string, number>>;
            accepts: string[];
          } | null;
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
      findRiverMouth,
      regenerate: (options) => regenerate({ ...currentOptions, ...options }),
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
        })),
      getStationEconomy: (stationId) => state.stationEconomy.get(stationId) ?? null,
    };
  }
}

main();
