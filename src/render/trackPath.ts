/**
 * Shared render-side path geometry (STYLE §7): turns the track graph's straight tile-to-tile
 * edges into a smoothly curved centerline — a circular fillet arc at every node where the path
 * bends 45°, radius ≈ 1.2 tiles, tangent to both straight segments. Both the track renderer
 * (`track.ts`) and the train renderer (`trains.ts`) sample the same geometry here, so rails and
 * consists always agree. This is render-only: sim movement/routing is untouched, and units here
 * are tiles (1 tile = 1 unit) — callers scale to pixels or world units.
 *
 * The turn rule (`src/sim/track/turn.ts`) only ever allows a train through a node at 0° or 45°;
 * sharper geometry is buildable but flagged with the existing red "not traversable" marker and is
 * deliberately left as a plain pointed corner here — there is nothing to smooth for a bend a train
 * can never actually take.
 *
 * Geometric note: consider two edges meeting at a node, each described by its own "away from the
 * node" direction (the compass direction from the node toward that edge's far end). A straight
 * through-route has those two directions exactly opposite (`directionSteps === 4`); the turn rule's
 * only other traversable case is a 45° bend, which — worked through the direction algebra — is
 * exactly the case where the two "away" directions are 135° apart (`directionSteps === 3`). Every
 * fillet this module draws is therefore the *same* shape (a fixed 135° interior angle, so a fixed
 * tangent length for a given radius), just translated and rotated per node.
 */
import { DIRS8 } from "../sim/map/grid";
import { directionSteps } from "../sim/track/graph";

/** STYLE §7: "radius ≈ 1.2 tiles (clamped so arcs don't overlap on short segments)". Every track
 * edge in this game is at least 1 tile long (√2 if diagonal), and the tangent length this implies
 * (~0.5 tiles, see below) leaves comfortable room on any real edge, so no extra clamping is done. */
export const FILLET_RADIUS_TILES = 1.2;

/** Every fillet bends exactly 45° (see module doc), so the interior angle between the two "away
 * from node" rays is always 180° − 45° = 135°, and every fillet has the same tangent length for a
 * given radius. */
const INTERIOR_ANGLE = (Math.PI * 3) / 4;
const HALF_INTERIOR = INTERIOR_ANGLE / 2;

/** Distance from a node to each tangent point, along the corresponding "away from node" ray. */
export const FILLET_TANGENT_TILES = FILLET_RADIUS_TILES / Math.tan(HALF_INTERIOR);

export interface Point {
  x: number;
  y: number;
}

export interface PathSample extends Point {
  /** Heading in radians, screen convention (+x right, +y down), pointing in the direction of
   * travel along the path (from the piece's start toward its end). */
  angle: number;
}

function unitDir(dir: number): Point {
  const [dx, dy] = DIRS8[dir] as readonly [number, number];
  const len = Math.hypot(dx, dy);
  return { x: dx / len, y: dy / len };
}

/** True if two "away from node" directions form the one bend angle (45°, `directionSteps === 3`)
 * the turn rule allows a train through — as opposed to a straight through-pair (`=== 4`) or a
 * sharp, non-traversable junction (`<= 2`, already flagged elsewhere with a red marker). */
export function isFilletBend(dirAway1: number, dirAway2: number): boolean {
  return directionSteps(dirAway1, dirAway2) === 3;
}

/** One edge's own half of the circular fillet shared with whichever other edge meets it at
 * `node` — from this edge's tangent point (`t=0`, `FILLET_TANGENT_TILES` from the node, where the
 * edge's straight run continues) to the arc's midpoint (`t=1`), shared exactly with the other
 * edge's own `halfFillet(dirOther, dirThis)` at its own `t=1`. Splitting the fillet this way lets
 * each edge compute and draw its own contribution independently, with no double-covered or
 * missing geometry where they join. */
export interface HalfFillet {
  center: Point;
  radius: number;
  /** Angle (atan2 convention) of the tangent point (`t=0`) as seen from `center`. */
  angleAtTangent: number;
  /** Signed angular distance from the tangent (`t=0`) to the midpoint (`t=1`); magnitude is always
   * 22.5° (half of the fillet's fixed 45° bend). */
  sweepToMid: number;
  sample(t: number): PathSample;
}

export function halfFillet(
  nodeX: number,
  nodeY: number,
  dirThis: number,
  dirOther: number,
): HalfFillet {
  const uThis = unitDir(dirThis);
  const uOther = unitDir(dirOther);
  const bisector = { x: uThis.x + uOther.x, y: uThis.y + uOther.y };
  const bisLen = Math.hypot(bisector.x, bisector.y) || 1;
  const bisUnit = { x: bisector.x / bisLen, y: bisector.y / bisLen };
  const centerDist = FILLET_RADIUS_TILES / Math.sin(HALF_INTERIOR);
  const center = { x: nodeX + bisUnit.x * centerDist, y: nodeY + bisUnit.y * centerDist };

  const tangent = {
    x: nodeX + uThis.x * FILLET_TANGENT_TILES,
    y: nodeY + uThis.y * FILLET_TANGENT_TILES,
  };
  const angleAtTangent = Math.atan2(tangent.y - center.y, tangent.x - center.x);
  // The arc's midpoint is the point on the circle closest to the node — i.e. along the ray from
  // the center back toward the node.
  const midAngle = Math.atan2(nodeY - center.y, nodeX - center.x);

  let sweepToMid = midAngle - angleAtTangent;
  while (sweepToMid > Math.PI) sweepToMid -= Math.PI * 2;
  while (sweepToMid < -Math.PI) sweepToMid += Math.PI * 2;

  const radius = FILLET_RADIUS_TILES;
  return {
    center,
    radius,
    angleAtTangent,
    sweepToMid,
    sample(t: number): PathSample {
      const angle = angleAtTangent + sweepToMid * t;
      const x = center.x + radius * Math.cos(angle);
      const y = center.y + radius * Math.sin(angle);
      const dirSign = sweepToMid >= 0 ? 1 : -1;
      const heading = angle - dirSign * (Math.PI / 2);
      return { x, y, angle: heading };
    },
  };
}

// --- Generic curved path (straight + arc pieces), for tie/rail sampling and offsetting --------

interface LinePiece {
  kind: "line";
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface ArcPiece {
  kind: "arc";
  cx: number;
  cy: number;
  r: number;
  /** Traversal goes from `a0` to `a1` (may be increasing or decreasing). */
  a0: number;
  a1: number;
}

export type PathPiece = LinePiece | ArcPiece;

function pieceLength(p: PathPiece): number {
  if (p.kind === "line") return Math.hypot(p.x1 - p.x0, p.y1 - p.y0);
  return Math.abs(p.a1 - p.a0) * p.r;
}

export function pointOnPiece(p: PathPiece, u: number): PathSample {
  if (p.kind === "line") {
    const dx = p.x1 - p.x0;
    const dy = p.y1 - p.y0;
    return { x: p.x0 + dx * u, y: p.y0 + dy * u, angle: Math.atan2(dy, dx) };
  }
  const angle = p.a0 + (p.a1 - p.a0) * u;
  const x = p.cx + p.r * Math.cos(angle);
  const y = p.cy + p.r * Math.sin(angle);
  // Note this is the *negative* of `sign(a1 - a0)`: which of the two tangent directions is
  // "forward" depends on which side of the bend this piece represents (see the long derivation
  // in PROGRESS.md's Phase 13 entry), not just whether the stored angles happen to increase or
  // decrease — `buildEdgeGeometry` always constructs `a0`/`a1` so this negation is the one that
  // matches the adjoining straight segment's own heading with no discontinuity at the joint.
  const dirSign = p.a1 - p.a0 >= 0 ? -1 : 1;
  return { x, y, angle: angle - dirSign * (Math.PI / 2) };
}

/** Offsets a piece perpendicular to its direction of travel by `dist` (positive = the side you get
 * by rotating the forward tangent +90°, i.e. `(-dy, dx)` for a line — the same convention the
 * track renderer already used for straight rail pairs). For an arc this is exactly a radius change
 * (a circle offset a constant perpendicular distance is another concentric circle); the sign is
 * derived once from the arc's own sweep direction so it stays continuous with an adjoining line's
 * offset at the piece boundary. */
function offsetPiece(p: PathPiece, dist: number): PathPiece {
  if (p.kind === "line") {
    const dx = p.x1 - p.x0;
    const dy = p.y1 - p.y0;
    const len = Math.hypot(dx, dy) || 1;
    const px = (-dy / len) * dist;
    const py = (dx / len) * dist;
    return { kind: "line", x0: p.x0 + px, y0: p.y0 + py, x1: p.x1 + px, y1: p.y1 + py };
  }
  // Matches `pointOnPiece`'s (negated) heading sign convention — see the comment there.
  const sign = p.a1 - p.a0 >= 0 ? 1 : -1;
  return { ...p, r: p.r - dist * sign };
}

/** A curved centerline built from straight + arc pieces, in order of travel. */
export class EdgePath {
  readonly pieces: readonly PathPiece[];
  private readonly cumLengths: number[];
  readonly length: number;

  constructor(pieces: readonly PathPiece[]) {
    this.pieces = pieces;
    this.cumLengths = [];
    let total = 0;
    for (const p of pieces) {
      total += pieceLength(p);
      this.cumLengths.push(total);
    }
    this.length = total;
  }

  /** Samples the path at `distance` from its start, clamped to `[0, length]`. */
  pointAt(distance: number): PathSample {
    const d = Math.max(0, Math.min(this.length, distance));
    for (let i = 0; i < this.pieces.length; i++) {
      const prevEnd = i === 0 ? 0 : (this.cumLengths[i - 1] as number);
      const end = this.cumLengths[i] as number;
      const len = end - prevEnd;
      if (d <= end || i === this.pieces.length - 1) {
        const u = len > 0 ? (d - prevEnd) / len : 0;
        return pointOnPiece(this.pieces[i] as PathPiece, Math.max(0, Math.min(1, u)));
      }
    }
    return { x: 0, y: 0, angle: 0 };
  }

  /** A parallel path offset perpendicular by `dist` (see `offsetPiece`) — used for rail pairs and
   * the catenary wire. */
  offset(dist: number): EdgePath {
    return new EdgePath(this.pieces.map((p) => offsetPiece(p, dist)));
  }
}

function directionFromDelta(dx: number, dy: number): number {
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  for (let i = 0; i < DIRS8.length; i++) {
    const [ddx, ddy] = DIRS8[i] as readonly [number, number];
    if (ddx === sx && ddy === sy) return i;
  }
  throw new Error(`directionFromDelta: (${dx}, ${dy}) is not an 8-direction step`);
}

function tileCenter(tile: number, mapWidth: number): Point {
  return { x: (tile % mapWidth) + 0.5, y: Math.floor(tile / mapWidth) + 0.5 };
}

/**
 * Builds the curved centerline (tile units) for one edge from `a` to `b`, given the other edge's
 * "away from node" direction to fillet toward at each end (or `null` for no fillet — a dead end,
 * a straight through-pair, a sharp junction, or a bridge, which never bends at its own ends; see
 * module doc). `directionSteps(edge direction, partnerDirAtX)` must be 3 when a partner is given.
 */
export function buildEdgeGeometry(
  mapWidth: number,
  a: number,
  b: number,
  partnerDirAtA: number | null,
  partnerDirAtB: number | null,
): EdgePath {
  const nodeA = tileCenter(a, mapWidth);
  const nodeB = tileCenter(b, mapWidth);
  const dirAB = directionFromDelta(nodeB.x - nodeA.x, nodeB.y - nodeA.y);
  const dirBA = (dirAB + 4) % 8;
  const uAB = unitDir(dirAB);

  const pieces: PathPiece[] = [];
  let start = nodeA;
  if (partnerDirAtA !== null) {
    const hf = halfFillet(nodeA.x, nodeA.y, dirAB, partnerDirAtA);
    const tangentAngle = hf.angleAtTangent;
    const midAngle = tangentAngle + hf.sweepToMid;
    // Forward travel goes from the midpoint (shared with the previous edge, at the node) to this
    // edge's own tangent point, then straight — i.e. reversed from `halfFillet`'s own t=0..1.
    pieces.push({
      kind: "arc",
      cx: hf.center.x,
      cy: hf.center.y,
      r: hf.radius,
      a0: midAngle,
      a1: tangentAngle,
    });
    start = {
      x: nodeA.x + uAB.x * FILLET_TANGENT_TILES,
      y: nodeA.y + uAB.y * FILLET_TANGENT_TILES,
    };
  }

  let end = nodeB;
  let arcB: ArcPiece | null = null;
  if (partnerDirAtB !== null) {
    const hf = halfFillet(nodeB.x, nodeB.y, dirBA, partnerDirAtB);
    const tangentAngle = hf.angleAtTangent;
    const midAngle = tangentAngle + hf.sweepToMid;
    // Forward travel goes from this edge's own tangent point to the midpoint (shared with the
    // next edge) — matches `halfFillet`'s own t=0..1 directly.
    arcB = {
      kind: "arc",
      cx: hf.center.x,
      cy: hf.center.y,
      r: hf.radius,
      a0: tangentAngle,
      a1: midAngle,
    };
    end = { x: nodeB.x - uAB.x * FILLET_TANGENT_TILES, y: nodeB.y - uAB.y * FILLET_TANGENT_TILES };
  }

  pieces.push({ kind: "line", x0: start.x, y0: start.y, x1: end.x, y1: end.y });
  if (arcB) pieces.push(arcB);
  return new EdgePath(pieces);
}
