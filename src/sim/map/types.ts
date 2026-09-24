/** A rectangular grid of tiles: terrain, elevation and river data (SPEC §4.1). */
export interface GameMap {
  width: number;
  height: number;
  /** Terrain id per tile — see `TERRAIN_TYPES` in ./terrain.ts. */
  terrain: Uint8Array;
  /** Elevation 0–9 (0 = sea level), quantized — gameplay grade/hillshading use. */
  elevation: Uint8Array;
  /**
   * Continuous pre-quantization elevation (roughly [-1.5, 1]), kept for river routing
   * (priority-flood depression filling, see src/sim/map/flood.ts) and for rendering smoother,
   * stronger hillshading than the 10-step quantized field allows.
   */
  elevationRaw: Float32Array;
  /** Relative river flow magnitude per tile (0 for non-river tiles). Used for render width. */
  riverFlow: Uint16Array;
  /** Downstream tile index for a river tile (index of the next river/water tile), or -1. */
  riverNext: Int32Array;
}
