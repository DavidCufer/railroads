/**
 * Phase 79 bench helper (import for the side effect; bench only, nothing under src/ changes). The data tables are rewritten in
 * place before any run starts.
 *   P79_DIFF="<difficulty>:key=value,key=hard"  sets fields of DIFFICULTY[<difficulty>]; value `hard` copies Hard's figure.
 *   P79_FARE=<f> / P79_RATE=<f> / P79_WAGE=<f>   scale the real passenger-fare / freight-rate / real-wage anchor tables.
 *   P79_ANCH="<table>:<year>=<value>,..."          set single anchors (table: trips | fare | rate | wage | range | trainkmh).
 */
import { DIFFICULTY } from "../../src/data/finance";
import {
  ERA_TRAIN_KMH_ANCHORS,
  FREIGHT_REAL_RATE_ANCHORS,
  PASSENGER_REAL_FARE_ANCHORS,
  REAL_WAGE_ANCHORS,
  TRAVEL_RANGE_ANCHORS,
  TRIPS_PER_HEAD_ANCHORS,
} from "../../src/data/economy";

type Table = [number, number][];
const TABLES: Record<string, Table> = {
  trips: TRIPS_PER_HEAD_ANCHORS as unknown as Table,
  fare: PASSENGER_REAL_FARE_ANCHORS as unknown as Table,
  rate: FREIGHT_REAL_RATE_ANCHORS as unknown as Table,
  wage: REAL_WAGE_ANCHORS as unknown as Table,
  range: TRAVEL_RANGE_ANCHORS as unknown as Table,
  trainkmh: ERA_TRAIN_KMH_ANCHORS as unknown as Table,
};

if (process.env["P79_DIFF"]) {
  const [which, rest] = process.env["P79_DIFF"].split(":") as [string, string];
  const target = DIFFICULTY[which as "normal"] as unknown as Record<string, number>;
  const hard = DIFFICULTY.hard as unknown as Record<string, number>;
  for (const kv of (rest ?? "").split(",").filter(Boolean)) {
    const [k, v] = kv.split("=") as [string, string];
    target[k] = v === "hard" ? (hard[k] as number) : Number(v);
  }
}
for (const [env, name] of [
  ["P79_FARE", "fare"],
  ["P79_RATE", "rate"],
  ["P79_WAGE", "wage"],
] as const) {
  const f = process.env[env];
  if (f) for (const a of TABLES[name]!) a[1] *= Number(f);
}
if (process.env["P79_ANCH"]) {
  const [name, rest] = process.env["P79_ANCH"].split(":") as [string, string];
  const table = TABLES[name]!;
  for (const kv of (rest ?? "").split(",").filter(Boolean)) {
    const [y, v] = kv.split("=").map(Number) as [number, number];
    const row = table.find((a) => a[0] === y);
    if (row) row[1] = v;
    else {
      table.push([y, v]);
      table.sort((a, b) => a[0] - b[0]);
    }
  }
}
