import { describe, expect, it } from "vitest";
import { Camera, EDGE_MARGIN_FRACTION, TILE_SIZE } from "../../src/render/camera";

describe("Camera edge clamp", () => {
  it("never shows more than a quarter of the screen past the map edge", () => {
    const cam = new Camera(100, 100);
    cam.setViewport(800, 360);
    cam.pan(-1e6, -1e6); // drag hard toward the bottom-right
    const world = 100 * TILE_SIZE;
    const rightEdgeOnScreen = cam.worldToScreen(world, world, 800, 360);
    expect(800 - rightEdgeOnScreen.x).toBeLessThanOrEqual(800 * EDGE_MARGIN_FRACTION + 0.5);
    expect(360 - rightEdgeOnScreen.y).toBeLessThanOrEqual(360 * EDGE_MARGIN_FRACTION + 0.5);
    cam.pan(1e6, 1e6);
    const topLeft = cam.worldToScreen(0, 0, 800, 360);
    expect(topLeft.x).toBeLessThanOrEqual(800 * EDGE_MARGIN_FRACTION + 0.5);
    expect(topLeft.y).toBeLessThanOrEqual(360 * EDGE_MARGIN_FRACTION + 0.5);
  });

  it("centres a map smaller than the view", () => {
    const cam = new Camera(4, 4);
    cam.zoom = 0.25;
    cam.setViewport(800, 360);
    cam.pan(500, 500);
    expect(cam.x).toBe(2 * TILE_SIZE);
    expect(cam.y).toBe(2 * TILE_SIZE);
  });

  it("keeps the margin at any zoom", () => {
    const cam = new Camera(100, 100);
    cam.setViewport(800, 360);
    cam.zoomAt(400, 180, 2, 800, 360);
    cam.pan(-1e6, 0);
    const right = cam.worldToScreen(100 * TILE_SIZE, 0, 800, 360);
    expect(800 - right.x).toBeLessThanOrEqual(800 * EDGE_MARGIN_FRACTION + 0.5);
  });
});
