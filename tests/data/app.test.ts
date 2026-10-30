import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APP_VERSION } from "../../src/data/app";

describe("app identity (Phase 71)", () => {
  it("APP_VERSION matches package.json", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
    expect(APP_VERSION).toBe(pkg.version);
  });

  it("the Android app id is the same in capacitor.config.ts and build.gradle", () => {
    const cap = readFileSync("capacitor.config.ts", "utf8");
    const gradle = readFileSync("android/app/build.gradle", "utf8");
    expect(cap).toContain('appId: "com.davidc.ironandsteam"');
    expect(gradle).toContain('applicationId "com.davidc.ironandsteam"');
    expect(gradle).toContain('namespace = "com.davidc.ironandsteam"');
  });
});
