# Railroads — Visual Style Guide

Decided by the reviewer; implementers **apply** this, they don't redesign it. If something here is impossible or
clearly worse in practice, make the smallest deviation and note it in PROGRESS.md.

## 1. Direction: "Railway poster, modern flat"

Warm, calm and legible: late-19th-century railway posters and timetables (cream paper, ink, brass, signal red),
rendered as clean modern flat UI. No gradients on controls, no glassy blur, no emoji in the UI (replace every emoji
icon with the SVG icon set in §5).

## 2. Design tokens (CSS custom properties on `:root`, in one file `src/ui/theme.css`)

```css
:root {
  /* surfaces */
  --ink-900: #141A22;   /* screen backgrounds, scrims */
  --ink-800: #1C2430;   /* panels */
  --ink-700: #26303D;   /* raised rows, inputs */
  --ink-600: #334052;   /* borders, dividers */
  --paper:   #F2E8D5;   /* title/welcome headings, light cards */
  --paper-dim:#CFC4AE;  /* secondary text on dark */
  --text:    #EEE7DA;   /* primary text on dark */
  --muted:   #9AA3AF;   /* tertiary text */
  /* accents */
  --brass:   #C9A23A;   /* primary action, selection, active tool */
  --brass-dk:#9C7C22;   /* pressed / borders of primary */
  --signal:  #C2452D;   /* danger, expenses, warnings */
  --go:      #4E8F5A;   /* money in, profit, success */
  --steel:   #6F8AA6;   /* info, electric */
  /* shape & rhythm */
  --radius-s: 6px; --radius-m: 10px; --radius-l: 16px;
  --gap-1: 4px; --gap-2: 8px; --gap-3: 12px; --gap-4: 16px; --gap-5: 24px;
  --shadow: 0 6px 20px rgba(0,0,0,.35);
  /* type */
  --font-display: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
  --font-ui: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif;
  --fs-xs: 11px; --fs-s: 13px; --fs-m: 15px; --fs-l: 18px; --fs-xl: 24px; --fs-hero: 44px;
}
```

- Numbers (money, dates, counts) use `font-variant-numeric: tabular-nums`.
- Display serif only for: game title, screen titles, panel titles, city/station names in panels. Everything else UI sans.
- Money: positive `--go`, negative `--signal`, always `$1.2M` / `$34k` format.

## 3. Components

**Panel (side sheet)**: `--ink-800` background (opaque, no blur), `--radius-l` on the left corners, `--shadow`.
Header: title in display serif `--fs-l` `--paper`, optional subtitle in `--muted` `--fs-s`, close button (icon, 44×44)
right; a 2px `--brass` rule under the header, inset by `--gap-4`. Body scrolls; footer pinned with actions.
Sections inside a panel: small caps label (`--fs-xs`, letter-spacing .08em, `--muted`) + content, separated by
`--gap-4`, no boxed cards unless the content is a list of items.

**Buttons**:
- Primary: `--brass` fill, `--ink-900` text, 600 weight, `--radius-m`, min-height 44px.
- Secondary: transparent, 1px `--ink-600` border, `--text` text. Pressed: `--ink-700` fill.
- Danger: `--signal` text + border (fill only on confirm dialogs).
- Disabled: 40% opacity, never hidden when the reason is useful (show the reason as `--muted` caption below).
- **Action grids**: related actions (upgrades, improvements, civic investment…) go in a **2-column grid**
  (`grid-template-columns: 1fr 1fr; gap: var(--gap-2)`), each button showing icon + short label + cost on a second
  line in `--fs-xs`. Only a single primary footer action may be full width.

**Chips**: 24px tall, `--radius-s`, `--ink-700` background, icon + number. Used for cargo amounts.

**Segmented control** (speed, difficulty, units): one rounded container `--ink-700`, active segment `--brass` with
`--ink-900` text.

**Top bar**: 44px, `--ink-900` at 92% opacity, money left in tabular nums (`--brass` when positive), date in display
serif, speed segmented control right, menu icon.

**Left toolbar**: vertical rail of 48×48 icon buttons (§5 icons, 24px), label under icon `--fs-xs`; active tool =
`--brass` background, `--ink-900` icon. Rail background `--ink-900` 92%.

**Floating buttons** (Trains, News, Goals, Quick build): round 48px icon buttons, `--ink-800`, badge dot `--signal`.

**Toasts**: `--ink-800`, left border 3px colored by kind (`--go` money/good, `--signal` warning, `--steel` info).

## 4. Screens

**Welcome / title screen**
- Full-bleed live background: a random map rendered at overview zoom, slowly panning (≈ 8 px/s), with a darkening
  scrim (`--ink-900` at 55%) and one procedural steam train running along a pre-built looping track so something
  moves.
- Centered column: small caps overline "A RAILWAY TYCOON" (`--brass`, `--fs-xs`, letter-spacing .2em); title
  **RAILROADS** in display serif `--fs-hero` `--paper`, letter-spacing .06em; a thin brass rule with a small
  locomotive icon in the middle; subtitle "Build the line. Move the world." in `--paper-dim`.
- Buttons stacked, max-width 280px: **Continue** (primary, only if a save exists), **New Game** (primary if no save,
  else secondary), **Load**, **Settings**. Version string bottom-right in `--muted` `--fs-xs`.
- Must fit 800×360 landscape: title shrinks to 32px under 400px height.

**New Game screen**
- Header: back arrow + "New Game" (display serif). Two tabs as a segmented control: **Real World | Random**.
- Real World: horizontal row of large cards (thumbnail ~ 180×110, rounded `--radius-m`), region name in display
  serif, a year chip ("1830"), one-line description in `--muted`. Selected card: 2px `--brass` border + subtle lift.
- Random: two-column form of segmented controls (size, water, terrain, cities, resources, start year) + seed field
  with a dice icon button.
- Footer bar: difficulty segmented control left, starting cash (`--brass`, tabular) middle, **Start** primary right.

## 5. Icons (one file `src/ui/icons.ts`, inline SVG strings, 24×24 viewBox, 2px strokes, `currentColor`)

Tools: track, double-track, electrify (bolt), station, bulldoze, info, trains, news, goals, finance, menu, close,
back, dice, settings, sound, play/pause/fast-forward.

**Cargo pictograms** (also 24×24, filled shapes, each on a small rounded tile tinted with the cargo color from
SPEC §8.1 at 25% opacity, icon in the full cargo color): passengers (two people), mail (envelope), coal (lump pile),
iron ore (angular rocks), wood (logs), grain (wheat ear), livestock (cow head), oil (drop), steel (I-beam), lumber
(planks), food (can), goods (crate), fuel (jerrycan). Reuse the same pictograms on the map (station supply bubbles)
and in panels.

## 6. City & station info — layout (inspired by Railroad Tycoon's station reports, modernized)

RRT showed each station's **supplies** and **demands** as rows of little cargo-car pictures. Do the same with the
cargo pictograms, *above* all actions:

```
Ashtown                         Town · 18,400 ▲
───────────────────────────────────────────────
SUPPLIES / MONTH
[👥 74] [✉ 23]                   ← chip: pictogram + amount
DEMANDS
[👥] [✉] [🥫] [📦] [⛽]          ← pictogram tiles only; greyed + tooltip "needs 8 pts, has 5" if not yet accepted
SERVED BY
Ashtown Station · Ashtown Crossing
───────────────────────────────────────────────
ACTIONS                           (2-column grid)
[⬆ Civic investment  $200k] [ … ]
```
(The emoji above are placeholders in this doc only — use the SVG pictograms.)

- Tap a pictogram → small popover with the cargo name and details. Long lists wrap; never one item per line.
- Same pattern for Station panel: Supplies (with waiting amounts as a thin bar under each chip), Demands, then
  Trains, then Improvements as a 2-column grid of icon buttons (built ones show a check and are disabled).
- Industry panel: Produces / Consumes as chips.

## 7. Map objects

**Trains (seen from directly above)**: consists are drawn as a chain of top-down vehicles following the track,
each with a 1px darker outline and a soft shadow offset (+1px, +1.5px, 25% black).
- Sizes at zoom 1 (tile = 32px): loco 16×7 px, tender 9×7, cars 12×7, 2px gaps.
- Steam loco: boiler as a long rounded rectangle with a lighter center stripe (top-lit cylinder), 2–3 darker band
  lines across, round chimney dot near the front, small dome dot behind it, cab as a squarer block at the rear with
  a slightly lighter roof; body color from a per-era palette (early: green/black with brass bands; later: black).
  Tender: dark box with coal texture (speckles). Smoke puffs drift from the chimney.
- Diesel: long hood (rounded ends), roof with 2–3 vent rectangles and a colored stripe along the side edges, cab
  block near one end with dark window strip. Company livery: `--brass` stripe on `--signal` or `--steel` body.
- Electric: box body with both ends slightly tapered, roof equipment, pantograph as a small diamond outline on top.
- Cars: passenger — green/maroon body with a lighter roof center line; mail — red; hopper (coal/ore/grain) — open
  top showing the load (heap color = cargo color, empty = dark interior); tanker — rounded cylinder with a lighter
  center stripe; flatcar — deck with load blocks; boxcar — roof with cross ribs; livestock — slatted roof.
- Vehicles rotate smoothly along curves (see below); each vehicle's position/angle is sampled on the curved track
  path at its own offset behind the head, so couplings follow the curve.

**Track curves**: never draw a hard corner. At every node where the path changes direction by 45°, draw the rails
as a circular arc (fillet) tangent to both straight segments, radius ≈ 1.2 tiles (clamped so arcs don't overlap on
short segments). Junctions: the through route stays straight; diverging route uses the same fillet. Ties follow the
arc (perpendicular to the local tangent). Double track: two parallel offset curves. The **train renderer must use
the same path geometry** (one shared module) so trains follow the drawn rails exactly. This is render-only; sim
movement is unchanged.

Also discourage ugly zig-zags when building: the A* track preview should penalize two 45° turns in consecutive
tiles (prefer straight runs, then one clean bend).
