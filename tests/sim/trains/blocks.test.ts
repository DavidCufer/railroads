import { describe, expect, it } from "vitest";
import { TrackGraph } from "../../../src/sim/track/graph";
import { blockIdForEdge, blockOtherEnd, computeBlocks } from "../../../src/sim/trains/blocks";
import { addStraightLine, tile } from "./helpers";

const WIDTH = 20;

describe("computeBlocks", () => {
  it("a plain straight line with no stations is a single block", () => {
    const g = new TrackGraph();
    addStraightLine(g, WIDTH, 0, 5, 2);
    const stationTiles = new Set<number>();
    const { blocks } = computeBlocks(g, stationTiles);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.edges).toHaveLength(5);
  });

  it("a station tile splits the line into two blocks", () => {
    const g = new TrackGraph();
    addStraightLine(g, WIDTH, 0, 5, 2);
    const stationTile = tile(WIDTH, 2, 2);
    const { blocks, edgeToBlock } = computeBlocks(g, new Set([stationTile]));
    expect(blocks).toHaveLength(2);
    const idLeft = blockIdForEdge(
      { blocks, edgeToBlock, boundaries: new Set() },
      tile(WIDTH, 0, 2),
      tile(WIDTH, 1, 2),
    );
    const idRight = blockIdForEdge(
      { blocks, edgeToBlock, boundaries: new Set() },
      tile(WIDTH, 3, 2),
      tile(WIDTH, 4, 2),
    );
    expect(idLeft).not.toBe(idRight);
  });

  it("a junction (degree >= 3) is a boundary", () => {
    const g = new TrackGraph();
    addStraightLine(g, WIDTH, 0, 4, 2);
    // Branch off the middle of the line, making tile (2,2) a junction.
    addStraightLine(g, WIDTH, 2, 2, 2); // no-op single tile, just to be explicit
    g.addEdge({
      a: Math.min(tile(WIDTH, 2, 2), tile(WIDTH, 2, 3)),
      b: Math.max(tile(WIDTH, 2, 2), tile(WIDTH, 2, 3)),
      direction: 2,
      double: false,
      electrified: false,
      bridge: null,
      bridgeSpan: [],
      cost: 1000,
    });
    const { blocks } = computeBlocks(g, new Set());
    // 0-1-2 block, 2-3-4 block, 2-branch block: three blocks meeting at the junction.
    expect(blocks).toHaveLength(3);
  });

  it("a block counts as double only when every edge in it is double", () => {
    const g = new TrackGraph();
    addStraightLine(g, WIDTH, 0, 2, 2, { double: true });
    addStraightLine(g, WIDTH, 2, 4, 2, { double: false });
    const { blocks } = computeBlocks(g, new Set());
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.double).toBe(false);
  });

  it("a fully double-tracked block is double", () => {
    const g = new TrackGraph();
    addStraightLine(g, WIDTH, 0, 4, 2, { double: true });
    const { blocks } = computeBlocks(g, new Set());
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.double).toBe(true);
  });

  it("a dead end is a block boundary on its own", () => {
    const g = new TrackGraph();
    addStraightLine(g, WIDTH, 0, 3, 2);
    const { blocks } = computeBlocks(g, new Set());
    expect(blocks).toHaveLength(1);
    expect([blocks[0]?.nodeA, blocks[0]?.nodeB].sort()).toEqual(
      [tile(WIDTH, 0, 2), tile(WIDTH, 3, 2)].sort(),
    );
  });

  it("blockOtherEnd returns the far boundary from a given entry node", () => {
    const g = new TrackGraph();
    addStraightLine(g, WIDTH, 0, 3, 2);
    const { blocks } = computeBlocks(g, new Set());
    const block = blocks[0];
    if (!block) throw new Error("unreachable");
    expect(blockOtherEnd(block, tile(WIDTH, 0, 2))).toBe(tile(WIDTH, 3, 2));
    expect(blockOtherEnd(block, tile(WIDTH, 3, 2))).toBe(tile(WIDTH, 0, 2));
  });
});
