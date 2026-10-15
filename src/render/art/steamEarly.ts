/** The three pioneer engines that do not follow the generic boiler-cab-tender build (Phase 49B), each drawn
 * from its real prototype: the vertical-boiler walking-beam Grasshopper, the Planet's single large driver
 * and bare footplate, the Norris's bar frame, bogie and haystack firebox. Same local frame as `steamLayout`
 * (smokebox front at x = 0, rail at y = 23); everything stays inside the layout's [minX, maxX]. */

import type { LocomotiveDef } from "../../data/trains";
import { darken, hash01, lighten, type Pen } from "./draw";
import { INK, box, engrave, hair, ink, pin, poly, rivets, rod, wheel } from "./engrave";
import type { SteamLayout } from "./steam";

const RAIL_Y = 23;
const EARLY = new Set(["grasshopper-0-4-0", "planet-2-2-0", "norris-4-2-0"]);

export function isBespoke(def: Pick<LocomotiveDef, "id">): boolean {
  return EARLY.has(def.id);
}

export function earlyChimneyTop(
  def: Pick<LocomotiveDef, "id">,
  lay: SteamLayout,
): { x: number; y: number } {
  const [x, y] =
    def.id === "grasshopper-0-4-0"
      ? [-17, 0.8]
      : def.id === "planet-2-2-0"
        ? [-1.6, 1.6]
        : [-2.6, 1.2];
  return { x: x - lay.minX, y };
}

function pathOf(
  ctx: CanvasRenderingContext2D,
  pts: ReadonlyArray<readonly [number, number]>,
): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

/** A small wagon tender: boxy body, heap of fuel, light chassis, two spoked wheels. */
function wagonTender(
  p: Pen,
  lay: SteamLayout,
  x0: number,
  x1: number,
  top: number,
  axles: number[],
  wr: number,
  fuel: string,
): void {
  const { ctx } = p;
  const { lv } = lay;
  const len = x1 - x0;
  const bottom = RAIL_Y - wr * 2 - 0.6;
  box(p, x0 + 0.5, bottom, len - 1, 0.9, lv.frame, { hatch: 0 });
  axles.forEach((x) => wheel(p, x, RAIL_Y - wr, wr, { spokes: 8 }));
  ctx.beginPath();
  ctx.moveTo(x0 + 0.8, top + 0.2);
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    ctx.lineTo(
      x0 + 0.8 + t * (len - 3),
      top - 0.2 - Math.sin(t * Math.PI) * 1.6 - hash01(i + 5) * 0.4,
    );
  }
  ctx.lineTo(x1 - 2.2, top + 0.2);
  ctx.closePath();
  ctx.fillStyle = fuel;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = hair(p);
  ctx.stroke();
  box(p, x0, top, len, bottom - top, lv.tender);
  ctx.strokeStyle = lv.tenderLining;
  ctx.lineWidth = hair(p, 0.8);
  ctx.strokeRect(x0 + 1, top + 1, len - 2, bottom - top - 2);
  rivets(p, x0 + 0.6, x1 - 0.6, top + 0.4, lighten(lv.tender, 0.35));
}

function handrail(p: Pen, x0: number, x1: number, y: number, h: number, color: string): void {
  ink(p, x0, y - h, x1, y - h, 0.9, color);
  ink(p, x0, y, x0, y - h, 0.9, color);
  ink(p, x1, y, x1, y - h, 0.9, color);
}

function grasshopper(p: Pen, lay: SteamLayout): void {
  const { ctx } = p;
  const { lv } = lay;
  const wr = 3.4;
  const hubY = RAIL_Y - wr;
  // Tender behind, then the platform and frame.
  wagonTender(p, lay, -41.5, -26.2, 13.2, [-36.5, -30.5], 2.4, lv.coal);
  ink(p, -26.2, 17.6, -24.6, 17.6, 1.6);
  // Frame and the engineer's bare platform (no cab).
  box(p, -25.5, 15.8, 26.2, 1.5, lv.frame, { hatch: 0 });
  box(p, -25.5, 14.9, 6.2, 0.9, "#6A4A30", { hatch: 0.5 });
  handrail(p, -25.3, -22.0, 14.9, 3.2, "#9A8A62");
  box(p, -0.2, 14.8, 1.4, 3.2, lv.frame, { hatch: 0 });
  // Upright boiler: round-topped drum with a darker firebox ring at its foot.
  const bx0 = -20.6;
  const bx1 = -13.6;
  const top = 5.8;
  const bot = 15.8;
  engrave(
    p,
    lv.body,
    [bx0, top, bx1 - bx0, bot - top],
    () => {
      ctx.beginPath();
      ctx.moveTo(bx0, bot);
      ctx.lineTo(bx0, top + 2.6);
      ctx.quadraticCurveTo(bx0, top, (bx0 + bx1) / 2, top);
      ctx.quadraticCurveTo(bx1, top, bx1, top + 2.6);
      ctx.lineTo(bx1, bot);
      ctx.closePath();
    },
    { hatch: 0.5 },
  );
  box(p, bx0 - 0.4, bot - 2.8, bx1 - bx0 + 0.8, 2.8, darken(lv.body, 0.35));
  for (const y of [7.8, 10.2, 12.6]) {
    ink(p, bx0 + 0.1, y, bx1 - 0.1, y, 0.8, lv.brass);
  }
  ink(p, bx0 + 1.2, top + 1.4, bx0 + 1.2, bot - 3, 0.5, lighten(lv.body, 0.3));
  // Stack: tall, slender, flared cap.
  const sx = -17.1;
  poly(
    p,
    [
      [sx - 1.0, top + 0.4],
      [sx - 0.8, 2.2],
      [sx - 1.5, 1.6],
      [sx - 1.5, 0.9],
      [sx + 1.5, 0.9],
      [sx + 1.5, 1.6],
      [sx + 0.8, 2.2],
      [sx + 1.0, top + 0.4],
    ],
    "#202022",
  );
  // Vertical cylinder on the frame, its piston rod rising to the beam.
  box(p, -6.6, 9.8, 2.6, 6.0, lv.frame, { hatch: 0.45 });
  box(p, -6.9, 9.0, 3.2, 0.9, lv.brass, { hatch: 0 });
  ink(p, -5.3, 9.0, -5.3, 6.4, 1.6, "#9A9E9F");
  // A-frame post and the walking beam on its pivot.
  ink(p, -12.0, 15.8, -9.6, 7.0, 1.6);
  ink(p, -7.4, 15.8, -9.6, 7.0, 1.6);
  ink(p, -11.2, 12.6, -8.1, 12.6, 1.0);
  rod(p, -14.0, 7.8, -5.3, 5.9, 0.9, "#7C7F82");
  pin(p, -9.6, 6.85, 0.7);
  pin(p, -5.3, 5.9, 0.5);
  // Connecting rod from the beam down to the crank, coupling rod between the wheels.
  const c1 = [-8 - 1.8, hubY - 1.5] as const;
  const c2 = [-17 - 1.8, hubY - 1.5] as const;
  rod(p, -12.2, 7.6, c1[0], c1[1], 0.5);
  rod(p, c1[0], c1[1], c2[0], c2[1], 0.5);
  // Wheels (small, as on the early geared engines).
  wheel(p, -8, hubY, wr, { spokes: 10 });
  wheel(p, -17, hubY, wr, { spokes: 10 });
  pin(p, c1[0], c1[1], 0.45);
  pin(p, c2[0], c2[1], 0.45);
}

function planet(p: Pen, lay: SteamLayout): void {
  const { ctx } = p;
  const { lv } = lay;
  const wood = "#6A4A30";
  wagonTender(p, lay, -34.6, -23.4, 13.4, [-31.2, -26.4], 2.3, lv.coal);
  // Plank frame (wood sandwiched with iron), buffer beam and two round buffers.
  box(p, -23.8, 15.4, 24.2, 1.6, wood, { hatch: 0.45 });
  ink(p, -23.6, 16.2, 0.2, 16.2, 0.6, darken(wood, 0.5));
  box(p, -0.3, 14.5, 1.5, 3.0, wood, { hatch: 0.5 });
  pin(p, 1.1, 15.4, 0.6);
  pin(p, 1.1, 16.8, 0.6);
  // Boiler barrel, smokebox drum and raised firebox.
  const bt = 9.6;
  const bb = 14.8;
  box(p, -15.4, bt, 15.2, bb - bt, lv.body, { hatch: 0.5 });
  for (const x of [-12, -8.5, -5]) ink(p, x, bt + 0.1, x, bb - 0.1, 0.8, lv.brass);
  ink(p, -15.0, bt + 1.2, -3.6, bt + 1.2, 0.5, lighten(lv.body, 0.3));
  box(p, -3.6, bt - 0.2, 3.6, bb - bt + 0.2, "#27262A", { hatch: 0.5 });
  ink(p, -0.8, bt + 0.4, -0.8, bb - 0.4, 0.8, "#6A6C70");
  engrave(
    p,
    lv.body,
    [-19.6, 7.4, 5.8, bb - 7.4],
    () => {
      ctx.beginPath();
      ctx.moveTo(-19.6, bb);
      ctx.lineTo(-19.6, 9.4);
      ctx.quadraticCurveTo(-19.6, 7.4, -17.2, 7.4);
      ctx.quadraticCurveTo(-13.8, 7.4, -13.8, 9.4);
      ctx.lineTo(-13.8, bb);
      ctx.closePath();
    },
    { hatch: 0.5 },
  );
  ink(p, -19.4, 10.2, -14.0, 10.2, 0.8, lv.brass);
  ink(p, -19.4, 12.4, -14.0, 12.4, 0.8, lv.brass);
  // Brass dome and safety-valve column on the firebox.
  engrave(
    p,
    lv.brass,
    [-18.2, 5.0, 2.2, 2.6],
    () => {
      ctx.beginPath();
      ctx.moveTo(-18.4, 7.6);
      ctx.lineTo(-18.2, 5.8);
      ctx.quadraticCurveTo(-17.1, 4.6, -16.0, 5.8);
      ctx.lineTo(-15.8, 7.6);
      ctx.closePath();
    },
    { hatch: 0.4 },
  );
  ink(p, -14.8, 7.6, -14.8, 5.6, 1.4, lv.brass);
  // Tall plain chimney with a flared rim.
  poly(
    p,
    [
      [-3.1, bt + 0.3],
      [-2.7, 3.0],
      [-3.0, 2.4],
      [-3.0, 1.6],
      [-0.2, 1.6],
      [-0.2, 2.4],
      [-0.5, 3.0],
      [-0.1, bt + 0.3],
    ],
    "#1F1E20",
  );
  ink(p, -3.0, 1.6, -0.2, 1.6, 1.4, lv.brass);
  // Bare footplate with a low rail behind the firebox.
  box(p, -24.0, 14.8, 4.6, 0.8, wood, { hatch: 0 });
  handrail(p, -23.7, -20.8, 14.8, 3.0, "#9A8A62");
  // Single driving wheel (large, spoked), the leading wheel, crank pin.
  const dr = 4.6;
  const hubY = RAIL_Y - dr;
  const lr = 2.5;
  wheel(p, -4.4, RAIL_Y - lr, lr, { spokes: 8 });
  wheel(p, -11.3, hubY, dr, { spokes: 16 });
  pin(p, -11.3 + 1.9, hubY - 0.6, 0.5);
}

function norris(p: Pen, lay: SteamLayout): void {
  const { ctx } = p;
  const { lv } = lay;
  wagonTender(p, lay, -41.0, -30.4, 13.0, [-37.6, -33.4], 2.2, lv.coal);
  // Bar frame: slender iron bars and hangers rather than a plate frame.
  box(p, -30.6, 14.6, 31.2, 1.0, lv.frame, { hatch: 0 });
  for (const x of [-26, -21, -13.2, -3]) ink(p, x, 15.4, x, 17.6, 1.2);
  box(p, -0.4, 14.4, 1.4, 3.0, lv.frame, { hatch: 0 });
  // Bogie.
  box(p, -11.2, 18.1, 9.4, 1.0, lv.frame, { hatch: 0 });
  ink(p, -6.4, 15.4, -6.4, 18.1, 1.4);
  const lr = 2.3;
  wheel(p, -4.2, RAIL_Y - lr, lr, { spokes: 8 });
  wheel(p, -8.6, RAIL_Y - lr, lr, { spokes: 8 });
  // Footplate behind the haystack firebox.
  box(p, -30.6, 13.9, 5.4, 0.8, "#6A4A30", { hatch: 0 });
  handrail(p, -30.3, -27.0, 13.9, 3.0, "#9A8A62");
  // Boiler barrel and smokebox.
  const bt = 8.4;
  const bb = 14.0;
  box(p, -21.0, bt, 17.8, bb - bt, lv.body, { hatch: 0.5 });
  for (const x of [-17, -13, -9, -5.5]) ink(p, x, bt + 0.1, x, bb - 0.1, 0.8, lv.brass);
  ink(p, -20.8, bt + 1.4, -3.4, bt + 1.4, 0.5, lighten(lv.body, 0.3));
  box(p, -3.4, bt - 0.2, 3.4, bb - bt + 0.2, "#27262A", { hatch: 0.5 });
  ink(p, -0.8, bt + 0.4, -0.8, bb - 0.4, 0.8, "#6A6C70");
  // Haystack (Bury) firebox: tall, rounded, flaring to the foot, brass dome cap.
  engrave(
    p,
    lv.body,
    [-26.4, 5.2, 8.0, bb - 5.2],
    () => {
      ctx.beginPath();
      ctx.moveTo(-26.4, bb);
      ctx.lineTo(-25.9, 8.8);
      ctx.quadraticCurveTo(-25.4, 5.2, -22.4, 5.2);
      ctx.quadraticCurveTo(-19.4, 5.2, -18.9, 8.8);
      ctx.lineTo(-18.4, bb);
      ctx.closePath();
    },
    { hatch: 0.5 },
  );
  ink(p, -26.3, 11.6, -18.5, 11.6, 0.8, lv.brass);
  ink(p, -26.0, 8.8, -18.8, 8.8, 0.8, lv.brass);
  engrave(
    p,
    lv.brass,
    [-23.6, 3.2, 2.4, 2.2],
    () => {
      ctx.beginPath();
      ctx.moveTo(-23.8, 5.4);
      ctx.lineTo(-23.5, 4.4);
      ctx.quadraticCurveTo(-22.4, 2.8, -21.3, 4.4);
      ctx.lineTo(-21.0, 5.4);
      ctx.closePath();
    },
    { hatch: 0.4 },
  );
  // Small barrel dome.
  engrave(
    p,
    lv.brass,
    [-12.0, 5.6, 2.8, 3.0],
    () => {
      ctx.beginPath();
      ctx.moveTo(-12.2, bt + 0.4);
      ctx.lineTo(-12.0, 7.0);
      ctx.quadraticCurveTo(-10.6, 5.4, -9.2, 7.0);
      ctx.lineTo(-9.0, bt + 0.4);
      ctx.closePath();
    },
    { hatch: 0.4 },
  );
  // Diamond stack and a small lamp.
  const sx = -2.6;
  poly(
    p,
    [
      [sx - 1.4, bt + 0.4],
      [sx - 0.8, bt - 1.0],
      [sx - 0.8, bt - 2.0],
      [sx - 2.3, bt - 3.4],
      [sx - 2.3, 1.2],
      [sx + 2.3, 1.2],
      [sx + 2.3, bt - 3.4],
      [sx + 0.8, bt - 2.0],
      [sx + 0.8, bt - 1.0],
      [sx + 1.4, bt + 0.4],
    ],
    "#1F1E20",
  );
  ink(p, sx - 2.3, 1.2, sx + 2.3, 1.2, 1.4, lv.brass);
  box(p, -1.0, bt - 1.6, 1.5, 1.7, "#2C2B28", { hatch: 0 });
  // Outside cylinder, inclined, with its rod to the single driver's crank.
  const dr = 4.6;
  const hubY = RAIL_Y - dr;
  poly(
    p,
    [
      [-12.6, 12.4],
      [-7.2, 13.4],
      [-7.2, 15.6],
      [-12.6, 14.6],
    ],
    lv.frame,
    { hatch: 0.45 },
  );
  box(p, -7.6, 13.5, 0.8, 1.9, lv.brass, { hatch: 0 });
  const crank = [-17.7 - 2.6, hubY - 1.0] as const;
  rod(p, -12.4, 13.6, crank[0] + 0.3, crank[1], 0.55);
  // Cowcatcher pilot.
  poly(
    p,
    [
      [-0.6, 16.0],
      [4.6, 21.8],
      [4.6, 22.6],
      [-0.6, 22.6],
    ],
    "#232220",
    { hatch: 0 },
  );
  ctx.strokeStyle = "#8E897C";
  ctx.lineWidth = hair(p, 0.7);
  ctx.beginPath();
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    ctx.moveTo(-0.3 + t * 4.7, 16.3 + t * 5.5);
    ctx.lineTo(-0.3 + t * 4.7, 22.4);
  }
  ctx.stroke();
  wheel(p, -17.7, hubY, dr, { counterweight: Math.PI * 1.12, spokes: 16 });
  pin(p, crank[0], crank[1], 0.5);
}

export function drawEarlySteam(p: Pen, def: LocomotiveDef, lay: SteamLayout): void {
  if (def.id === "grasshopper-0-4-0") grasshopper(p, lay);
  else if (def.id === "planet-2-2-0") planet(p, lay);
  else norris(p, lay);
}
