/**
 * Eastern United States (SPEC §4.3). Bounds fixed by SPEC's region table: −92…−68 lon, 29…46 lat.
 * Grid 160×142 ≈ matches the region's true aspect ((24°lon × cos(37.5°)) / 17°lat ≈ 1.12).
 *
 * Coastline/lakes are hand-authored (Natural Earth fetch is network-blocked in this environment —
 * see PROGRESS.md's Phase 10 entry) at a level of detail matched to ~10.4 mi/tile: real shape and
 * relative scale of major features, not survey accuracy.
 *
 * Deviations from SPEC's exact resource-zone examples, both because their real-world locations
 * fall outside this region's fixed bounds: "Mesabi iron" (Minnesota, ~lat 47.3-47.9, north of our
 * lat-46 edge) is substituted with an eastern-Ohio/western-PA iron zone; "Texas oil" (west of our
 * lon-92 edge) is substituted with the historical Pennsylvania oil zone (Oil Creek/Titusville,
 * first commercial US oil well, 1859) alongside the Pennsylvania coal zone.
 */
import type { RegionDef } from "../regionDef";

const bounds = { west: -92, east: -68, south: 29, north: 46, width: 160, height: 142 };

export const usEast: RegionDef = {
  id: "us-east",
  name: "Eastern United States",
  bounds,
  startYear: 1830,
  seed: 183001,

  land: [
    [
      [-92, 46],
      [-68, 46],
      [-68, 44.9],
      [-69.0, 44.8],
      [-70.2, 43.7],
      [-70.8, 42.6],
      [-70.0, 41.85],
      [-71.5, 41.3],
      [-73.0, 41.0],
      [-72.5, 40.75],
      [-71.9, 41.05],
      [-72.5, 41.15],
      [-73.5, 41.0],
      [-73.9, 40.95],
      [-74.0, 40.7],
      [-74.05, 40.5],
      [-74.2, 39.9],
      [-74.5, 39.5],
      [-74.9, 38.95],
      [-75.05, 38.35],
      [-75.5, 37.95],
      [-75.9, 37.2],
      [-76.0, 36.0],
      [-75.5, 35.25],
      [-76.3, 34.6],
      [-77.9, 33.9],
      [-79.15, 33.4],
      [-79.55, 32.68],
      [-80.6, 32.15],
      [-80.8, 31.92],
      [-81.4, 31.0],
      [-81.5, 30.7],
      [-81.65, 30.3],
      [-81.3, 29.9],
      [-81.0, 29.0],
      [-82.5, 29.2],
      [-84.0, 29.8],
      [-84.5, 30.0],
      [-85.5, 30.2],
      [-87.2, 30.35],
      [-88.0, 30.3],
      [-89.1, 30.2],
      [-89.9, 29.2],
      [-90.5, 29.1],
      [-91.5, 29.3],
      [-92.0, 29.5],
      [-92.0, 46],
    ],
  ],

  lakes: [
    // Lake Michigan (west shore kept clear of Chicago at -87.63,41.88 — it sits just west/south
    // of the lake's southern tip).
    [
      [-87.0, 45.7],
      [-86.0, 44.7],
      [-85.3, 43.5],
      [-85.0, 42.3],
      [-85.6, 41.7],
      [-87.3, 41.65],
      [-87.55, 42.05],
      [-87.6, 43.0],
      [-87.3, 44.2],
      [-87.0, 45.2],
    ],
    // Lake Huron
    [
      [-84.0, 46.0],
      [-82.5, 45.5],
      [-82.0, 44.5],
      [-82.3, 43.4],
      [-83.5, 43.0],
      [-84.3, 43.6],
      [-84.5, 44.8],
    ],
    // Lake Erie
    [
      [-83.5, 42.1],
      [-82.7, 41.7],
      [-81.5, 41.5],
      [-80.0, 42.1],
      [-79.0, 42.85],
      [-80.0, 42.5],
      [-81.7, 42.2],
      [-82.9, 42.3],
    ],
    // Lake Ontario (west corner kept south of Toronto at -79.38,43.65 — it sits on the north shore).
    [
      [-79.2, 43.35],
      [-78.5, 44.2],
      [-77.0, 44.1],
      [-76.3, 43.9],
      [-76.5, 43.2],
      [-77.5, 43.2],
      [-78.8, 43.3],
      [-79.55, 43.15],
    ],
    // Chesapeake Bay (a tidal estuary, not a lake, but "carve this water shape out of land" is
    // exactly the mechanic a lake polygon gives us).
    [
      [-76.08, 39.55],
      [-76.3, 39.3],
      [-76.4, 38.97],
      [-76.35, 38.3],
      [-76.25, 37.6],
      [-76.0, 37.0],
      [-76.6, 37.3],
      [-76.9, 38.0],
      [-76.5, 38.8],
      [-76.3, 39.2],
    ],
    // Lake Champlain — New York/Vermont border, south of Montreal.
    [
      [-73.35, 44.9],
      [-73.15, 44.6],
      [-73.4, 44.2],
      [-73.45, 43.85],
      [-73.25, 44.3],
      [-73.15, 44.7],
    ],
  ],

  rivers: [
    // Hudson: Adirondacks to New York harbor.
    [
      [-73.7, 43.9],
      [-73.75, 43.5],
      [-73.8, 42.9],
      [-73.75, 42.65],
      [-73.85, 42.0],
      [-73.95, 41.3],
      [-74.0, 40.7],
    ],
    // Ohio: Pittsburgh confluence, past Cincinnati and Louisville, to the Mississippi at Cairo.
    [
      [-80.0, 40.44],
      [-81.0, 39.9],
      [-82.5, 39.0],
      [-84.0, 39.05],
      [-84.51, 39.1],
      [-85.76, 38.25],
      [-87.0, 37.9],
      [-88.0, 37.2],
      [-89.15, 37.0],
    ],
    // Mississippi: Minnesota border to the Gulf delta.
    [
      [-91.2, 45.5],
      [-91.3, 44.0],
      [-91.2, 42.5],
      [-90.5, 40.5],
      [-90.2, 38.63],
      [-89.9, 37.0],
      [-90.05, 35.15],
      [-91.0, 33.0],
      [-91.2, 31.5],
      [-90.5, 30.2],
      [-89.9, 29.2],
    ],
    // Potomac: Alleghenies near Cumberland, past Washington, to the Chesapeake.
    [
      [-78.75, 39.65],
      [-78.0, 39.5],
      [-77.5, 39.3],
      [-77.0369, 38.9072],
      [-76.5, 38.5],
      [-76.3, 38.0],
    ],
  ],

  mountains: [
    {
      // Phase 10.1 review: a single point-ridge falloff only ever read as hills within ~1 tile of
      // the ridge line regardless of radiusTiles, since the smoothstep falloff eats the band almost
      // immediately away from d=0 — that's the "1-3 tile stripe" bug. Fixed with a `coreRadiusTiles`
      // plateau: elevation now holds near `peakElevation` for the first few tiles off the ridge
      // before falling off, so a wide swath actually reads as hills instead of a thin seam. Runs the
      // full original AL-to-Maine extent (a continuous NE-SW band, ~12 tiles wide total), with a
      // narrower higher "core" ridge below adding real mountain elevation to the PA-to-northern-
      // Georgia stretch specifically (Blue Ridge/Alleghenies as mountain cores, per the review brief).
      name: "Appalachian Highlands",
      ridge: [
        [-86.8, 33.5],
        [-85.0, 34.8],
        [-83.5, 35.6],
        [-82.5, 37.3],
        [-80.5, 38.5],
        [-79.0, 40.0],
        [-77.5, 41.3],
        [-75.5, 42.3],
        [-74.0, 43.5],
        [-71.0, 44.5],
        [-70.0, 45.0],
      ],
      peakElevation: 6.5,
      coreRadiusTiles: 5,
      radiusTiles: 9,
    },
    {
      // The higher spine (Blue Ridge/Smokies/Alleghenies) — northern Georgia up to Pennsylvania
      // only, per the review brief. A narrower, higher mountain-core overlay riding on top of the
      // broad hills band above, giving ~4-5 tiles of real mountain terrain along the ridge crest.
      name: "Appalachian Mountains (Blue Ridge)",
      ridge: [
        [-86.8, 33.5],
        [-85.0, 34.8],
        [-83.5, 35.6],
        [-82.5, 37.3],
        [-80.5, 38.5],
        [-79.0, 40.0],
        [-77.5, 41.3],
      ],
      peakElevation: 9,
      coreRadiusTiles: 2,
      radiusTiles: 5,
    },
    {
      // Upstate New York, around the real Adirondack Park (~44.0N, -74.0W) — hills, not a
      // continuation of the main spine.
      name: "Adirondacks",
      ridge: [
        [-74.3, 43.7],
        [-74.0, 44.3],
        [-73.8, 44.1],
      ],
      peakElevation: 6.5,
      coreRadiusTiles: 3,
      radiusTiles: 6,
    },
    {
      // New Hampshire, around Mount Washington (~44.27N, -71.30W) — hills, with a small mountain
      // core at the actual Presidential Range peak.
      name: "White Mountains",
      ridge: [
        [-71.6, 44.0],
        [-71.3, 44.3],
        [-71.0, 44.5],
      ],
      peakElevation: 8.5,
      coreRadiusTiles: 1,
      radiusTiles: 4,
    },
  ],

  resourceZones: [
    {
      name: "Pennsylvania coal",
      types: ["coalMine"],
      polygon: [
        [-80.5, 42.0],
        [-77.0, 42.0],
        [-77.0, 39.7],
        [-80.5, 39.7],
      ],
    },
    {
      name: "Eastern Ohio / western PA iron (Mesabi substitute, see file header)",
      types: ["ironMine"],
      polygon: [
        [-81.5, 41.5],
        [-79.5, 41.5],
        [-79.5, 39.8],
        [-81.5, 39.8],
      ],
    },
    {
      name: "Pennsylvania oil (Oil Creek/Titusville, Texas substitute, see file header)",
      types: ["oilWell"],
      polygon: [
        [-80.2, 41.9],
        [-79.2, 41.9],
        [-79.2, 41.2],
        [-80.2, 41.2],
      ],
    },
    {
      name: "Midwest grain",
      types: ["farm"],
      polygon: [
        [-92, 42.5],
        [-84, 42.5],
        [-84, 38],
        [-92, 38],
      ],
    },
  ],

  cities: [
    { name: "New York", lon: -74.006, lat: 40.7128, tier: "metropolis", population: 155_000 },
    { name: "Philadelphia", lon: -75.1652, lat: 39.9526, tier: "city", population: 140_000 },
    { name: "Boston", lon: -71.0589, lat: 42.3601, tier: "city", population: 61_000 },
    { name: "Baltimore", lon: -76.6122, lat: 39.2904, tier: "city", population: 80_000 },
    { name: "Washington", lon: -77.0369, lat: 38.9072, tier: "town", population: 18_800 },
    { name: "Pittsburgh", lon: -79.9959, lat: 40.4406, tier: "town", population: 12_500 },
    { name: "Buffalo", lon: -78.8784, lat: 42.8864, tier: "town", population: 8_700 },
    { name: "Cleveland", lon: -81.6944, lat: 41.4993, tier: "village", population: 1_100 },
    { name: "Detroit", lon: -83.0458, lat: 42.3314, tier: "village", population: 2_200 },
    {
      name: "Chicago",
      lon: -87.6298,
      lat: 41.8781,
      tier: "village",
      population: 1_000,
      foundingYear: 1833,
    },
    { name: "Cincinnati", lon: -84.512, lat: 39.1031, tier: "town", population: 24_800 },
    { name: "Louisville", lon: -85.7585, lat: 38.2527, tier: "town", population: 10_340 },
    { name: "St. Louis", lon: -90.1994, lat: 38.627, tier: "town", population: 5_850 },
    { name: "Richmond", lon: -77.436, lat: 37.5407, tier: "town", population: 16_000 },
    { name: "Charleston", lon: -79.9311, lat: 32.7765, tier: "city", population: 30_000 },
    { name: "Savannah", lon: -81.0912, lat: 32.0809, tier: "town", population: 7_300 },
    {
      name: "Atlanta",
      lon: -84.388,
      lat: 33.749,
      tier: "village",
      population: 1_000,
      foundingYear: 1837,
    },
    { name: "Albany", lon: -73.7562, lat: 42.6526, tier: "town", population: 24_200 },
    { name: "Montreal", lon: -73.5673, lat: 45.5019, tier: "city", population: 27_000 },
    { name: "Toronto", lon: -79.3832, lat: 43.6532, tier: "village", population: 2_800 },
    { name: "Nashville", lon: -86.7816, lat: 36.1627, tier: "town", population: 5_566 },
    { name: "Memphis", lon: -90.049, lat: 35.1495, tier: "village", population: 1_000 },
    { name: "Norfolk", lon: -76.2859, lat: 36.8508, tier: "town", population: 9_800 },
    { name: "Columbus", lon: -82.9988, lat: 39.9612, tier: "village", population: 2_400 },
    { name: "Indianapolis", lon: -86.1581, lat: 39.7684, tier: "village", population: 1_085 },
  ],
};
