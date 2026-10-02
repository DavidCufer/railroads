/**
 * SVG icon set (STYLE §5): inline strings, 24×24 viewBox, 2px strokes, `currentColor` — no emoji
 * anywhere in the UI (STYLE §1). `icon()` builds a small `<span>` wrapper so callers can drop icons
 * into `h()`-built trees like any other node; `cargoIcon()` builds the tinted-tile cargo pictogram
 * (STYLE §5: icon in the full cargo color, on a tile tinted at 25% opacity).
 *
 * A few icons (check, warning, wrench, water, trophy, arrowUp, arrowFlat, shed, edit, signal) extend
 * STYLE §5's named tool list — that list covers the toolbar; these replace the remaining emoji
 * found elsewhere in the UI (status text, station badges, the goal-celebration dialog), per §1's
 * "no emoji in the UI" rule. Small, documented deviation per CLAUDE.md/STYLE.md's own instructions.
 * `signal` matches the map's waiting-train dot (SPEC §7.5: "a small red signal icon") for the Train
 * panel's waiting-reason row.
 */
import { CARGO, type CargoType } from "../data/cargo";

export type IconName =
  | "track"
  | "doubleTrack"
  | "electrify"
  | "station"
  | "bulldoze"
  | "info"
  | "trains"
  | "news"
  | "goals"
  | "finance"
  | "menu"
  | "close"
  | "back"
  | "dice"
  | "settings"
  | "sound"
  | "soundOff"
  | "play"
  | "pause"
  | "fastForward"
  | "check"
  | "warning"
  | "wrench"
  | "water"
  | "trophy"
  | "arrowUp"
  | "arrowFlat"
  | "shed"
  | "edit"
  | "signal"
  | "coin"
  | "chevronRight"
  | "arrowDown"
  | "steam"
  | "diesel"
  | "roster"
  | "depot"
  | "terminal"
  | "village"
  | "town"
  | "city"
  | "metropolis"
  | "factory"
  | "cargo"
  | "hammer"
  | "save"
  | "load"
  | "quit"
  | "layers"
  | "target"
  | "flame"
  | "palette"
  | "trendUp"
  | "map"
  | "mapPin"
  | "hotel"
  | "warehouse"
  | "snowflake"
  | "freightYard"
  | "pens"
  | "waterTower"
  | "lock"
  | "tags"
  | "trash"
  | "gauge"
  | "power"
  | "plus"
  | "minus"
  | "calendar"
  | "reliability"
  | "clock"
  | "arrowRight"
  | "arrowLeft"
  | "swap"
  | "anchor";

const STROKE =
  'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

const ICONS: Record<IconName, string> = {
  track: `<svg viewBox="0 0 24 24" ${STROKE}><line x1="3" y1="8" x2="21" y2="8"/><line x1="3" y1="16" x2="21" y2="16"/><line x1="6" y1="6" x2="6" y2="18"/><line x1="11" y1="6" x2="11" y2="18"/><line x1="16" y1="6" x2="16" y2="18"/></svg>`,
  doubleTrack: `<svg viewBox="0 0 24 24" ${STROKE}><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="3" y1="14" x2="21" y2="14"/><line x1="3" y1="18" x2="21" y2="18"/><line x1="7" y1="4" x2="7" y2="20"/><line x1="17" y1="4" x2="17" y2="20"/></svg>`,
  electrify: `<svg viewBox="0 0 24 24" ${STROKE} stroke-linejoin="round"><polygon points="13,2 5,14 11,14 9,22 19,10 12,10"/></svg>`,
  station: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M3 9 L12 3 L21 9"/><line x1="5" y1="9" x2="5" y2="20"/><line x1="19" y1="9" x2="19" y2="20"/><line x1="3" y1="20" x2="21" y2="20"/><line x1="12" y1="9" x2="12" y2="20"/></svg>`,
  bulldoze: `<svg viewBox="0 0 24 24" ${STROKE}><rect x="4" y="4" width="16" height="16" rx="3"/><line x1="8" y1="8" x2="16" y2="16"/><line x1="16" y1="8" x2="8" y2="16"/></svg>`,
  info: `<svg viewBox="0 0 24 24" ${STROKE}><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="7.5" r="1.1" fill="currentColor" stroke="none"/></svg>`,
  trains: `<svg viewBox="0 0 24 24" ${STROKE}><rect x="4" y="8" width="14" height="8" rx="2"/><line x1="7" y1="5" x2="7" y2="8"/><circle cx="8" cy="18" r="1.6" fill="currentColor" stroke="none"/><circle cx="14" cy="18" r="1.6" fill="currentColor" stroke="none"/><line x1="18" y1="12" x2="21" y2="12"/></svg>`,
  news: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M4 4h13a2 2 0 0 1 2 2v13a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V4z"/><line x1="7" y1="8" x2="15" y2="8"/><line x1="7" y1="11" x2="15" y2="11"/><line x1="7" y1="14" x2="12" y2="14"/></svg>`,
  goals: `<svg viewBox="0 0 24 24" ${STROKE}><line x1="5" y1="3" x2="5" y2="21"/><path d="M5 4h13l-4 4 4 4H5"/></svg>`,
  finance: `<svg viewBox="0 0 24 24" ${STROKE}><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.3 9.6c0-1.4 1.3-2.3 2.8-2.3 1.6 0 2.8.8 2.8 2s-1.1 1.7-2.8 2c-1.6.3-2.8.9-2.8 2.1 0 1.3 1.2 2.1 2.8 2.1 1.5 0 2.8-.8 2.8-2.1"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" ${STROKE}><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>`,
  close: `<svg viewBox="0 0 24 24" ${STROKE}><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>`,
  back: `<svg viewBox="0 0 24 24" ${STROKE}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="11 6 5 12 11 18"/></svg>`,
  dice: `<svg viewBox="0 0 24 24" ${STROKE}><rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.5" cy="8.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="8.5" cy="15.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" stroke="none"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" ${STROKE}><circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M4.2 4.2l1.8 1.8M17.9 17.9l1.8 1.8M3 12h2.5M18.5 12H21M4.2 19.8l1.8-1.8M17.9 6.1l1.8-1.8"/></svg>`,
  sound: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M4 10v4h4l5 4V6l-5 4H4z"/><path d="M16.2 9.2a4 4 0 0 1 0 5.6"/><path d="M18.8 6.8a7.6 7.6 0 0 1 0 10.4"/></svg>`,
  soundOff: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M4 10v4h4l5 4V6l-5 4H4z"/><line x1="16" y1="9" x2="21" y2="15"/><line x1="21" y1="9" x2="16" y2="15"/></svg>`,
  play: `<svg viewBox="0 0 24 24" ${STROKE} stroke-linejoin="round"><polygon points="6,4 20,12 6,20"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" ${STROKE}><line x1="8" y1="5" x2="8" y2="19"/><line x1="16" y1="5" x2="16" y2="19"/></svg>`,
  fastForward: `<svg viewBox="0 0 24 24" ${STROKE} stroke-linejoin="round"><polygon points="2,5 11,12 2,19"/><polygon points="12,5 21,12 12,19"/></svg>`,
  check: `<svg viewBox="0 0 24 24" ${STROKE}><polyline points="4 12 10 18 20 6"/></svg>`,
  warning: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M12 3 L22 20 H2 Z"/><line x1="12" y1="9" x2="12" y2="14"/><circle cx="12" cy="17.2" r="1" fill="currentColor" stroke="none"/></svg>`,
  wrench: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 1 5.4-5.4l-3 3-2-2z"/></svg>`,
  water: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M12 3c4 5 7 8.5 7 12a7 7 0 0 1-14 0c0-3.5 3-7 7-12z"/></svg>`,
  trophy: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M7 4h10v4a5 5 0 0 1-10 0V4z"/><path d="M7 5H4a3 3 0 0 0 3 5"/><path d="M17 5h3a3 3 0 0 1-3 5"/><line x1="12" y1="13" x2="12" y2="17"/><path d="M8 20h8"/><line x1="12" y1="17" x2="12" y2="20"/></svg>`,
  arrowUp: `<svg viewBox="0 0 24 24" ${STROKE}><line x1="12" y1="19" x2="12" y2="5"/><polyline points="6 11 12 5 18 11"/></svg>`,
  arrowFlat: `<svg viewBox="0 0 24 24" ${STROKE}><line x1="4" y1="12" x2="20" y2="12"/></svg>`,
  shed: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M3 11 L12 4 L21 11 V20 H3 Z"/><line x1="12" y1="4" x2="12" y2="20"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M4 20l1-4.5L15.5 5 19 8.5 8.5 19 4 20z"/><line x1="13.5" y1="6.5" x2="17" y2="10"/></svg>`,
  signal: `<svg viewBox="0 0 24 24" ${STROKE}><circle cx="12" cy="12" r="6" fill="currentColor" stroke="none"/></svg>`,
  coin: `<svg viewBox="0 0 24 24" ${STROKE}><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M9.6 10c0-1.1 1-1.8 2.4-1.8s2.4.7 2.4 1.7-.9 1.4-2.4 1.7c-1.4.3-2.4.8-2.4 1.8s1 1.7 2.4 1.7 2.4-.7 2.4-1.7"/></svg>`,
  chevronRight: `<svg viewBox="0 0 24 24" ${STROKE}><polyline points="9 5 16 12 9 19"/></svg>`,
  arrowDown: `<svg viewBox="0 0 24 24" ${STROKE}><line x1="12" y1="5" x2="12" y2="19"/><polyline points="6 13 12 19 18 13"/></svg>`,
  steam: `<svg viewBox="0 0 24 24" ${STROKE}><rect x="3" y="10" width="11" height="6" rx="1"/><rect x="14" y="7" width="6" height="9" rx="1"/><line x1="6" y1="10" x2="6" y2="6"/><circle cx="7" cy="18.5" r="1.5"/><circle cx="12" cy="18.5" r="1.5"/><circle cx="17.5" cy="18.5" r="1.5"/></svg>`,
  diesel: `<svg viewBox="0 0 24 24" ${STROKE}><rect x="3" y="8" width="18" height="8" rx="2"/><line x1="8" y1="8" x2="8" y2="16"/><rect x="11" y="5" width="6" height="3"/><circle cx="7" cy="18.5" r="1.5"/><circle cx="17" cy="18.5" r="1.5"/></svg>`,
  roster: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4z"/><path d="M5 17a3 3 0 0 1 3-3h11"/></svg>`,
  depot: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M4 20V11l8-6 8 6v9"/><rect x="9" y="14" width="6" height="6"/></svg>`,
  terminal: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M3 20V10c0-4 4-6 9-6s9 2 9 6v10"/><line x1="3" y1="20" x2="21" y2="20"/><line x1="8" y1="20" x2="8" y2="12"/><line x1="16" y1="20" x2="16" y2="12"/></svg>`,
  village: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M5 20v-8l5-4 5 4v8"/><path d="M15 20v-6l4-3 2 1.5V20"/><line x1="3" y1="20" x2="21" y2="20"/></svg>`,
  town: `<svg viewBox="0 0 24 24" ${STROKE}><rect x="4" y="10" width="6" height="10"/><rect x="10" y="6" width="6" height="14"/><path d="M16 12h4v8h-4"/><line x1="3" y1="20" x2="21" y2="20"/></svg>`,
  city: `<svg viewBox="0 0 24 24" ${STROKE}><rect x="4" y="9" width="5" height="11"/><rect x="9" y="4" width="6" height="16"/><rect x="15" y="11" width="5" height="9"/><line x1="11" y1="8" x2="13" y2="8"/><line x1="11" y1="12" x2="13" y2="12"/></svg>`,
  metropolis: `<svg viewBox="0 0 24 24" ${STROKE}><rect x="3" y="12" width="4" height="8"/><rect x="7" y="7" width="4" height="13"/><path d="M13 20V3l3 2 3-2v17"/><line x1="2" y1="20" x2="22" y2="20"/></svg>`,
  factory: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M3 20V10l6 3V10l6 3V6h4v14z"/><line x1="7" y1="20" x2="7" y2="17"/><line x1="12" y1="20" x2="12" y2="17"/></svg>`,
  cargo: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/></svg>`,
  hammer: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M14 4l6 6-3 1-2-2-8 9-3-3 9-8-2-2z"/></svg>`,
  save: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M5 4h11l3 3v13H5z"/><rect x="8" y="4" width="7" height="5"/><rect x="8" y="14" width="8" height="6"/></svg>`,
  load: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M3 8a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`,
  quit: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M9 4H5v16h4"/><line x1="10" y1="12" x2="20" y2="12"/><polyline points="16 8 20 12 16 16"/></svg>`,
  layers: `<svg viewBox="0 0 24 24" ${STROKE}><polygon points="12,4 21,9 12,14 3,9"/><polyline points="3 13.5 12 18.5 21 13.5"/></svg>`,
  target: `<svg viewBox="0 0 24 24" ${STROKE}><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/></svg>`,
  flame: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M12 3c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-10z"/></svg>`,
  palette: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M12 4a8 8 0 1 0 0 16c1.5 0 2-1 1.5-2s0-2 1.5-2h2a3 3 0 0 0 3-3c0-5-4-9-8-9z"/><circle cx="8" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="8" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="10" r="1" fill="currentColor" stroke="none"/></svg>`,
  trendUp: `<svg viewBox="0 0 24 24" ${STROKE}><polyline points="3 17 9 11 13 15 21 7"/><polyline points="15 7 21 7 21 13"/></svg>`,
  map: `<svg viewBox="0 0 24 24" ${STROKE}><polygon points="3,6 9,4 15,6 21,4 21,18 15,20 9,18 3,20"/><line x1="9" y1="4" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="20"/></svg>`,
  mapPin: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z"/><circle cx="12" cy="10" r="2"/></svg>`,
  hotel: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M3 19V7M3 14h18v5M3 11h8a3 3 0 0 1 3 3"/><circle cx="7" cy="9" r="1.5"/></svg>`,
  warehouse: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M3 10l9-6 9 6v10H3z"/><rect x="8" y="12" width="8" height="8"/><line x1="8" y1="16" x2="16" y2="16"/></svg>`,
  snowflake: `<svg viewBox="0 0 24 24" ${STROKE}><line x1="12" y1="3" x2="12" y2="21"/><line x1="4.2" y1="7.5" x2="19.8" y2="16.5"/><line x1="4.2" y1="16.5" x2="19.8" y2="7.5"/><polyline points="9.5 4.5 12 7 14.5 4.5"/><polyline points="9.5 19.5 12 17 14.5 19.5"/></svg>`,
  freightYard: `<svg viewBox="0 0 24 24" ${STROKE}><line x1="3" y1="7" x2="21" y2="7"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="17" x2="21" y2="17"/><rect x="8" y="9" width="8" height="6" fill="var(--ink-800)"/></svg>`,
  pens: `<svg viewBox="0 0 24 24" ${STROKE}><line x1="3" y1="20" x2="21" y2="20"/><line x1="5" y1="20" x2="5" y2="9"/><line x1="12" y1="20" x2="12" y2="9"/><line x1="19" y1="20" x2="19" y2="9"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="16" x2="21" y2="16"/></svg>`,
  waterTower: `<svg viewBox="0 0 24 24" ${STROKE}><rect x="6" y="4" width="12" height="7" rx="2"/><line x1="8" y1="11" x2="6" y2="21"/><line x1="16" y1="11" x2="18" y2="21"/><line x1="12" y1="11" x2="12" y2="21"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" ${STROKE}><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`,
  gauge: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M4 17a8 8 0 1 1 16 0"/><line x1="12" y1="17" x2="16.5" y2="10.5"/><circle cx="12" cy="17" r="1.2" fill="currentColor" stroke="none"/></svg>`,
  power: `<svg viewBox="0 0 24 24" ${STROKE}><polygon points="13,2 5,14 11,14 9,22 19,10 12,10"/></svg>`,
  minus: `<svg viewBox="0 0 24 24" ${STROKE}><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" ${STROKE}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" ${STROKE}><rect x="4" y="5" width="16" height="15" rx="2"/><line x1="4" y1="10" x2="20" y2="10"/><line x1="9" y1="3" x2="9" y2="7"/><line x1="15" y1="3" x2="15" y2="7"/></svg>`,
  reliability: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3z"/><polyline points="9 12 11.5 14.5 15.5 9.5"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" ${STROKE}><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>`,
  arrowRight: `<svg viewBox="0 0 24 24" ${STROKE}><line x1="4" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/></svg>`,
  arrowLeft: `<svg viewBox="0 0 24 24" ${STROKE}><line x1="20" y1="12" x2="5" y2="12"/><polyline points="11 6 5 12 11 18"/></svg>`,
  anchor: `<svg viewBox="0 0 24 24" ${STROKE}><circle cx="12" cy="5" r="2"/><line x1="12" y1="7" x2="12" y2="21"/><line x1="8" y1="11" x2="16" y2="11"/><path d="M4 14c1 4 4 7 8 7s7-3 8-7"/></svg>`,
  swap: `<svg viewBox="0 0 24 24" ${STROKE}><polyline points="7 4 3 8 7 12"/><line x1="3" y1="8" x2="16" y2="8"/><polyline points="17 12 21 16 17 20"/><line x1="21" y1="16" x2="8" y2="16"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg>`,
  tags: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M4 4h8l8 8-8 8-8-8z"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" stroke="none"/></svg>`,
};

/** Builds a `<span class="icon">` wrapping the named icon's inline SVG markup. */
export function icon(name: IconName, className?: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = className ? `icon ${className}` : "icon";
  span.innerHTML = ICONS[name];
  return span;
}

const CARGO_ICONS: Record<CargoType, string> = {
  passengers: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="7" r="2.5"/><path d="M8 11c-3 0-5 2-5 5v2h10v-2c0-3-2-5-5-5z"/><circle cx="17" cy="8" r="2"/><path d="M17 11.5c-2.2 0-4 1.6-4 4v2h8v-2c0-2.4-1.8-4-4-4z"/></svg>`,
  mail: `<svg viewBox="0 0 24 24" ${STROKE}><rect x="3" y="6" width="18" height="12" rx="1"/><path d="M3 6l9 7 9-7"/></svg>`,
  coal: `<svg viewBox="0 0 24 24" fill="currentColor"><ellipse cx="8" cy="16" rx="5" ry="3"/><ellipse cx="14" cy="14" rx="5" ry="3.5"/><ellipse cx="17" cy="17" rx="4" ry="2.5"/></svg>`,
  ironOre: `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="4,18 8,9 13,12 11,18"/><polygon points="12,18 16,7 21,13 18,18"/></svg>`,
  wood: `<svg viewBox="0 0 24 24" ${STROKE}><rect x="3" y="7" width="16" height="5" rx="2.5"/><circle cx="4.5" cy="9.5" r="1.8"/><rect x="5" y="13" width="16" height="5" rx="2.5"/><circle cx="6.5" cy="15.5" r="1.8"/></svg>`,
  grain: `<svg viewBox="0 0 24 24" ${STROKE}><line x1="12" y1="21" x2="12" y2="4"/><path d="M12 6l-3-2M12 6l3-2M12 9l-3-2M12 9l3-2M12 12l-3-2M12 12l3-2M12 15l-3-2M12 15l3-2"/></svg>`,
  livestock: `<svg viewBox="0 0 24 24" ${STROKE}><ellipse cx="12" cy="14" rx="6" ry="5"/><path d="M6 11 L3 8M18 11 L21 8"/><circle cx="9.5" cy="13" r="1" fill="currentColor" stroke="none"/><circle cx="14.5" cy="13" r="1" fill="currentColor" stroke="none"/><path d="M10 17h4"/></svg>`,
  oil: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c4 6 7 9.5 7 13a7 7 0 0 1-14 0c0-3.5 3-7 7-13z"/></svg>`,
  steel: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="3" width="14" height="3"/><rect x="5" y="18" width="14" height="3"/><rect x="11" y="6" width="2" height="12"/></svg>`,
  lumber: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="6" width="18" height="3" rx="1"/><rect x="3" y="11" width="18" height="3" rx="1"/><rect x="3" y="16" width="18" height="3" rx="1"/></svg>`,
  food: `<svg viewBox="0 0 24 24" ${STROKE}><rect x="6" y="6" width="12" height="14" rx="1"/><ellipse cx="12" cy="6" rx="6" ry="2"/></svg>`,
  goods: `<svg viewBox="0 0 24 24" ${STROKE}><rect x="4" y="6" width="16" height="14"/><line x1="4" y1="13" x2="20" y2="13"/><line x1="12" y1="6" x2="12" y2="20"/></svg>`,
  fuel: `<svg viewBox="0 0 24 24" ${STROKE}><rect x="5" y="7" width="14" height="13" rx="2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="12" y1="10" x2="12" y2="16"/></svg>`,
};

/** The raw cargo pictogram markup, with `currentColor` resolved to `color` via an inline style on
 * the SVG root — for embedding as a canvas-drawable image (station supply bubbles on the map),
 * where there's no surrounding DOM/CSS to inherit a `color` from otherwise.
 *
 * PLAN Phase 15 play-test fix: `CARGO_ICONS`' markup (also used via `innerHTML` elsewhere, where a
 * browser happily infers the SVG namespace for inline markup already inside an HTML document) has
 * no `xmlns` attribute — loaded standalone as an `<img>` src (which is what a canvas `drawImage`
 * needs), that makes it invalid, unnamespaced XML, so the image silently fails to decode and
 * `img.complete`/`naturalWidth` never become truthy. The bubble's background circle still drew
 * (it's plain canvas arcs), so the bug read as "bubbles render as plain colored circles with no
 * pictogram inside" rather than a visible error. */
export function cargoIconDataUrl(cargo: CargoType, color: string): string {
  const svg = CARGO_ICONS[cargo].replace(
    "<svg ",
    `<svg xmlns="http://www.w3.org/2000/svg" style="color:${color}" `,
  );
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Converts `#rrggbb` to `rgba(r,g,b,alpha)`. */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Builds a cargo pictogram (STYLE §5): a small rounded tile tinted with the cargo color at 25%
 * opacity, the icon itself in the full cargo color (`currentColor`, set via inline `color`).
 */
export function cargoIcon(cargo: CargoType, className?: string): HTMLSpanElement {
  const def = CARGO[cargo];
  const span = document.createElement("span");
  span.className = className ? `cargo-icon ${className}` : "cargo-icon";
  span.style.background = hexToRgba(def.color, 0.25);
  span.style.color = def.color;
  span.innerHTML = CARGO_ICONS[cargo];
  return span;
}
