import { GameLoop } from "./render/loop";
import { FpsCounter } from "./render/fps";
import { Camera } from "./render/camera";
import { TerrainRenderer } from "./render/terrain";
import { CameraInput } from "./ui/cameraInput";
import { createDebugControls } from "./ui/debugControls";
import { createGameState, type GameState, type NewGameOptions } from "./sim/state";
import type { MapSizeName, Roughness, WaterLevel } from "./data/mapGen";

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
