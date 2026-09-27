/**
 * SVG icon set (STYLE §5): inline strings, 24×24 viewBox, 2px strokes, `currentColor` — no emoji
 * anywhere in the UI (STYLE §1). `icon()` builds a small `<span>` wrapper so callers can drop icons
 * into `h()`-built trees like any other node; `cargoIcon()` builds the tinted-tile cargo pictogram
 * (STYLE §5: icon in the full cargo color, on a tile tinted at 25% opacity).
 *
 * A few icons (check, warning, wrench, water, trophy, arrowUp, arrowFlat, shed) extend STYLE §5's
 * named tool list — that list covers the toolbar; these replace the remaining emoji found elsewhere
 * in the UI (status text, station badges, the goal-celebration dialog), per §1's "no emoji in the
 * UI" rule. Small, documented deviation per CLAUDE.md/STYLE.md's own instructions.
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
  | "shed";

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
