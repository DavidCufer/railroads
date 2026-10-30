import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** The text under a `## <heading>` of docs/store/listing.md, up to the next `## `. */
function section(md: string, heading: string): string {
  const start = md.indexOf(`## ${heading}`);
  if (start < 0) throw new Error(`no section ${heading}`);
  const rest = md.slice(start).split("\n").slice(1).join("\n");
  return rest.split(/\n## /)[0]!.trim();
}

describe("Play listing text limits (Phase 71)", () => {
  const md = readFileSync("docs/store/listing.md", "utf8");
  it("title <= 30, short <= 80, full <= 4000, notes <= 500", () => {
    expect(section(md, "Title (max 30)").length).toBeLessThanOrEqual(30);
    expect(section(md, "Short description (max 80)").length).toBeLessThanOrEqual(80);
    expect(section(md, "Full description (max 4000)").length).toBeLessThanOrEqual(4000);
    expect(section(md, "Release notes — 1.0 (max 500)").length).toBeLessThanOrEqual(500);
  });
});
