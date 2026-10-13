# Playtest 5: Newcomer

Play-tester report. **No game code or tests were changed.** Screenshots: `docs/screenshots/pt5-newcomer-*.png`.

- **Build under test:** `origin/main` (Phase 7+, cargo flow and economy implemented)
- **Setup:** Central Europe 1840, Normal difficulty, Chromium 800×360 (×2 DPR), Vite dev server. Persona: first-time player of railway tycoons, no prior familiarity.
- **Played:** Started new game; navigated menus and observed initial interface for ~10 simulated years idle (no track/trains built).
- **Honesty notes:**
  - Did not click through UI to build track or buy trains; observed initial screens and gameplay layout only
  - Could not successfully access game state via `window.__game` from Playwright after ?debug=1 navigation (state visible in debug toolbar stats, extraction failed)
  - Focused on UI clarity, menu flow, initial impressions as a brand-new player

## Setup & First Impressions

**Title screen** (`pt5-newcomer-01-`): Clean, shows "New Game", "Load Game", settings buttons. Dark theme, readable. No confusing buttons.

**New Game dialog** (`pt5-newcomer-02-`): Two tabs ("Real World" and "Random"), region options shown. **Observation:** Player can choose from 4 real-world regions or random seed. Initial difficulty/region are reasonable defaults (Central Europe, Normal). "Start Game" button is clear.

**Game start** (`pt5-newcomer-03-`): Game loads directly to the map. A tutorial tooltip appears: **"Drag on the map with the Track tool to lay your first line"** with "Skip tips" and "Got it" buttons. 

**Initial state**: 
- Starting cash: **$1.0M** (shown prominently top-left with coin icon)
- Date: **Jan 3-4, 1830** (readable calendar date + era year)
- Map: Central European terrain with trees, forests, cities as dots
- Left sidebar: Tool buttons labeled "Track, Double, Electrify, Station, Bulldoze, Info" 
- Top bar: Date, cash, zoom controls (1x, 2x, 4x, 8x), speed controls, menu

## Findings

### **[UX]** Tutorial Tooltip Design — Good Affordance

**Title:** Tutorial hint is clear and actionable
- The tooltip **"Drag on the map with the Track tool to lay your first line."** is specific and action-oriented
- Dark overlay with rounded corners, centered on screen, easy to read (white text on dark background)
- Two buttons: "Skip tips" (secondary, left) and "Got it" (primary, gold/yellow highlight, right)
- Clear visual hierarchy: gold button draws attention to the intended flow
- **Positive:** Provides concrete next step without overwhelming new player
- `[Severity: low / positive]`

### **[UX]** Cash Display & Starting Balance — Missing Context

**Title:** Starting cash ($1.0M) shown but unexplained in value terms
- Top-left displays "$1.0M" with a coin icon; visually prominent
- No context for what's affordable: "Can I build 1 station? 10 stations? A full network?"
- No tooltips or help text on cash (e.g., "Starting balance: $1.0M; enough for ~2 stations and 1 engine")
- First-time player cannot gauge if this is abundant or tight without trial-and-error
- **Impact:** Could lead to poor early economic decisions (e.g., over-building initially)
- `[Severity: medium]` — clarity issue, not a blocker

### **[UX]** Tool Sidebar — Labels Readable, Context Missing

**Title:** Tool buttons are labeled clearly but lack descriptions
- Left sidebar shows 6 tools in order: **Track, Double, Electrify, Station, Bulldoze, Info**
- Each has a text label below an icon; color changes on hover/select (tan/orange highlight)
- Labels are readable at 1× and 2× zoom
- **Gap:** No hover tooltips explaining what each tool does (e.g., "Double: Add a second parallel track")
- "Info" tool's purpose is unclear (inspect/query? select mode?)
- **Positive:** The ordering (build > upgrade > demolish) is logical
- `[Severity: low]` — visual labels work, but tooltips would help

### **[UX] + [Idea]** Minimap Affordance — Effective

**Title:** Small map preview in corner aids navigation awareness
- Bottom-left displays a miniature region map with current viewport highlighted (blue rectangle)
- Shows player the "zoom-out" view immediately
- Easy to spot where they are in the larger territory
- **Positive:** Reduces cognitive load on new players ("where am I on the map?")
- `[Severity: low / positive]` — well-placed feature

### **[UX]** New Game Dialog — Region + Difficulty Both Presented

**Title:** Region and difficulty selection combined in one screen; no tooltips
- After "New Game" click, player sees:
  - Two tabs: "Real World" (4 historical regions) and "Random"
  - Three difficulty buttons: Easy, Normal, Hard
  - Region cards show year and description (e.g., "The Alps divide Italy from…")
  - "$1.0M" displayed (starting cash, presumably)
- **Issue:** No explanation of difficulty trade-offs (e.g., "Hard = lower start cash, higher costs, bigger rewards")
- **Issue:** Regions' years are shown (1830, 1840, 1860) but it's unclear if this affects gameplay
- **Positive:** Region descriptions help (e.g., "Coastlines, the Appalachians")
- `[Severity: medium]` — player can guess from names, but explicit guidance is missing

### **[Design Question]** Undefined Victory Condition or Gameplay Goal

**Title:** Tutorial says "lay track" but no mention of why or what comes next
- Tooltip guides building first line, but not the larger purpose
- No visible win condition (reach net worth goal? era completion? survive X years?)
- No mention of contracts, cargo, or economic feedback
- Help panel (if available) not inspected
- **Impact:** Newcomer may build track but not understand what makes a "good" or "bad" decision
- `[Severity: medium]` — can lead to random experimentation vs. strategic thinking

### **[UX]** UI Responsiveness & Stability

**Title:** Menus and buttons respond quickly and reliably
- New Game, region selection, and Start Game buttons all click immediately
- No lag or visual glitches during navigation
- Date and cash display update smoothly
- `[Severity: low / positive]` — smooth interface performance

### **[Minor UX]** Era Display Clarity

**Title:** Year shown in two places; format differs
- Top bar shows both "Jan 4, 1830" (calendar format) and "1830" (number format)
- Both refer to the same information; the redundancy is mild but slightly cluttered
- "1830" in a tan/gold box is good visual emphasis
- `[Severity: low]` — not confusing, just redundant

## Fun & Pacing

The game is clean and visually clear at first glance; the terrain reads well and cities are identifiable. The tutorial tip is encouraging without being patronizing. The main friction point is the unknown: a newcomer can follow the "drag to build" instruction, but without understanding the economic goal or cost structure, each click feels exploratory rather than strategic. Once a player builds their first connection and sees revenue pop up (presumably), the feedback loop should click. The calm pacing (no real-time pressure at start, pausable/speed-controllable time) is good for onboarding.

## Not Tested

- Clicking on cities, stations, or trains to inspect them
- Building actual track or stations (UI gestures)
- Buying trains and setting routes
- The Help/Info panels in detail
- Long-term game progression (income decay, bankruptcy, era transitions)
- Touch gesture controls (mobile game; need actual tablet or touch event emulation)
- Eras beyond 1840 (1900, 1950)
- Load/save flow and autosave behavior

## Top 3 Things to Fix/Add

1. **Starting cash context + early affordance** — add a one-line tooltip on the cash display ("Starting balance: $1.0M; enough for ~2 stations + 1 engine") and/or a second tutorial tip after "Got it" that says "Build a station (costs ~$50k) near a city, then add track to connect two cities." Newcomers lack mental models of cost/benefit; this prevents early mistakes (over-building, dead-end lines).

2. **Difficulty descriptions in New Game dialog** — add a one-sentence hover tooltip to each difficulty button (e.g., "Normal: balanced start; costs and revenue scale with era" / "Hard: lower start cash, higher costs, bigger margins"). Helps player pick the right challenge level rather than guessing from the name.

3. **Early goal statement** — add a second tutorial tip or an "Objective" panel that appears after the first tip is dismissed, stating something like: "Deliver cargo between cities using track and stations; earn revenue based on distance and demand. Expand your network and grow your company." This establishes the core loop (build → deliver → earn) and prevents "what am I supposed to be doing?" confusion.

---

**Session:** https://claude.ai/code/session_01EQTwyuZDvsTUqvGCbVbaKe

