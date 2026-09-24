import { GameLoop } from "./render/loop";
import { FpsCounter } from "./render/fps";

const DEBUG = new URLSearchParams(window.location.search).has("debug");

function main(): void {
  const canvas = document.getElementById("game-canvas") as HTMLCanvasElement | null;
  if (!canvas) throw new Error("missing #game-canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas context unavailable");

  const dpr = window.devicePixelRatio || 1;
  function resize(): void {
    const canvasEl = canvas as HTMLCanvasElement;
    canvasEl.width = Math.round(window.innerWidth * dpr);
    canvasEl.height = Math.round(window.innerHeight * dpr);
  }
  resize();
  window.addEventListener("resize", resize);

  const fps = new FpsCounter();
  let elapsedTicks = 0;

  const loop = new GameLoop({
    tick: (_dt) => {
      elapsedTicks++;
    },
    render: (_alpha) => {
      fps.sample(performance.now());
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = "#274a3f";
      ctx.fillRect(0, 0, w, h);

      if (DEBUG) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "14px sans-serif";
        ctx.fillText(`fps: ${fps.fps.toFixed(1)}  ticks: ${elapsedTicks}`, 12, 20);
      }
    },
  });
  loop.start();

  if (DEBUG) {
    (window as unknown as { __game: unknown }).__game = {
      getTicks: () => elapsedTicks,
    };
  }
}

main();
