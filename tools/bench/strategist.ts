/**
 * Phase 82: the Strategist bot. `npx tsx tools/bench/strategist.ts [region] [startYear] [difficulty] [endYear] [seed]`
 * Same arguments and output as strongPlayer.ts (so the bench drivers and summaries work); plus a STRATEGIST line.
 */
process.env["BOT"] = "strategist";
await import("./strongPlayer");
