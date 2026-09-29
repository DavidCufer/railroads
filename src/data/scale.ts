/**
 * World scale (Phase 23A): 1 tile = 5 km. Before Phase 23 a tile was 10 km. Every tile-distance
 * balance number in `src/data/` and the sim is written as `<old value> * WORLD_SCALE` (or divided
 * by `AREA_SCALE` for per-tile densities) so the km-based game stays the same while the map is
 * drawn twice as dense in tiles. Station catchment radii and city/industry footprints are *not*
 * scaled: they are sizes in tiles on screen, so a station covers less land — intended.
 */

/** Old tile count -> new tile count for the same real-world distance. */
export const WORLD_SCALE = 2;
/** Old map area (tiles) -> new map area for the same real-world area. */
export const AREA_SCALE = WORLD_SCALE * WORLD_SCALE;
/** Real-world length of one tile. */
export const KM_PER_TILE = 10 / WORLD_SCALE;
