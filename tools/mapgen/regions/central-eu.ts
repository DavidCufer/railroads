/**
 * Central Europe & the Alps (SPEC §4.3). Bounds fixed by SPEC's region table: 5…20 lon, 44…54 lat.
 * Grid 142×144 ≈ matches the region's true aspect ((15°lon × cos(49°)) / 10°lat ≈ 0.98).
 *
 * Coastline/lakes hand-authored — see us-east.ts's file header for why. Mostly landlocked; the only
 * coastline in bounds is the northern Adriatic near Venice/Trieste.
 *
 * Populations from ~1840 figures. Deviation: the task brief's own example suggests "Vienna/Berlin
 * cities" (not metropolis) — both are capped at the city tier's ceiling (150,000) rather than their
 * real ~330-400k 1840 populations, honoring that guidance over strict historical accuracy. Trieste
 * (a substantial Habsburg free port by 1840, realistically ~50k) is likewise kept at the town tier's
 * ceiling per the brief's "Trieste town" example rather than bumped to city.
 */
import type { RegionDef } from "../regionDef";

const bounds = { west: 5, east: 20, south: 44, north: 54, width: 142, height: 144 };

export const centralEu: RegionDef = {
  id: "central-eu",
  name: "Central Europe & the Alps",
  bounds,
  startYear: 1840,
  seed: 183003,

  land: [
    [
      [5, 44],
      [20, 44],
      [20, 54],
      [5, 54],
    ],
  ],

  lakes: [
    // Northern Adriatic Sea — kept south/west of Trieste (45.65) and Venice's lagoon (45.44) so
    // both stay coastal-but-on-land.
    [
      [11.8, 44.0],
      [11.8, 45.2],
      [12.5, 45.35],
      [13.3, 45.4],
      [13.6, 45.5],
      [13.9, 45.35],
      [14.6, 45.0],
      [15.3, 44.6],
      [16.5, 44.3],
      [20, 44.0],
    ],
  ],

  rivers: [
    // Danube: Black Forest source, through Vienna and Budapest.
    [
      [9.5, 48.4],
      [12.0, 48.4],
      [14.5, 48.2],
      [16.3738, 48.2082],
      [17.5, 47.7],
      [19.0402, 47.4979],
    ],
    // Rhine: Alpine source, through Basel, Strasbourg, Cologne.
    [
      [8.6, 46.6],
      [7.5886, 47.5596],
      [7.7521, 48.5734],
      [7.6, 49.3],
      [6.9603, 50.9375],
      [6.6, 51.8],
    ],
  ],

  mountains: [
    {
      name: "Alps",
      ridge: [
        [7.0, 45.1],
        [8.0, 46.0],
        [9.5, 46.5],
        [11.0, 46.8],
        [12.5, 46.9],
        [14.0, 47.0],
        [15.3, 46.4],
      ],
      peakElevation: 9,
      radiusTiles: 11,
    },
    {
      // Only the western Carpathian edge is inside this region's bounds (the range's main arc
      // continues east past lon 20 into Slovakia/Romania) — a hint of it near the Tatras, north of
      // Budapest, per the review brief's "Carpathian edge".
      name: "Carpathians (western edge)",
      ridge: [
        [19.2, 48.8],
        [19.6, 49.2],
        [20.0, 49.4],
      ],
      peakElevation: 7,
      radiusTiles: 4,
    },
    {
      // SW Germany, near Freiburg/Basel — hills, not a Alps-scale range.
      name: "Black Forest",
      ridge: [
        [8.0, 47.6],
        [8.2, 48.2],
        [8.3, 48.6],
      ],
      peakElevation: 6,
      radiusTiles: 3,
    },
    {
      // Czech-German-Austrian border SW of Prague (Šumava) — hills.
      name: "Bohemian Forest",
      ridge: [
        [13.3, 49.7],
        [13.6, 49.2],
        [13.9, 48.8],
      ],
      peakElevation: 6,
      radiusTiles: 3,
    },
  ],

  resourceZones: [
    {
      name: "Ruhr coal",
      types: ["coalMine"],
      polygon: [
        [6.5, 51.0],
        [7.7, 51.0],
        [7.7, 51.7],
        [6.5, 51.7],
      ],
    },
    {
      name: "Silesia coal",
      types: ["coalMine"],
      polygon: [
        [16.5, 50.0],
        [19.5, 50.0],
        [19.5, 51.5],
        [16.5, 51.5],
      ],
    },
    {
      name: "Styria iron",
      types: ["ironMine"],
      polygon: [
        [14.3, 46.8],
        [15.7, 46.8],
        [15.7, 47.6],
        [14.3, 47.6],
      ],
    },
  ],

  cities: [
    { name: "Berlin", lon: 13.405, lat: 52.52, tier: "city", population: 148_000 },
    { name: "Vienna", lon: 16.3738, lat: 48.2082, tier: "city", population: 150_000 },
    { name: "Hamburg", lon: 9.9937, lat: 53.5511, tier: "city", population: 130_000 },
    { name: "Munich", lon: 11.582, lat: 48.1351, tier: "city", population: 90_000 },
    { name: "Frankfurt", lon: 8.6821, lat: 50.1109, tier: "city", population: 54_000 },
    { name: "Cologne", lon: 6.9603, lat: 50.9375, tier: "city", population: 75_000 },
    { name: "Prague", lon: 14.4378, lat: 50.0755, tier: "city", population: 110_000 },
    { name: "Zurich", lon: 8.5417, lat: 47.3769, tier: "town", population: 17_000 },
    { name: "Milan", lon: 9.19, lat: 45.4642, tier: "city", population: 140_000 },
    { name: "Venice", lon: 12.3155, lat: 45.4408, tier: "city", population: 110_000 },
    { name: "Trieste", lon: 13.7768, lat: 45.6495, tier: "town", population: 25_000 },
    { name: "Ljubljana", lon: 14.5058, lat: 46.0569, tier: "town", population: 15_000 },
    { name: "Budapest", lon: 19.0402, lat: 47.4979, tier: "city", population: 100_000 },
    { name: "Leipzig", lon: 12.3731, lat: 51.3397, tier: "city", population: 45_000 },
    { name: "Dresden", lon: 13.7373, lat: 51.0504, tier: "city", population: 65_000 },
    { name: "Stuttgart", lon: 9.1829, lat: 48.7758, tier: "city", population: 33_000 },
    { name: "Nuremberg", lon: 11.0767, lat: 49.4521, tier: "city", population: 50_000 },
    { name: "Salzburg", lon: 13.055, lat: 47.8095, tier: "town", population: 12_000 },
    { name: "Innsbruck", lon: 11.4041, lat: 47.2692, tier: "town", population: 11_000 },
    { name: "Graz", lon: 15.4395, lat: 47.0707, tier: "city", population: 36_000 },
    { name: "Turin", lon: 7.6869, lat: 45.0703, tier: "city", population: 117_000 },
    { name: "Genoa", lon: 8.9463, lat: 44.4056, tier: "city", population: 100_000 },
    { name: "Strasbourg", lon: 7.7521, lat: 48.5734, tier: "city", population: 60_000 },
    { name: "Basel", lon: 7.5886, lat: 47.5596, tier: "city", population: 27_000 },
    { name: "Zagreb", lon: 15.9819, lat: 45.815, tier: "town", population: 9_000 },
  ],
};
