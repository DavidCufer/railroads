/**
 * American West (SPEC §4.3). Bounds fixed by SPEC's region table: −125…−104 lon, 32…49 lat.
 * Grid 136×144 ≈ matches the region's true aspect ((21°lon × cos(40.5°)) / 17°lat ≈ 0.94).
 *
 * Coastline/lakes hand-authored — see us-east.ts's file header for why.
 *
 * Five of the sixteen SPEC-listed cities weren't founded until after the 1860 start year — Boise
 * (1863), Cheyenne (1867), Phoenix and Reno (both 1868), Spokane (1871) — so this region leans on
 * the founding-year mechanic more than the other three, which fits: the interior West was the last
 * part of the country to be settled.
 */
import type { RegionDef } from "../regionDef";

const bounds = { west: -125, east: -104, south: 32, north: 49, width: 136, height: 144 };

export const usWest: RegionDef = {
  id: "us-west",
  name: "American West",
  bounds,
  startYear: 1860,
  seed: 183004,

  land: [
    [
      [-123.2, 49.0],
      [-122.7, 48.4],
      [-122.5, 47.9],
      [-122.9, 48.0],
      [-122.5, 47.6],
      [-122.9, 47.3],
      [-122.9, 47.0],
      [-124.0, 46.8],
      [-124.1, 46.2],
      [-123.9, 45.9],
      [-124.05, 45.5],
      [-124.15, 44.6],
      [-124.3, 43.3],
      [-124.15, 42.4],
      [-124.0, 41.5],
      [-123.8, 40.4],
      [-123.7, 39.4],
      [-122.9, 38.2],
      [-122.5, 37.9],
      [-122.0, 37.5],
      [-122.3, 37.2],
      [-121.9, 36.6],
      [-120.9, 35.4],
      [-119.7, 34.4],
      [-118.5, 34.0],
      [-117.9, 33.6],
      [-117.25, 32.7],
      [-117.1, 32.0],
      [-104, 32.0],
      [-104, 49.0],
    ],
  ],

  lakes: [
    // Great Salt Lake, just northwest of Salt Lake City — a rounder, elongated N-S polygon (more
    // vertices than a first pass, which read as a thin rectangle at overview zoom).
    [
      [-112.55, 41.75],
      [-112.3, 41.72],
      [-112.15, 41.55],
      [-112.05, 41.3],
      [-112.1, 41.05],
      [-112.25, 40.85],
      [-112.45, 40.78],
      [-112.65, 40.85],
      [-112.8, 41.05],
      [-112.85, 41.3],
      [-112.78, 41.55],
      [-112.65, 41.68],
    ],
  ],

  rivers: [
    // Sacramento: Shasta foothills through Sacramento to the Bay delta.
    [
      [-122.3, 40.7],
      [-122.0, 39.7],
      [-121.7, 39.0],
      [-121.4944, 38.5816],
      [-121.8, 38.2],
      [-122.0, 38.05],
    ],
  ],

  mountains: [
    {
      name: "Sierra Nevada",
      ridge: [
        [-118.4, 35.6],
        [-119.0, 36.6],
        [-119.5, 37.7],
        [-120.0, 39.1],
        [-120.3, 40.3],
      ],
      peakElevation: 8,
      radiusTiles: 5,
    },
    {
      // Colorado/Wyoming/Idaho/Montana per the review brief — extended north from the original
      // Idaho endpoint into Montana (SPEC's regional table's north edge, lat 49).
      name: "Rocky Mountains",
      ridge: [
        [-105.3, 36.3],
        [-105.7, 37.5],
        [-105.5, 39.1],
        [-106.3, 41.0],
        [-107.5, 43.0],
        [-113.0, 45.5],
        [-113.8, 47.0],
        [-113.5, 48.6],
      ],
      peakElevation: 9,
      radiusTiles: 8,
    },
    {
      name: "Cascades",
      ridge: [
        [-121.8, 44.0],
        [-121.7, 45.4],
        [-121.5, 47.0],
        [-121.3, 48.5],
      ],
      peakElevation: 7,
      radiusTiles: 4,
    },
    {
      // The Wasatch Front, just east of Salt Lake City (review: the SLC area read as flat plains
      // with no mountains at all). Kept narrow (radiusTiles 3) and centered ~0.25° east of SLC's
      // own longitude so the city itself lands in the valley, not on the ridge.
      name: "Wasatch Range",
      ridge: [
        [-111.85, 39.0],
        [-111.7, 40.0],
        [-111.6, 40.9],
        [-111.75, 41.7],
      ],
      peakElevation: 8,
      radiusTiles: 4,
    },
  ],

  // Great Basin / American Southwest desert (review: Salt Lake City's surroundings read as green
  // plains — should be mostly desert). Covers Nevada, Utah, Arizona, and the SE California desert,
  // staying west of the Rockies' main ridge and east of the Sierra Nevada / coastal California and
  // Pacific Northwest so those stay non-desert (elevation still wins inside high mountain ranges
  // regardless of this moisture penalty, so the Rockies/Wasatch/Sierra peaks stay mountain/hills).
  aridZones: [
    {
      polygon: [
        [-120.3, 42.0],
        [-111.0, 42.0],
        [-107.5, 41.0],
        [-105.5, 37.0],
        [-105.0, 32.0],
        [-114.5, 32.0],
        [-116.3, 33.0],
        [-118.3, 35.3],
        [-120.3, 39.0],
      ],
    },
  ],

  resourceZones: [
    {
      name: "Central Valley farmland",
      types: ["farm"],
      polygon: [
        [-122.5, 36.5],
        [-121.0, 36.5],
        [-121.0, 40.5],
        [-122.5, 40.5],
      ],
    },
    {
      name: "Rockies coal",
      types: ["coalMine"],
      polygon: [
        [-107.0, 38.5],
        [-104.5, 38.5],
        [-104.5, 42.0],
        [-107.0, 42.0],
      ],
    },
    {
      name: "High Plains ranching",
      types: ["ranch"],
      polygon: [
        [-106.5, 37.5],
        [-104.0, 37.5],
        [-104.0, 43.5],
        [-106.5, 43.5],
      ],
    },
    {
      name: "Southern California oil",
      types: ["oilWell"],
      polygon: [
        [-119.0, 34.0],
        [-117.5, 34.0],
        [-117.5, 35.0],
        [-119.0, 35.0],
      ],
    },
  ],

  cities: [
    { name: "San Francisco", lon: -122.4194, lat: 37.7749, tier: "city", population: 56_000 },
    { name: "Sacramento", lon: -121.4944, lat: 38.5816, tier: "town", population: 13_785 },
    { name: "Los Angeles", lon: -118.2437, lat: 34.0522, tier: "village", population: 4_385 },
    { name: "San Diego", lon: -117.1611, lat: 32.7157, tier: "village", population: 1_000 },
    { name: "Portland", lon: -122.6765, lat: 45.5152, tier: "village", population: 2_874 },
    { name: "Seattle", lon: -122.3321, lat: 47.6062, tier: "village", population: 1_000 },
    { name: "Salt Lake City", lon: -111.891, lat: 40.7608, tier: "town", population: 8_236 },
    { name: "Denver", lon: -104.9903, lat: 39.7392, tier: "village", population: 4_749 },
    {
      name: "Reno",
      lon: -119.8138,
      lat: 39.5296,
      tier: "village",
      population: 1_000,
      foundingYear: 1868,
    },
    {
      name: "Phoenix",
      lon: -112.074,
      lat: 33.4484,
      tier: "village",
      population: 1_000,
      foundingYear: 1868,
    },
    { name: "Tucson", lon: -110.9747, lat: 32.2217, tier: "village", population: 1_000 },
    { name: "Santa Fe", lon: -105.9378, lat: 35.687, tier: "village", population: 4_635 },
    { name: "Albuquerque", lon: -106.6504, lat: 35.0844, tier: "village", population: 1_600 },
    {
      name: "Boise",
      lon: -116.2023,
      lat: 43.615,
      tier: "village",
      population: 1_000,
      foundingYear: 1863,
    },
    {
      name: "Cheyenne",
      lon: -104.802,
      lat: 41.14,
      tier: "village",
      population: 1_000,
      foundingYear: 1867,
    },
    {
      name: "Spokane",
      lon: -117.426,
      lat: 47.6588,
      tier: "village",
      population: 1_000,
      foundingYear: 1871,
    },
  ],
};
