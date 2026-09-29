/** PLAN Phase 19 / STYLE §9.1: every locomotive and car renders without throwing at heights 24, 48
 * and 96, aspect ratios are stable, the cache hits, and the Whyte parser / glyph behave. */
import { beforeEach, describe, expect, it } from "vitest";
import { CARGO_TYPES } from "../../src/data/cargo";
import { LOCOMOTIVES } from "../../src/data/trains";
import {
  artCacheSize,
  carSideCanvas,
  carWidthUnits,
  clearArtCache,
  consistSideCanvas,
  locoSideCanvas,
  locoWidthUnits,
  parseWhyte,
  setArtCanvasFactory,
  wheelArrangementGlyph,
  type EraBucket,
} from "../../src/render/art";
import { steamLivery } from "../../src/render/art/livery";
import { steamLayout } from "../../src/render/art/steam";

let calls = 0;
function fakeCtx(): CanvasRenderingContext2D {
  const target: Record<string, unknown> = {};
  return new Proxy(target, {
    get(t, k: string) {
      if (k in t) return t[k];
      return () => {
        calls++;
        return { addColorStop() {} };
      };
    },
    set(t, k: string, v) {
      t[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
  calls = 0;
  clearArtCache();
  setArtCanvasFactory((w, h) => {
    const ctx = fakeCtx();
    return { width: w, height: h, getContext: () => ctx } as unknown as OffscreenCanvas;
  });
});

const ERAS: EraBucket[] = ["early", "mid", "modern"];

describe("Whyte parser and glyph", () => {
  it("parses 3- and 4-part designations", () => {
    expect(parseWhyte("Pacific 4-6-2")).toEqual({ lead: 4, groups: [6], trail: 2 });
    expect(parseWhyte("Articulated 4-8-8-4")).toEqual({ lead: 4, groups: [8, 8], trail: 4 });
    expect(parseWhyte("Streamliner Diesel")).toBeNull();
  });
  it("draws one small circle per leading/trailing axle and one large per driving axle", () => {
    const svg = wheelArrangementGlyph("4-6-2");
    const r = [...svg.matchAll(/r="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(r.filter((v) => v < 3)).toHaveLength(3);
    expect(r.filter((v) => v > 3)).toHaveLength(3);
    expect(wheelArrangementGlyph("4-8-8-4").match(/<circle/g)).toHaveLength(2 + 8 + 2);
  });
});

describe("side views", () => {
  it("renders every locomotive at heights 24/48/96 with a stable aspect ratio", () => {
    for (const def of LOCOMOTIVES) {
      const ratio = locoWidthUnits(def) / 24;
      for (const h of [24, 48, 96]) {
        const c = locoSideCanvas(def, h);
        expect(c.height).toBe(h);
        expect(Math.abs(c.width / c.height - ratio)).toBeLessThan(0.05);
      }
    }
    expect(calls).toBeGreaterThan(1000);
  });
  it("renders every car type × era at 24/48/96, empty and full", () => {
    for (const cargo of CARGO_TYPES)
      for (const era of ERAS)
        for (const h of [24, 48, 96])
          for (const fill of [0, 1]) {
            const c = carSideCanvas(cargo, era, fill, h);
            expect(c.width).toBeGreaterThan(h / 2);
            expect(carWidthUnits(cargo, era)).toBeGreaterThan(15);
          }
  });
  it("caches by id + size", () => {
    const def = LOCOMOTIVES[0]!;
    const a = locoSideCanvas(def, 48);
    const n = artCacheSize();
    expect(locoSideCanvas(def, 48)).toBe(a);
    expect(artCacheSize()).toBe(n);
    expect(locoSideCanvas(def, 96)).not.toBe(a);
  });
  it("builds a consist canvas wider than its locomotive", () => {
    const c = consistSideCanvas(
      {
        locoModelId: "pacific-4-6-2",
        year: 1920,
        cars: [
          { cargoType: "passengers", fill01: 1 },
          { cargoType: "mail", fill01: 0.5 },
        ],
      },
      48,
    );
    expect(c.width).toBeGreaterThan(
      locoSideCanvas(
        LOCOMOTIVES.find((l) => l.id === "pacific-4-6-2")!,
        48,
      ).width * 2,
    );
  });
  it("gives every roster model a distinct livery/shape identity", () => {
    const widths = new Set(
      LOCOMOTIVES.filter((l) => l.type !== "steam").map((l) => locoWidthUnits(l)),
    );
    expect(widths.size).toBe(LOCOMOTIVES.filter((l) => l.type !== "steam").length);
    expect(steamLivery({ introYear: 1848 }).body).not.toBe(steamLivery({ introYear: 1912 }).body);
  });

  it("steam engines have no long unsupported nose (PLAN 23B)", () => {
    for (const def of LOCOMOTIVES.filter((l) => l.type === "steam")) {
      const lay = steamLayout(def);
      // The smokebox front is x = 0; the frontmost wheel edge is a lead-truck wheel or the front driver.
      const truck = lay.leadAxles.length > 0 ? Math.max(...lay.leadAxles) + 2 : -Infinity;
      const driver = (lay.drivers[0]![0] as number) + lay.D / 2;
      expect(-Math.max(truck, driver), def.name).toBeLessThanOrEqual(6);
    }
  });
  it("puts the front driver of a 0-4-0 and 2-2-0 under the cylinder block", () => {
    for (const id of ["grasshopper-0-4-0", "planet-2-2-0"]) {
      const def = LOCOMOTIVES.find((l) => l.id === id);
      if (!def) throw new Error(`missing ${id}`);
      const lay = steamLayout(def);
      const cyl = lay.cylinders[0]!;
      const x = lay.drivers[0]![0] as number;
      expect(x + lay.D / 2).toBeGreaterThan(cyl.back);
    }
  });
});
