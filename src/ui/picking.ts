/**
 * Tap targeting (PLAN Phase 17 C): pure decision logic for "what did the player mean by this tap?".
 * `main.ts` gathers the candidates near the tap (screen-space distances); this module ranks them.
 * Priority is trains > stations > industries > cities, with generous station touch targets so a
 * station inside a city footprint never loses to the city.
 */

export type PickKind = "train" | "station" | "industry" | "city";

export interface PickCandidate {
  kind: PickKind;
  id: number;
  name: string;
}

/** Minimum touch radius (CSS px) around a station — bigger than the drawn building on purpose. */
export const STATION_TOUCH_RADIUS_PX = 28;

/** Touch radius in CSS px for a station at the given zoom: 28px or the half-diagonal of the whole
 * station tile, whichever is larger. */
export function stationTouchRadius(tileSize: number, zoom: number): number {
  return Math.max(STATION_TOUCH_RADIUS_PX, tileSize * zoom * 0.5);
}

export type PickOutcome =
  | { type: "none" }
  | { type: "single"; pick: PickCandidate }
  | { type: "choose"; options: PickCandidate[] };

/**
 * Resolve the candidates under a tap. `stationsNear` are stations within their touch radius,
 * nearest first; `onStationTile` says the tap landed on the nearest station's own tile (an
 * unambiguous hit that beats an industry). Cities never compete with stations.
 */
export function resolveInfoPick(input: {
  trains: PickCandidate[];
  stationsNear: PickCandidate[];
  onStationTile: boolean;
  industry: PickCandidate | null;
  city: PickCandidate | null;
}): PickOutcome {
  const train = input.trains[0];
  if (train) return { type: "single", pick: train };
  const station = input.stationsNear[0];
  if (station) {
    if (input.industry && !input.onStationTile) {
      return { type: "choose", options: [station, input.industry] };
    }
    return { type: "single", pick: station };
  }
  if (input.industry) return { type: "single", pick: input.industry };
  if (input.city) return { type: "single", pick: input.city };
  return { type: "none" };
}

/** Station-only picking (adding stops to orders): a nearby station, else the stations serving the
 * tapped city / industry tile. `serving` is those stations; `cityName` names the tapped city. */
export function resolveStationPick(input: {
  stationsNear: PickCandidate[];
  serving: PickCandidate[];
}): PickOutcome {
  const near = input.stationsNear[0];
  if (near) return { type: "single", pick: near };
  if (input.serving.length === 1)
    return { type: "single", pick: input.serving[0] as PickCandidate };
  if (input.serving.length > 1) return { type: "choose", options: input.serving };
  return { type: "none" };
}
