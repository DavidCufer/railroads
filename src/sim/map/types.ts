/** A rectangular grid of tiles: terrain, elevation and river-flow data (SPEC §4.1). */
export interface GameMap {
  width: number;
  height: number;
  /** Terrain id per tile — see `TERRAIN_TYPES` in ./terrain.ts. */
  terrain: Uint8Array;
  /** Elevation 0–9 (0 = sea level). */
  elevation: Uint8Array;
  /** Relative river flow magnitude per tile (0 for non-river tiles). Used for render width only. */
  riverFlow: Uint16Array;
}
