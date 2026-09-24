import { GameLoop } from "./render/loop";
import { FpsCounter } from "./render/fps";
import { Camera } from "./render/camera";
import { TerrainRenderer } from "./render/terrain";
import { CameraInput } from "./ui/cameraInput";
import { createDebugControls } from "./ui/debugControls";
import { initBackButton } from "./ui/backButton";
import { createGameState, type GameState, type NewGameOptions } from "./sim/state";
import { terrainId } from "./sim/map/terrain";
import { TILE_SIZE } from "./render/camera";
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

function main(): void {
  const canvas = document.getElementById("game-canvas") as HTMLCanvasElement | null;
  if (!canvas) throw new Error("missing #game-canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas context unavailable");
  const ui = document.getElementById("ui");
  if (!ui) throw new Error("missing #ui");

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
  const terrainRenderer = new TerrainRenderer(state.map);
  const cameraInput = new CameraInput(canvas, camera, () => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  function regenerate(options: NewGameOptions): void {
    currentOptions = options;
    state = createGameState(options);
    camera.setMapSize(state.map.width, state.map.height);
    terrainRenderer.setMap(state.map);
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

  const fps = new FpsCounter();
  let elapsedTicks = 0;

  const loop = new GameLoop({
    tick: (_dt) => {
      elapsedTicks++;
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
      fps.sampleRenderDuration(performance.now() - renderStart);

      if (DEBUG) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "14px sans-serif";
        ctx.fillText(
          `fps: ${fps.fps.toFixed(1)}  frame: ${fps.avgFrameMs.toFixed(2)}ms  render: ${fps.avgRenderMs.toFixed(2)}ms  ticks: ${elapsedTicks}  zoom: ${camera.zoom.toFixed(2)}`,
          12,
          20,
        );
      }
    },
  });
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
      getTicks: () => elapsedTicks,
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
