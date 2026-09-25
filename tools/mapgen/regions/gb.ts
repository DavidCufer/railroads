/**
 * Great Britain (SPEC §4.3). Bounds fixed by SPEC's region table: −6.5…2 lon, 50…56.5 lat.
 * Grid 112×144 ≈ matches the region's true aspect ((8.5°lon × cos(53.25°)) / 6.5°lat ≈ 0.78).
 *
 * Coastline/lakes hand-authored — see us-east.ts's file header for why (Natural Earth's CDN is
 * network-blocked in this environment). Aberdeen (lat ~57.15) is excluded per SPEC's own
 * "(may be off map)" caveat — it's north of this region's fixed lat-56.5 edge.
 */
import type { RegionDef } from "../regionDef";

const bounds = { west: -6.5, east: 2, south: 50, north: 56.5, width: 112, height: 144 };

export const gb: RegionDef = {
  id: "gb",
  name: "Great Britain",
  bounds,
  startYear: 1830,
  seed: 183002,

  land: [
    [
      [-2.3, 56.5],
      [-2.5, 56.15],
      [-2.9, 56.05],
      [-2.6, 55.95],
      [-3.15, 56.05],
      [-2.6, 55.85],
      [-1.75, 55.6],
      [-1.6, 54.98],
      [-1.4, 54.6],
      [-0.5, 54.1],
      [-0.15, 53.75],
      [0.15, 53.62],
      [-0.3, 53.7],
      [0.1, 53.55],
      [0.35, 52.95],
      [0.2, 52.85],
      [0.6, 52.8],
      [1.3, 52.98],
      [1.75, 52.65],
      [1.75, 52.2],
      [1.4, 51.95],
      [1.05, 51.8],
      [1.4, 51.4],
      [1.0, 50.95],
      [0.5, 50.85],
      [0.0, 50.75],
      [-0.6, 50.7],
      [-1.0, 50.7],
      [-1.55, 50.7],
      [-1.9, 50.6],
      [-2.5, 50.6],
      [-3.5, 50.4],
      [-4.15, 50.35],
      [-4.7, 50.2],
      [-5.4, 50.1],
      [-5.7, 50.15],
      [-5.5, 50.4],
      [-4.9, 51.0],
      [-4.0, 51.2],
      [-3.0, 51.28],
      [-2.85, 51.38],
      [-2.65, 51.5],
      [-2.95, 51.42],
      [-3.5, 51.38],
      [-4.2, 51.7],
      [-4.6, 52.0],
      [-4.3, 52.5],
      [-4.1, 52.9],
      [-4.5, 53.0],
      [-4.2, 53.2],
      [-3.5, 53.35],
      [-3.0, 53.45],
      [-3.05, 53.4],
      [-2.9, 53.5],
      [-3.0, 53.7],
      [-2.95, 54.05],
      [-3.2, 54.15],
      [-3.35, 54.5],
      [-3.4, 54.8],
      [-3.6, 54.95],
      [-3.3, 55.0],
      [-4.5, 54.85],
      [-4.9, 55.0],
      [-4.6, 55.3],
      [-4.9, 55.5],
      [-4.9, 55.75],
      [-4.9, 55.9],
      [-4.3, 55.95],
      [-4.9, 56.0],
      [-5.5, 56.3],
      [-5.3, 56.5],
    ],
  ],

  lakes: [],

  rivers: [
    // Thames: near Oxford, through London, to the estuary.
    [
      [-1.26, 51.75],
      [-0.75, 51.65],
      [-0.13, 51.51],
      [0.55, 51.5],
    ],
    // Severn: Cambrian mountains to the Bristol Channel.
    [
      [-3.5, 52.5],
      [-3.0, 52.2],
      [-2.7, 51.9],
      [-2.65, 51.6],
    ],
  ],

  mountains: [
    {
      // Hills with a modest mountain core along the crest, per the review brief. Kept narrower
      // than the US/Alps ranges since real cities (Manchester, Sheffield) sit close to the real
      // Pennines' western/eastern foothills at this region's fine ~5km/tile scale.
      name: "Pennines",
      ridge: [
        [-1.8, 53.1],
        [-2.0, 53.6],
        [-2.0, 54.2],
        [-2.4, 55.0],
      ],
      peakElevation: 9,
      coreRadiusTiles: 1.5,
      radiusTiles: 5,
    },
    {
      name: "Scottish Highlands",
      ridge: [
        [-4.6, 56.1],
        [-4.2, 56.3],
        [-4.0, 56.5],
      ],
      peakElevation: 9,
      coreRadiusTiles: 2.5,
      radiusTiles: 7,
    },
    {
      name: "Cambrian Mountains",
      ridge: [
        [-3.8, 51.9],
        [-3.9, 52.5],
        [-3.9, 53.0],
      ],
      peakElevation: 9,
      coreRadiusTiles: 1.5,
      radiusTiles: 4.5,
    },
  ],

  resourceZones: [
    {
      name: "South Wales coal",
      types: ["coalMine"],
      polygon: [
        [-3.8, 51.55],
        [-3.0, 51.55],
        [-3.0, 51.85],
        [-3.8, 51.85],
      ],
    },
    {
      name: "Yorkshire/Midlands coal and iron",
      types: ["coalMine", "ironMine"],
      polygon: [
        [-2.0, 52.8],
        [-1.0, 52.8],
        [-1.0, 53.9],
        [-2.0, 53.9],
      ],
    },
    {
      name: "Scottish Central Belt coal and iron",
      types: ["coalMine", "ironMine"],
      polygon: [
        [-4.5, 55.6],
        [-3.7, 55.6],
        [-3.7, 56.0],
        [-4.5, 56.0],
      ],
    },
    {
      name: "East Anglia farmland",
      types: ["farm"],
      polygon: [
        [0.0, 52.2],
        [1.6, 52.2],
        [1.6, 53.0],
        [0.0, 53.0],
      ],
    },
  ],

  cities: [
    { name: "London", lon: -0.1278, lat: 51.5074, tier: "metropolis", population: 400_000 },
    { name: "Glasgow", lon: -4.2518, lat: 55.8642, tier: "metropolis", population: 202_000 },
    { name: "Birmingham", lon: -1.8904, lat: 52.4862, tier: "city", population: 144_000 },
    { name: "Manchester", lon: -2.2426, lat: 53.4808, tier: "city", population: 142_000 },
    { name: "Liverpool", lon: -2.9916, lat: 53.4084, tier: "city", population: 150_000 },
    { name: "Leeds", lon: -1.5491, lat: 53.8008, tier: "city", population: 123_000 },
    { name: "Edinburgh", lon: -3.1883, lat: 55.9533, tier: "city", population: 136_000 },
    { name: "Sheffield", lon: -1.4701, lat: 53.3811, tier: "city", population: 92_000 },
    { name: "Bristol", lon: -2.5879, lat: 51.4545, tier: "city", population: 104_000 },
    { name: "Norwich", lon: 1.2974, lat: 52.6309, tier: "city", population: 61_000 },
    { name: "Newcastle", lon: -1.6178, lat: 54.9783, tier: "city", population: 53_000 },
    { name: "Nottingham", lon: -1.1581, lat: 52.9548, tier: "city", population: 50_000 },
    { name: "Hull", lon: -0.3367, lat: 53.7457, tier: "city", population: 44_000 },
    { name: "York", lon: -1.0873, lat: 53.9591, tier: "city", population: 26_000 },
    { name: "Plymouth", lon: -4.1427, lat: 50.3755, tier: "town", population: 22_000 },
    { name: "Southampton", lon: -1.4044, lat: 50.9097, tier: "town", population: 19_000 },
    { name: "Carlisle", lon: -2.9319, lat: 54.8925, tier: "town", population: 15_000 },
    { name: "Cardiff", lon: -3.1791, lat: 51.4816, tier: "town", population: 6_000 },
  ],
};
