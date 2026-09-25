/**
 * `tools/mapgen` CLI (SPEC §4.3 step 5): `npm run mapgen -- <regionId>` builds one region and
 * writes `src/data/regions/<regionId>.json`. Run via `tsx` (added as a dev-only dependency —
 * Node's own native TS stripping requires explicit `.ts`/`.js` extensions on every relative
 * import, which the rest of this codebase's bundler-style extensionless imports don't use).
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildRegion } from "./build";
import { usEast } from "./regions/us-east";
import { gb } from "./regions/gb";
import { centralEu } from "./regions/central-eu";
import { usWest } from "./regions/us-west";
import type { RegionDef } from "./regionDef";

const REGIONS: Record<string, RegionDef> = {
  "us-east": usEast,
  gb: gb,
  "central-eu": centralEu,
  "us-west": usWest,
};

function main(): void {
  const regionId = process.argv[2];
  if (!regionId) {
    console.error(
      `Usage: npm run mapgen -- <regionId>\nAvailable: ${Object.keys(REGIONS).join(", ")}`,
    );
    process.exit(1);
  }
  const def = REGIONS[regionId];
  if (!def) {
    console.error(`Unknown region "${regionId}". Available: ${Object.keys(REGIONS).join(", ")}`);
    process.exit(1);
  }

  const json = buildRegion(def);
  const serialized = JSON.stringify(json);
  const sizeKb = (Buffer.byteLength(serialized) / 1024).toFixed(1);

  const here = path.dirname(fileURLToPath(import.meta.url));
  const outPath = path.resolve(here, "..", "..", "src", "data", "regions", `${regionId}.json`);
  writeFileSync(outPath, serialized);

  console.log(`Wrote ${outPath} (${sizeKb} KB)`);
  console.log(
    `  cities: ${json.cities.length}, industries: ${json.industries.length}, rivers: ${json.rivers.length}`,
  );
}

main();
