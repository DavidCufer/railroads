/** Livery colour sets per locomotive model / car type × era (STYLE §9.3, §9.4). Used by the
 * side-view painters *and* the top-down map sprites so a train looks the same in both. */

import { locomotiveById, type LocomotiveDef } from "../../data/trains";
import type { CargoType } from "../../data/cargo";

export type EraBucket = "early" | "mid" | "modern";

/** early < 1870, mid 1870–1935, modern > 1935 (STYLE §9.4). */
export function eraBucket(year: number): EraBucket {
  return year < 1870 ? "early" : year <= 1935 ? "mid" : "modern";
}

// --- Steam --------------------------------------------------------------------------------------

export interface SteamLivery {
  era: 0 | 1 | 2;
  body: string;
  lining: string;
  wheel: string;
  tyre: string;
  brass: string;
  smokebox: string;
  smokeboxFront: string;
  cab: string;
  cabRoof: string;
  tender: string;
  tenderLining: string;
  frame: string;
  coal: string;
  glass: string;
  brassDomes: boolean;
  woodCab: boolean;
}

const BRASS = "#C9A23A";
const GRAPHITE = "#2A2D31";
const PAPER = "#F4F1E8";

export function steamLivery(def: Pick<LocomotiveDef, "introYear">): SteamLivery {
  const y = def.introYear;
  if (y <= 1860) {
    return {
      era: 0,
      body: "#2F5D3A",
      lining: BRASS,
      wheel: "#9E2B25",
      tyre: "#6B1A17",
      brass: BRASS,
      smokebox: GRAPHITE,
      smokeboxFront: GRAPHITE,
      cab: "#7A4A2A",
      cabRoof: "#3F2B1D",
      tender: "#2F5D3A",
      tenderLining: BRASS,
      frame: "#2B2A28",
      coal: "#17181a",
      glass: PAPER,
      brassDomes: true,
      woodCab: true,
    };
  }
  if (y < 1925) {
    return {
      era: 1,
      body: "#1F2226",
      lining: "#B0362D",
      wheel: "#565C64",
      tyre: "#E9E4D8",
      brass: BRASS,
      smokebox: GRAPHITE,
      smokeboxFront: GRAPHITE,
      cab: "#1F2226",
      cabRoof: "#15171a",
      tender: "#1F2226",
      tenderLining: "#B0362D",
      frame: "#1A1C1F",
      coal: "#131416",
      glass: PAPER,
      brassDomes: y < 1900,
      woodCab: false,
    };
  }
  return {
    era: 2,
    body: "#1F2226",
    lining: "#B0362D",
    wheel: "#5B6169",
    tyre: "#F4F1E8",
    brass: BRASS,
    smokebox: "#20232a",
    smokeboxFront: "#9AA3AF",
    cab: "#1F2226",
    cabRoof: "#15171a",
    tender: "#1F2226",
    tenderLining: "#9AA3AF",
    frame: "#1A1C1F",
    coal: "#131416",
    glass: PAPER,
    brassDomes: false,
    woodCab: false,
  };
}

// --- Diesel / electric ----------------------------------------------------------------------------

export interface PowerLivery {
  body: string;
  /** Second body tone (lower band / nose). */
  band: string;
  /** Sweeping stripe / end stripe / nose tip. */
  accent: string;
  roof: string;
  trim: string;
  glass: string;
  underframe: string;
  handrail: string;
}

const PAPER_GLASS = "#A9BFCB";
const CREAM = "#EDE0C4";
const WHITE_BODY = "#E9E4D8";
const STEEL = "#46637F";
const INK = "#243447";
const SIGNAL = "#B8402B";

const POWER_LIVERY: Record<string, PowerLivery> = {
  "early-electric": {
    body: "#2D5236",
    band: "#25432D",
    accent: CREAM,
    roof: "#22392A",
    trim: "#1B1E21",
    glass: PAPER_GLASS,
    underframe: "#1E2124",
    handrail: BRASS,
  },
  "streamliner-diesel": {
    body: SIGNAL,
    band: CREAM,
    accent: BRASS,
    roof: "#8E2F1F",
    trim: "#2A2D31",
    glass: PAPER_GLASS,
    underframe: "#26282B",
    handrail: "#D9D3C2",
  },
  "e-unit-electric": {
    body: WHITE_BODY,
    band: STEEL,
    accent: SIGNAL,
    roof: "#B8B4A8",
    trim: "#2A2D31",
    glass: PAPER_GLASS,
    underframe: "#26282B",
    handrail: "#D9D3C2",
  },
  "cab-unit-diesel": {
    body: STEEL,
    band: CREAM,
    accent: "#D9A441",
    roof: "#38506A",
    trim: "#2A2D31",
    glass: PAPER_GLASS,
    underframe: "#26282B",
    handrail: "#D9D3C2",
  },
  "road-switcher-diesel": {
    body: INK,
    band: "#1B2836",
    accent: CREAM,
    roof: "#1B2836",
    trim: "#15181c",
    glass: PAPER_GLASS,
    underframe: "#1C1F23",
    handrail: BRASS,
  },
  "modern-electric": {
    body: WHITE_BODY,
    band: STEEL,
    accent: SIGNAL,
    roof: "#BDB9AC",
    trim: "#2A2D31",
    glass: "#2C3E50",
    underframe: "#26282B",
    handrail: "#D9D3C2",
  },
  "high-horsepower-diesel": {
    body: INK,
    band: "#1B2836",
    accent: BRASS,
    roof: "#2E4359",
    trim: "#15181c",
    glass: PAPER_GLASS,
    underframe: "#1C1F23",
    handrail: BRASS,
  },
  "heavy-diesel": {
    body: INK,
    band: "#33465A",
    accent: SIGNAL,
    roof: "#2E4359",
    trim: "#15181c",
    glass: "#2C3E50",
    underframe: "#1C1F23",
    handrail: BRASS,
  },
  "high-speed-trainset": {
    body: WHITE_BODY,
    band: STEEL,
    accent: SIGNAL,
    roof: "#C9C5B8",
    trim: "#2A2D31",
    glass: "#2C3E50",
    underframe: "#26282B",
    handrail: "#D9D3C2",
  },
  "heavy-freight-electric": {
    body: STEEL,
    band: WHITE_BODY,
    accent: SIGNAL,
    roof: "#38506A",
    trim: "#15181c",
    glass: "#2C3E50",
    underframe: "#1C1F23",
    handrail: "#D9D3C2",
  },
};

export function powerLivery(id: string): PowerLivery {
  return POWER_LIVERY[id] ?? (POWER_LIVERY["road-switcher-diesel"] as PowerLivery);
}

/** Main body + accent colour of any locomotive, for the top-down map sprites. */
export function locoMapColors(def: LocomotiveDef): { body: string; accent: string; dark: string } {
  if (def.type === "steam") {
    const l = steamLivery(def);
    return { body: l.body, accent: l.era === 0 ? l.brass : l.lining, dark: l.smokebox };
  }
  const l = powerLivery(def.id);
  return { body: l.body, accent: l.accent, dark: l.trim };
}

export function locoMapColorsById(id: string): { body: string; accent: string; dark: string } {
  const def = locomotiveById(id);
  return def ? locoMapColors(def) : { body: "#555", accent: "#aaa", dark: "#222" };
}

// --- Cars ------------------------------------------------------------------------------------------

export interface CarLivery {
  body: string;
  /** Roof / secondary tone. */
  roof: string;
  trim: string;
  /** Load colour for open cars (heap). */
  load: string;
}

const CAR_BODY: Record<CargoType, (e: EraBucket) => { body: string; roof: string; load: string }> =
  {
    passengers: (e) =>
      e === "modern"
        ? { body: CREAM, roof: "#C9BFA3", load: "#000" }
        : { body: "#6E2A2A", roof: "#3F2A22", load: "#000" },
    mail: () => ({ body: SIGNAL, roof: "#7C2C1E", load: "#000" }),
    coal: () => ({ body: "#2A2C30", roof: "#1E2023", load: "#17181a" }),
    ironOre: () => ({ body: "#8A4A2C", roof: "#5E3320", load: "#7A3B22" }),
    wood: () => ({ body: "#5A4632", roof: "#3F3123", load: "#6B4A2B" }),
    grain: (e) =>
      e === "modern"
        ? { body: "#8E939A", roof: "#6C7178", load: "#000" }
        : { body: "#B58A3A", roof: "#7A5A26", load: "#000" },
    livestock: () => ({ body: "#8A4A32", roof: "#5E3220", load: "#000" }),
    oil: () => ({ body: "#222528", roof: "#15171a", load: "#000" }),
    steel: () => ({ body: "#54606C", roof: "#3A444E", load: "#9AA3AF" }),
    lumber: () => ({ body: "#5A4632", roof: "#3F3123", load: "#C9A46A" }),
    food: () => ({ body: CREAM, roof: "#B9AD90", load: "#000" }),
    goods: () => ({ body: "#8B3A2B", roof: "#5E271D", load: "#000" }),
    fuel: () => ({ body: "#8A9098", roof: "#5F656C", load: "#000" }),
    silverOre: () => ({ body: "#5E646C", roof: "#40454B", load: "#AEB4BC" }),
    silverBars: () => ({ body: "#3C4652", roof: "#262D36", load: "#000" }),
    uraniumOre: () => ({ body: "#566B3A", roof: "#3C4B28", load: "#8FB04A" }),
    enrichedUranium: () => ({ body: "#4A4F55", roof: "#2D3136", load: "#000" }),
  };

export function carLivery(cargo: CargoType, era: EraBucket): CarLivery {
  const c = CAR_BODY[cargo](era);
  return {
    body: c.body,
    roof: c.roof,
    trim: era === "early" ? "#3A2A20" : "#1E2023",
    load: c.load,
  };
}

export const GLASS_LIGHT = PAPER;
export const BRASS_TONE = BRASS;
export const WHEEL_GREY = "#3B4047";
