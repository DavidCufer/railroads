import { GameLoop, type GameSpeed } from "./render/loop";
import { FpsCounter } from "./render/fps";
import { Camera, TILE_SIZE } from "./render/camera";
import { TerrainRenderer } from "./render/terrain";
import { drawCityLabels, cityWorldCenter } from "./render/labels";
import { CameraInput } from "./ui/cameraInput";
import { createDebugControls } from "./ui/debugControls";
import { createTopBar } from "./ui/topBar";
import { createToolbar } from "./ui/toolbar";
import { openCityPanel, openIndustryPanel } from "./ui/infoPanels";
import { initBackButton } from "./ui/backButton";
import { createGameState, type GameState, type NewGameOptions } from "./sim/state";
import { terrainId } from "./sim/map/terrain";
import { inBounds, tileIndex } from "./sim/map/grid";
import { calendarFromTicks } from "./sim/time";
import { DIFFICULTY, DEFAULT_DIFFICULTY } from "./data/finance";
import type { MapSizeName, Roughness, WaterLevel } from "./data/mapGen";

const RIVER_ID = terrainId("river");
const WATER_ID = terrainId("water");

const DEBUG = new URLSearchParams(window.location.search).has("debug");

const DEFAULT_NEW_GAME: NewGameOptions = {
  seed: 12345,
  size: "medium",
  waterLevel: "normal",
  roughness: "normal",
};

/** Placeholder cash (SPEC §9.1) — Phase 7 wires up the real ledger. */
const PLACEHOLDER_CASH = DIFFICULTY[DEFAULT_DIFFICULTY].startingCash;

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
  const cameraInput = new CameraInput(canvas, camera, () => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  function regenerate(options: NewGameOptions): void {
    currentOptions = options;
    state = createGameState(options);
    camera.setMapSize(state.map.width, state.map.height);
    terrainRenderer.setMap(state.map, state.cities, state.industries);
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
      drawCityLabels(ctx, camera, viewportW, viewportH, state.cities, state.map.width);
      fps.sampleRenderDuration(performance.now() - renderStart);

      const calendar = calendarFromTicks(state.startYear, state.ticks);
      topBar.update(calendar, PLACEHOLDER_CASH);

      if (DEBUG) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "14px sans-serif";
        ctx.fillText(
          `fps: ${fps.fps.toFixed(1)}  frame: ${fps.avgFrameMs.toFixed(2)}ms  render: ${fps.avgRenderMs.toFixed(2)}ms  ticks: ${state.ticks}  zoom: ${camera.zoom.toFixed(2)}`,
          12,
          64,
        );
      }
    },
  });

  const topBar = createTopBar(ui, {
    onSetSpeed: (speed: GameSpeed) => loop.setSpeed(speed),
    getSpeed: () => loop.getSpeed(),
  });
  createToolbar(ui);

  loop.start();
  initBackButton();

  if (DEBUG) {
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
          }) => void;
          camera: {
            getZoom: () => number;
            setZoom: (zoom: number) => void;
            pan: (dxScreen: number, dyScreen: number) => void;
            setCenter: (worldX: number, worldY: number) => void;
          };
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
    };
  }
}

main();
