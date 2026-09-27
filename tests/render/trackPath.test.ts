import { describe, expect, it } from "vitest";
import {
  buildEdgeGeometry,
  FILLET_RADIUS_TILES,
  FILLET_TANGENT_TILES,
  halfFillet,
  isFilletBend,
  pointOnPiece as pointOnPieceForTest,
} from "../../src/render/trackPath";

function angleOf(dx: number, dy: number): number {
  return Math.atan2(dy, dx);
}

function normalizeAngle(a: number): number {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

describe("isFilletBend", () => {
  it("is true only for the 135°-apart (steps===3) away-from-node pair", () => {
    // E(0) and SW(3) are 3 steps / 135° apart in DIRS8's 45°-step ordering.
    expect(isFilletBend(0, 3)).toBe(true);
    expect(isFilletBend(0, 5)).toBe(true); // symmetric the other way (also 3 steps)
    expect(isFilletBend(0, 4)).toBe(false); // opposite = straight through
    expect(isFilletBend(0, 1)).toBe(false); // sharp
    expect(isFilletBend(0, 2)).toBe(false); // sharp
  });
});

describe("halfFillet", () => {
  it("places both tangent points exactly FILLET_TANGENT_TILES from the node, at radius from center", () => {
    // dirThis = E (index 0), dirOther = SW (index 3): 135° apart.
    const hf = halfFillet(0, 0, 0, 3);
    const tangent = hf.sample(0);
    expect(Math.hypot(tangent.x - 0, tangent.y - 0)).toBeCloseTo(FILLET_TANGENT_TILES, 6);
    expect(Math.hypot(tangent.x - hf.center.x, tangent.y - hf.center.y)).toBeCloseTo(
      FILLET_RADIUS_TILES,
      6,
    );
  });

  it("heading at t=0 matches dirThis's straight-line direction exactly (true tangency)", () => {
    const hf = halfFillet(0, 0, 0, 3); // E
    const s = hf.sample(0);
    expect(normalizeAngle(s.angle - angleOf(1, 0))).toBeCloseTo(0, 6);
  });

  it("sweeps exactly half of the fixed 45° bend (22.5°) from tangent to midpoint", () => {
    const hf = halfFillet(0, 0, 0, 3);
    expect(Math.abs(hf.sweepToMid)).toBeCloseTo(Math.PI / 8, 10);
  });

  it("the midpoint is the same point regardless of which of the two edges computes it", () => {
    const hfA = halfFillet(1, 2, 0, 3); // node at (1,2), this edge E, other SW
    const hfB = halfFillet(1, 2, 3, 0); // same node, roles swapped
    const midA = hfA.sample(1);
    const midB = hfB.sample(1);
    expect(midA.x).toBeCloseTo(midB.x, 9);
    expect(midA.y).toBeCloseTo(midB.y, 9);
  });
});

describe("buildEdgeGeometry chaining (two real edges sharing a bend)", () => {
  const W = 20;

  it("joins with no position gap and no heading kink across the shared node", () => {
    // Edge1: (5,0) -> (6,0) [dir E=0]. Edge2 continues from (6,0) -> (7,1) [dir SE=1]. At the
    // shared node (6,0): edge1's away-from-node dir is W=4, edge2's is SE=1 -> steps(4,1)=3: a
    // valid 45° bend, so edge1 fillets at its b-end (partner dir = SE = 1) and edge2 fillets at
    // its a-end (partner dir = away-from-node-toward-edge1's-far-end = W = 4).
    const edge1 = buildEdgeGeometry(W, 5, 6, null, 1);
    const edge2 = buildEdgeGeometry(W, 6, 27 /* (7,1) */, 4, null);

    const end1 = edge1.pointAt(edge1.length);
    const start2 = edge2.pointAt(0);
    expect(end1.x).toBeCloseTo(start2.x, 9);
    expect(end1.y).toBeCloseTo(start2.y, 9);
    expect(normalizeAngle(end1.angle - start2.angle)).toBeCloseTo(0, 6);
  });
});

describe("buildEdgeGeometry", () => {
  const W = 20;

  it("with no partner at either end, is a single straight line through both tile centers", () => {
    const path = buildEdgeGeometry(W, 5, 6, null, null); // (5,0)->(6,0) if W=20... use explicit tiles
    const start = path.pointAt(0);
    const end = path.pointAt(path.length);
    expect(start.x).toBeCloseTo(5.5, 6);
    expect(start.y).toBeCloseTo(0.5, 6);
    expect(end.x).toBeCloseTo(6.5, 6);
    expect(end.y).toBeCloseTo(0.5, 6);
    expect(path.length).toBeCloseTo(1, 6);
  });

  it("trims and fillets at an end with a valid 45°-bend partner", () => {
    // Edge from tile (5,0) to (6,0) [direction E], with a partner at b=(6,0) that continues to
    // (7,1) [direction SE from b] — E and SE are 1 step apart, i.e. the OTHER edge's own
    // away-from-node direction from (6,0) is SE (index 1); away(dirBA=W=4) vs SE(1) => steps 3. Valid.
    const b = 6; // (6,0)
    const dirAway_of_next_edge = 1; // SE
    const path = buildEdgeGeometry(W, 5, b, null, dirAway_of_next_edge);
    // Path should be shorter than the full 1-tile straight distance (trimmed near b).
    expect(path.length).toBeLessThan(1);
    expect(path.length).toBeGreaterThan(1 - FILLET_TANGENT_TILES - 0.01);
    const end = path.pointAt(path.length);
    // End point should be near tile b's center, offset toward SW (since it curves away before
    // reaching it) — at minimum, not exactly at the tile center anymore.
    expect(Math.hypot(end.x - 6.5, end.y - 0.5)).toBeGreaterThan(0.01);
  });

  it("start point exactly matches tile center for a through (no-bend) edge end", () => {
    const path = buildEdgeGeometry(W, 40, 41, null, null); // arbitrary tiles, W=20 => (0,2)-(1,2)
    const start = path.pointAt(0);
    expect(start.x).toBeCloseTo(0.5, 9);
    expect(start.y).toBeCloseTo(2.5, 9);
  });
});

describe("EdgePath.offset", () => {
  it("keeps a straight edge's offset parallel at constant perpendicular distance", () => {
    const path = buildEdgeGeometry(20, 5, 6, null, null);
    const offset = path.offset(0.1);
    const p0 = path.pointAt(0.3);
    const q0 = offset.pointAt(0.3);
    expect(Math.hypot(p0.x - q0.x, p0.y - q0.y)).toBeCloseTo(0.1, 6);
  });

  it("stays a true constant-distance parallel curve through a line->arc joint", () => {
    // Compare by matching PIECE-LOCAL fraction (angle, for an arc), not raw path distance: an
    // offset arc has a slightly different arc length than the original (same as a curve's outer
    // vs. inner rail in reality), so matching by distance-traveled alone drifts on the arc piece.
    const path = buildEdgeGeometry(20, 5, 6, null, 1); // trimmed+filleted at b
    const offset = path.offset(0.05);
    expect(offset.pieces.length).toBe(path.pieces.length);
    for (let i = 0; i < path.pieces.length; i++) {
      for (const u of [0, 0.5, 1]) {
        const orig = pointOnPieceForTest(path.pieces[i] as never, u);
        const off = pointOnPieceForTest(offset.pieces[i] as never, u);
        const dist = Math.hypot(orig.x - off.x, orig.y - off.y);
        expect(dist).toBeCloseTo(0.05, 5);
      }
    }
  });
});
