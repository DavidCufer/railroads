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

---

# Part 2 — "Engine shed" update (Phases 19–22)

Player feedback after Phase 18: "UX is not there yet. Better looking panels, better trains, less text and more icons
(don't exaggerate), train pictures when choosing them. Visually pleasing, made for real train enthusiasts."

Diagnosis of the current UI (800×360 phone landscape, the primary target):
- Panels waste the height: title + 44px close + brass rule ≈ 110px, a 64px footer, so only ~180px of content shows.
  Most panels open on "SUPPLIES —" / label–value rows that read like a spreadsheet.
- Rolling stock is only text ("Grasshopper 0-4-0 (Steam) 25 km/h · 3 cars · $20k", "Empty (Passengers)" chips).
  For a train game the engines are the stars and we never show them.
- Train panel, station panel and finance are key–value lists; nothing is visual (no bars, pictures, timelines).
- The menu is a stack of full-width buttons; overlay toggles don't look like toggles.

Principles (apply everywhere):
1. **Show the machine.** Every place a locomotive or car is named also shows its picture (side-view drawing, §9).
2. **The first screen answers the question.** At 800×360 the part of a panel visible without scrolling must
   hold the thing the player opened it for (see the per-panel acceptance notes in §8.4).
3. **Icon + number, words for actions.** Stats are icon + value (+ tiny caption only where the icon is ambiguous);
   buttons keep short text labels next to their icon. Icon-only buttons are fine for close / back / edit / sell /
   tabs, always with `aria-label` and a long-press tooltip. Don't turn sentences into rebuses.
4. **Compare visually.** Where the player compares things (engines, stations, income categories) use bars, pips
   and meters, with the number beside them.
5. **One detail language.** Hairlines, 10px radii, small caps section labels, brass for "selected / primary /
   money", tabular numbers. No gradients on UI controls; drawings (§9) may use flat tone bands for volume.

## 8. UI system v2

### 8.1 Tokens (add to `:root`; keep the existing ones)
```css
--ink-750: #212A36;          /* cards inside panels */
--line: rgba(238,231,218,.08); /* hairlines inside cards */
--brass-soft: rgba(201,162,58,.16); /* selected card fill, brass chips */
--go-soft: rgba(78,143,90,.18); --signal-soft: rgba(194,69,45,.18); --steel-soft: rgba(111,138,166,.18);
--fs-2xs: 10px;
--panel-w: clamp(320px, 46vw, 420px);
```

### 8.2 Components (one module each under `src/ui/components/`, all DOM, all strings from strings.ts)
- **PanelHeader v2** (replaces the current header + rule): 52px tall. Left: optional 40×40 *thumb* slot (a cargo
  tile, a station-type glyph, or a tiny loco side view). Then title (display serif, `--fs-l`) and subtitle
  (`--fs-xs`, `--muted`, may contain inline icons) stacked. Right: 36×36 ghost close button (icon only, no fill until
  pressed). Bottom: 1px `--ink-600` hairline, plus a 36px-wide 2px `--brass` accent segment at the left under the
  thumb (the brand "rule" survives as an accent, not a full-width line).
- **Tabs**: sticky row under the header, 36px, icon + short label (`--fs-xs`, 600). Active: `--text` with 2px brass
  underline; inactive `--muted`. Use only when a panel has ≥ 2 distinct jobs (Train, Station, Finance).
- **StatTile**: `--ink-750` card, `--radius-m`, padding 8px 10px. Line 1: 16px icon (`--muted`) + value
  (`--fs-m`, 600, tabular, tone optional go/signal/brass). Line 2: caption `--fs-2xs` uppercase `--muted`.
  Used in rows of 2–4 (`grid-template-columns: repeat(auto-fit, minmax(84px, 1fr))`).
- **Meter**: 6px bar, `--ink-600` track, fill in tone; optional value label right. **Pips**: 5 small 8×8 rounded
  squares (filled `--brass` / empty `--ink-600`) for reliability and similar 1–5 ratings.
- **Card list row**: 52px min, `--ink-750`, hairline separators, thumb left (≤ 40px tall), title + muted meta, a
  trailing value or chevron. Whole row tappable.
- **Toggle row** (settings, overlays): icon, label, and a real switch (36×20 track, brass when on) on the right.
- **Sparkline / small charts**: `<canvas>` drawn with the render palette, 1.5px `--brass` line, soft `--brass-soft`
  area, last value dot; horizontal stacked bars for breakdowns (cargo colors from SPEC §8.1 for income,
  `--signal` tints for costs). Build a tiny helper, no chart library.
- **Footer v2**: 56px, one row. Either one primary button (+ optional secondary) or an *action bar* of up to four
  icon+label compact buttons (e.g. Edit cars · Replace · Sell). Danger actions keep the two-tap confirm.
- **Empty states**: one muted line with an icon ("No cargo nearby"), never a lone "—".

### 8.3 Chrome
- **Top bar**: cash as a chip (coin icon + amount, brass; flashes `--go` / `--signal` for 600ms when it changes by
  a delivery or a purchase), date in serif, and a small **era badge** after the date (steam / diesel / electric
  icon of the newest available traction + year) — tap opens the Roster (§11.3). Speed control unchanged.
- **Left rail**: 56px wide; icons 22px, labels `--fs-2xs`; a hairline gap separates build tools (Track, Double,
  Electrify, Station, Bulldoze) from Info.
- **Right floating buttons** (Goals, News, Trains): one vertical pill container (`--ink-800`, radius 24px) with the
  three 44px icon buttons and `--signal` badge dots, instead of three separate circles. Quick build stays separate.
- **Menu panel**: grouped card lists with icons: Game (Save, Load, Settings, Roster, Quit to title), Overlays
  (toggle rows with switches, each with its own icon), Mini-map (toggle row).

### 8.4 Panels (what the first screen must show at 800×360)
- **City**: header thumb = city tier glyph; subtitle "Town · 18,400 ▲2%" (arrow icon, go/signal tone). First screen:
  Supplies chips, Demands tiles, Served-by chips (tappable). Actions (2-col grid) below. Fix the stray glyph after
  the population ("88k" is followed by a broken character).
- **Station**: header thumb = station type glyph (Depot / Station / Terminal drawn as simple building icons);
  subtitle "Station · Ashtown". Tabs: **Cargo** (supplies with waiting bars, demands, transfer stock) · **Trains**
  (card rows: loco side-view thumb, train name, status icon + next stop) · **Build** (improvements grid + upgrade).
  First screen of Cargo shows supplies and demands. Footer: Buy train (primary) — the upgrade button moves into
  the Build tab.
- **Industry**: thumb = industry glyph; recipe line with pictograms ("[steel] or [lumber] → [goods]") as the first
  row; production/consumption chips; nearest sources as card rows.
- **Finance**: tabs **Overview** (Cash / Net worth / Loans stat tiles, net-worth sparkline, credit meter,
  Borrow/Repay) · **This year** (income stacked bar by cargo, costs stacked bar, each with a legend of chips).
  Yearly report stays reachable from the footer.
- **Train** and **Buy train**: see §11.

## 9. Rolling-stock art: side views ("builder's drawings")

Procedural side-profile drawings of every locomotive and car, in the spirit of a builder's lithograph rendered as
modern flat art: clean silhouettes, 2–3 flat tone bands for volume (top-lit), 1px darker outline, brass details,
a thin rail + tie line under the wheels and a soft ground shadow. Facing **right** (front at the right).
They are the pictures for the buy screen, train panel, roster, news, station train rows.

### 9.1 API (`src/render/art/`, cached offscreen canvases, keyed by id + size + dpr)
- `drawLocoSide(ctx, def, x, y, height, opts?)` and `locoSideCanvas(def, height)` → canvas sized to the drawing.
- `drawCarSide(ctx, carType, era, fill01, ...)`, `carSideCanvas(...)`.
- `consistSideCanvas(train or {loco, cars, fills}, height)` → whole train (loco, tender, cars) with 2px couplers.
- `wheelArrangementGlyph(whyte)` → small inline SVG: leading/trailing wheels as small circles, drivers as large,
  grouped like `oOOOo` (the enthusiast's diagram). Articulated shows two driver groups.
- Shared livery/palette module `src/render/art/livery.ts` used by both the side views **and** the top-down map
  sprites so a train looks the same in both.
- Unit tests: every roster locomotive and every car type renders without throwing at heights 24, 48, 96, and the
  drawing's aspect ratio is stable; cache hits on repeat calls.

### 9.2 Steam (parametric from the Whyte notation in the name, e.g. "4-6-2")
Units: `u = height / 24`; rail top at 23u. Parse leading / driving / trailing axle counts; "4-8-8-4" = articulated
(two driving groups, two sets of cylinders).
- **Wheels**: drivers Ø 7u (freight types 2-6-0, 2-8-0, 2-8-2, 4-8-8-4), 8u (general), 9u (express 4-4-2, 4-6-2,
  4-6-4); leading/trailing/tender Ø 4u. Dark rim ring 0.6u, spokes (drivers 12, small 8) as 1px lines in the wheel
  tone, hub, and a crescent counterweight on drivers. Early era: red wheels; later: black with a white tyre edge.
- **Motion**: cylinder block at the front above the leading truck (3u tall); coupling rod across all drivers at
  hub height + 1u; connecting rod from crosshead to the second/main driver.
- **Boiler**: from smokebox front to cab front; diameter 6u (≤1860) → 7u (≤1900) → 8u (later), top-lit with a
  lighter upper band. Smokebox = front 18% of the boiler, graphite, with a darker door ring on the front face.
  Boiler bands: brass (early) or thin dark lines. Running board line along the side at wheel-top height with a
  livery lining stripe.
- **Chimney by era**: ≤1860 balloon/diamond stack (wide top, 6u tall); 1860–1900 tall straight stack with cap
  (5u); later short stack (2.5u). **Domes**: sand dome + steam dome (brass early, livery later, low & merged late).
  American types (4-4-0, 2-6-0, 4-6-0, 2-8-0 before 1900): bell, big box headlamp on top of the smokebox and a
  **pilot (cowcatcher)** of slanted bars. Later: small round headlamp at the smokebox front and a step footplate.
- **Cab** at the rear: rectangle with overhanging curved roof, 1–2 window squares (`--paper` glass with dark frame);
  wooden brown cab ≤ 1860.
- **Tender** behind (left): body with livery panel and lining, coal heap on top (near-black with a few lighter
  specks); 2 axles ≤1860, two 2-axle bogies later, two 3-axle bogies for Mikado/Hudson/Articulated.

### 9.3 Diesel and electric
- **Trucks**: B-B (2×2 axles) or C-C (2×3) by weight class; small wheels Ø 3u with a truck side frame; fuel tank
  between trucks on diesels (rounded, dark).
- **Streamliner diesel**: rounded "bulldog" nose with a raised cab window, long smooth body, porthole windows,
  two-tone livery with a sweeping nose stripe. **Cab unit**: similar but flatter nose, grille bands at the rear.
  **Road switcher**: narrow long hood + short hood, cab near one end taller than the hoods, handrail line with
  stanchions, walkway. **High-horsepower / Heavy**: long hood with radiator fans on the roof, C-C trucks.
- **Electrics**: roof pantograph (diamond linkage for early/mid, single-arm for modern) and roof insulators.
  **Early electric**: boxcab with vertical panel lines and small end windows. **E-unit**: streamlined both ends.
  **Modern / Heavy freight**: angular cab ends, large windscreen, side louvres. **High-speed trainset**: low wedge
  nose, continuous window band; drawn with its matching trailer cars when shown as a consist.
- **Liveries** (original, no real companies): early steam — green body `#2F5D3A`, red wheels `#9E2B25`, brass
  `#C9A23A`, graphite smokebox `#2A2D31`, wood cab `#7A4A2A`. Mid steam — black `#1F2226` with thin red lining.
  Late steam — black with a silver-grey smokebox front `#9AA3AF` and white tyre edges. Streamliner — signal red
  `#B8402B` and cream `#EDE0C4` with brass stripe. Cab unit — steel blue `#46637F` with cream band. Road switcher /
  heavy diesel — ink blue `#243447` with brass handrails and a cream end stripe. Early electric — dark green with
  cream lining. Modern electric / HS trainset — cream-white `#E9E4D8` body, steel blue band, signal-red nose tip.

### 9.4 Cars (by cargo type × era bucket: early < 1870, mid 1870–1935, modern > 1935)
Early cars are short 2-axle wooden bodies; mid have bogies and (passenger) clerestory roofs; modern are longer
steel bodies with smooth roofs.
- Passenger coach: maroon `#6E2A2A` (early/mid) or steel blue/cream (modern), window row, doors at the ends.
- Mail: signal red with a centre door and few windows, small brass lozenge (no lettering).
- Coal: black open hopper, heap of coal above the top edge proportional to the load. Iron ore: short heavy rusty
  car with a reddish heap. Grain: early boxcar ochre, modern covered hopper grey.
- Wood (logs): flatcar with stakes and a stack of log ends. Lumber: flatcar with a stack of tan planks.
- Livestock: stock car with horizontal slats (brown-red). Oil / fuel: tank car (cylinder, dome, black; fuel grey).
- Steel: gondola with visible I-beams. Food: reefer, cream with ice hatches. Goods: oxide-red boxcar `#8B3A2B`.
- **Load**: open cars show their load heap scaled by `fill01`; closed cars show nothing on the body (the UI draws a
  thin fill meter under them).

### 9.5 Top-down map sprites (refine STYLE §7 using the same livery module)
- Same colours as the side view. At zoom ≥ 1.5 add detail: boiler bands and dome dots, cab roof ridge, tender coal
  speckle, diesel roof fans and handrail edge lines, electric pantograph, car roof type (clerestory centre line,
  hopper open top showing the load colour, tank cylinder highlight, flatcar load blocks).
- **Smoke & steam**: steam locos emit puffs from the chimney (grey-white circles that grow, drift back along the
  track and fade over ~1.5 s; rate ∝ speed; a gentle white wisp while standing). Diesels: a faint grey haze when
  departing only. Pooled particles, capped (≤ 400 on screen), skipped at zoom < 0.75. Renderer-owned state only.
- Soft shadow under each vehicle (existing) — keep.

## 10. Map polish (render only)
- **Stations**: Depot = small wooden building + one low platform along the track; Station = brick building with a
  platform canopy (dark roof strip with a lighter ridge) on both sides of the track; Terminal = a large arched
  **train shed** drawn top-down as a translucent-looking roof with ribs spanning all tracks, plus a head building.
  Improvements visible (water tower = round tank on legs near the track, engine shed = long roof with smoke vents,
  warehouse = large goods shed, …) — check what already exists and keep it consistent.
- **Station name plaques**: station labels drawn as small enamel signs (rounded rect `#1F3A5F`, 1px cream border,
  cream sans text) — distinct from city labels.
- **City labels**: display serif, `--paper` with a soft dark halo; population tier shown by size.
- **Cities**: top-lit roofs (one half lighter, ridge line), 1px shadows to the lower right, light street lines
  between blocks, one landmark (church/town hall) near the centre from Town tier upward.
- **Trees**: two-tone canopy + small offset shadow. Fields near farms as striped plots.
- **Industries**: each type distinct and readable at zoom 1: mine headframe + spoil heap; sawmill with log piles;
  steel mill with blast furnace and a warm glow; oil wells as nodding pumps; farms with fields; factory with saw-tooth
  roof. Light chimney smoke (shared particle system) on active processors.
- Budget: no measurable fps loss at zoom 1 on the stress map (keep everything cached per chunk where static).

## 11. Train screens

### 11.1 Buy train ("Engine shed" wizard)
Opens as a **full-screen sheet** (top header "Buy train · Ashtown Crossing", close ✕), steps shown as a small
stepper: **1 Engine · 2 Cars · 3 Route**. Footer: Back / Next and the price on the primary button.
- **Step 1 Engine** — left column (≈ 40%): scrollable card list, one card per buyable locomotive: side-view thumb
  (height 36px), name, type icon (steam/diesel/electric), wheel-arrangement glyph for steam, price; a "New" brass
  chip for recent models; models that can't run here (electric without electrified track at this station) shown dimmed
  with a lock and a one-line reason. A segmented filter on top: All / Steam / Diesel / Electric (only types that
  exist in the current year). Right (≈ 60%): the selected engine's **hero**: side view at ~84px tall on a rail line,
  name in serif, intro year chip, and a stat block with icons + bars relative to the best engine available now:
  top speed, power, max cars, reliability (pips), price, running cost per year.
- **Step 2 Cars** — the consist strip on top: the whole train drawn in side view (horizontally scrollable); tap a
  car to remove it (small ✕ badge). Below: car palette tiles (car side thumb + cargo pictogram + capacity);
  tap to append. A "Suggested" row derived from what the first two stops supply/demand (passengers + mail for city
  pairs, the industry cargo for freight) — one tap applies it. A meter shows cars used / max cars.
- **Step 3 Route** — the sheet collapses to the side panel so the map is visible (existing tap-a-station mode):
  route timeline (below) + "Add stop". Buy is enabled once there are 2 stops (keep current rules).

### 11.2 Train panel
- Header: thumb = loco side view (40px tall box, cropped to the front), title "Train 3" (editable name if the
  current code allows it), subtitle "American 4-4-0 · steam icon".
- **Hero strip** (first screen): the consist drawn in side view, each car with a thin fill meter under it and its
  cargo pictogram above when loaded; horizontally scrollable when long. Under it a status line: icon + text
  ("→ Glenbury Crossing · 60 km/h", "Waiting for Train 1 (single track to …)", "Loading 60%").
- Tabs: **Route** (vertical timeline: stops as dots on a line, the train's current position as a small loco marker
  between/at dots, each stop row: station name + loading-rule chip with icon — tap to change the rule; add/remove/
  reorder as today) · **Stats** (stat tiles: profit this year, last year, age, reliability pips, breakdowns;
  income by cargo as a small stacked bar).
- Footer action bar: Edit cars · Replace engine · Sell (two-tap). Edit cars reuses the Step 2 consist builder.

### 11.3 Roster ("Engine shed" gallery) — for enthusiasts
Menu → Roster (and the era badge in the top bar). Full-screen sheet with a horizontal timeline of all
locomotives in intro-year order, grouped by era (steam / diesel / electric rows or colored markers). Each card: side
view, name, year. Future models are shown as dark silhouettes with only the year ("1904"). Tap a card → detail:
large drawing, wheel-arrangement glyph, stats with bars, owned count, and a one-to-two sentence original note about
the type (strings.ts, factual, no trademarks, e.g. "The 4-4-0 'American' type hauled most of the continent's trains
in the mid-1800s: four guiding wheels for curves, four drivers for speed.").

### 11.4 New engine announcement
When a locomotive becomes available (existing news item), show a card dialog instead of only a news line: overline
"NEW LOCOMOTIVE", the side view on a rail line, name, year, 3 key stats with icons, and buttons **Roster** /
**OK**. Once per model; respects the existing "news popups" setting if there is one.
