/** Top-down repair-crew train (Phase 63): a recognisable breakdown train in the engraved style, drawn once per
 * (kind, size bucket) to an offscreen canvas. Local space: +x = direction of travel, `L` x `W` art units. */
import { makeArtCanvas, ctx2d, devicePixelRatioSafe, type ArtCanvas } from "./canvas";
import { darken, disc, line, shadedBox, type Pen } from "./draw";

export type CrewTrainKind = "steamVan" | "steamCrane" | "motorCrane" | "railTruck";

/** Art era of the crew train: a tank engine with a tool van, the same with a crane wagon from about 1870, a motor
 * tractor with a crane after 1900, a road-rail service truck after 1950. */
export function crewTrainKind(year: number): CrewTrainKind {
  if (year >= 1950) return "railTruck";
  if (year >= 1900) return "motorCrane";
  if (year >= 1870) return "steamCrane";
  return "steamVan";
}

/** Footprint in art units (length, width). */
export const CREW_L = 24;
export const CREW_W = 8;

const INK = "#18140f";
const TIMBER = "#8c6a3f";
const VAN = "#6e4a32";
const CRANE_YELLOW = "#d4a017";
const ENGINE_GREEN = "#3c5a3e";
const MOTOR_RED = "#a8452f";
const IRON = "#3a3834";
const PALE = "#e9e0c9";

function bogie(p: Pen, x: number, w: number): void {
  // Two axle ends showing at the edge of the frame.
  for (const sy of [-1, 1]) line(p, x - 0.9, sy * (w / 2), x + 0.9, sy * (w / 2), INK, 0.7);
}

function tankEngine(p: Pen, x0: number): void {
  // Footplate, round boiler with dome and chimney, cab.
  shadedBox(p, x0, -3.2, 10, 6.4, 0.6, IRON);
  shadedBox(p, x0 + 3.6, -2.7, 6, 5.4, 2.4, ENGINE_GREEN);
  disc(p, x0 + 8.8, 0, 1.15, "#1a1713", INK); // chimney seen from above
  disc(p, x0 + 6.4, 0, 0.9, "#c9a64a", INK); // dome
  shadedBox(p, x0, -3.0, 3.6, 6, 0.4, darken(ENGINE_GREEN, 0.15)); // cab roof
  line(p, x0 + 3.6, -3, x0 + 3.6, 3, INK, 0.4);
  bogie(p, x0 + 2, 6.4);
  bogie(p, x0 + 7, 6.4);
}

function motorTractor(p: Pen, x0: number): void {
  shadedBox(p, x0, -3.2, 9, 6.4, 0.7, MOTOR_RED);
  shadedBox(p, x0, -2.9, 4, 5.8, 0.5, PALE); // cab roof
  shadedBox(p, x0 + 4.4, -2.5, 4.2, 5, 0.6, darken(MOTOR_RED, 0.2)); // bonnet
  for (let i = 0; i < 3; i++) line(p, x0 + 5.4 + i * 1.1, -2, x0 + 5.4 + i * 1.1, 2, INK, 0.25); // grille slats
  bogie(p, x0 + 1.8, 6.4);
  bogie(p, x0 + 7, 6.4);
}

function toolVan(p: Pen, x0: number, w: number): void {
  shadedBox(p, x0, -3, w, 6, 0.4, VAN);
  line(p, x0 + 0.5, 0, x0 + w - 0.5, 0, INK, 0.35); // roof ridge
  for (let x = x0 + 1.6; x < x0 + w - 1; x += 2.2) line(p, x, -3, x, 3, INK, 0.25); // planking
  shadedBox(p, x0 + w - 2.6, -0.9, 1.6, 1.8, 0.2, PALE); // roof vent
  bogie(p, x0 + 2, 6);
  bogie(p, x0 + w - 2, 6);
}

function craneWagon(p: Pen, x0: number, w: number): void {
  shadedBox(p, x0, -3, w, 6, 0.3, TIMBER); // flat bed
  shadedBox(p, x0 + 1.2, -2.2, 3.6, 4.4, 0.5, CRANE_YELLOW); // slewing house
  // Jib: two lattice strokes to the end of the wagon, with a hook ring.
  line(p, x0 + 3, -0.7, x0 + w + 0.3, -0.7, INK, 0.6);
  line(p, x0 + 3, 0.7, x0 + w + 0.3, 0.7, INK, 0.6);
  for (let x = x0 + 4.5; x < x0 + w; x += 1.6) line(p, x, -0.7, x + 0.8, 0.7, INK, 0.25);
  disc(p, x0 + w, 0, 0.6, PALE, INK);
  // Outriggers / counterweight at the rear.
  shadedBox(p, x0 + 0.2, -2.7, 1, 5.4, 0.2, IRON);
  bogie(p, x0 + 2, 6);
  bogie(p, x0 + w - 2.2, 6);
}

function roadRailTruck(p: Pen, x0: number): void {
  shadedBox(p, x0, -3.1, 4.6, 6.2, 0.9, "#e3b520"); // cab
  shadedBox(p, x0 + 2.8, -2.5, 1.4, 5, 0.4, "#4d6b73"); // windscreen
  shadedBox(p, x0 + 4.8, -3.1, 9, 6.2, 0.4, "#e3b520"); // bed
  shadedBox(p, x0 + 9, -2, 3.4, 4, 0.5, IRON); // crane base
  line(p, x0 + 10.7, 0, x0 + 14.8, 0, INK, 0.7); // boom
  disc(p, x0 + 14.8, 0, 0.5, PALE, INK);
  bogie(p, x0 + 2, 6.2);
  bogie(p, x0 + 11.5, 6.2);
}

function paintCrewTrain(p: Pen, kind: CrewTrainKind): void {
  // Centre the consist on the origin: it spans -CREW_L/2 .. +CREW_L/2, front at +x.
  const x0 = -CREW_L / 2;
  switch (kind) {
    case "steamVan":
      toolVan(p, x0, 12.5);
      line(p, x0 + 12.5, 0, x0 + 13.4, 0, INK, 0.5); // coupling
      tankEngine(p, x0 + 13.4);
      break;
    case "steamCrane":
      craneWagon(p, x0, 12.5);
      line(p, x0 + 12.5, 0, x0 + 13.4, 0, INK, 0.5);
      tankEngine(p, x0 + 13.4);
      break;
    case "motorCrane":
      craneWagon(p, x0, 14);
      line(p, x0 + 14, 0, x0 + 14.8, 0, INK, 0.5);
      motorTractor(p, x0 + 14.8);
      break;
    case "railTruck":
      roadRailTruck(p, x0 + 4.5);
      break;
  }
}

const cache = new Map<string, ArtCanvas>();

/** Cached sprite for `kind`, `lenPx` long on screen (bucketed to multiples of 4 px). Returns the canvas and the
 * length it is drawn at (backing size / dpr). */
export function crewTrainCanvas(kind: CrewTrainKind, lenPx: number): ArtCanvas {
  const dpr = devicePixelRatioSafe();
  const bucket = Math.max(16, Math.ceil(lenPx / 4) * 4);
  const key = `${kind}:${bucket}:${dpr}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const s = (bucket * dpr) / CREW_L;
  const pad = 1;
  const canvas = makeArtCanvas(bucket * dpr + pad * 2, (CREW_W + 1) * s + pad * 2);
  const ctx = ctx2d(canvas);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(s, s);
  paintCrewTrain({ ctx, u: s, ow: 1 / s }, kind);
  cache.set(key, canvas);
  return canvas;
}
