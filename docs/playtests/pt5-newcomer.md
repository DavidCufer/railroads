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

### **[UX]** Tutorial & Onboarding

**Title:** Clear tutorial hint guides first action
- The tooltip **"Drag on the map with the Track tool to lay your first line"** immediately tells a newcomer what to do next
- Provides a specific action (use Track tool, drag) rather than vague "start building"
- `[Severity: low / positive finding]` — this is a good UX pattern

### **[UX]** Cash Display & Starting Balance

**Title:** Starting cash is not explained contextually
- The "$1.0M" is shown but no context on what it costs to build a first station or train
- No tooltip or help text explaining what's affordable (e.g., "enough for ~2 stations and 1 train")
- First-time player has no anchor for "is this a lot of money?"
- `[Severity: medium]` — unclear if player is starting with abundance or scarcity

### **[UX]** Tool Sidebar Clarity

**Title:** Tool names are clear but no hover hints
- "Track, Double, Electrify, Station, Bulldoze, Info" are labeled and color-differentiated (orange/tan for selected state)
- Would benefit from one-line descriptions on hover (e.g., "Double: Add a second track line") for brand-new players
- The "Info" button's purpose is unclear (inspect/query mode?)
- `[Severity: low]` — text labels are readable, but context would help

### **[Idea]** Map Preview & Region Context

**Title:** Minimap in corner is helpful
- Small map preview in bottom-left corner shows full region extent and current viewport (blue rectangle)
- This is a strong affordance for understanding map scale
- `[Severity: low / positive]` — good feature inclusion

### **[UX]** Difficulty Selection Timing

**Title:** Difficulty chosen before region; no guidance
- After clicking "New Game," player sees **all regions + difficulty buttons together**
- No text explaining what "Normal" vs "Easy" vs "Hard" means economically (start cash, costs, profit margins, etc.)
- A one-liner (e.g., "Normal: balanced start costs and revenue") would help
- `[Severity: medium]` — affects game strategy but player can infer from play

### **[Balance Question]** No Visible Goals or Contracts Early

**Title:** What is the player supposed to *do*?
- The tutorial says "drag to lay track" but no mention of why (deliver cargo? earn profit? maximize net worth?)
- No visible win/lose conditions or milestones (e.g., "Reach $10M by 1900")
- Help menu (if present) not accessed yet
- `[Severity: medium]` — unclear early motivation without exploring Help

### **[UX]** Menu Responsiveness

**Title:** New Game dialog & Start Game worked smoothly
- No lag, menus load and respond quickly
- Buttons are touchable and clickable
- No accidental double-clicks or missed taps observed
- `[Severity: low / positive]` — responsive UI

## Not Tested

- Clicking on cities, stations, or trains to inspect them
- Building actual track or stations
- Buying trains and setting routes
- The Help/Info panels in detail
- Long-term game progression (income decay, bankruptcy, era transitions)
- Touch gesture controls (is a touchpad enough or needed?)
- Eras beyond 1840 (1900, 1950)
- Multiplayer or save/load (if applicable)

## Top 3 Things to Fix/Add

1. **Starting cash context** — add a one-line hint or tutorial note explaining what $1.0M can buy (e.g., "enough for 2–3 stations and 1 locomotive"). Helps newcomer avoid early mistakes.

2. **Difficulty descriptions** — each option should have a one-sentence summary (e.g., "Hard: tight margins, higher costs, earn bigger profit per successful route"). Helps player self-select the right challenge.

3. **Early goal/motivation** — the map loads but it's unclear *why* the player should build. Mention in the tutorial or initial text that cargo flows between cities, or that profit targets exist, or what the era system means. Prevents "why am I doing this?" confusion.

---

**Session:** https://claude.ai/code/session_01EQTwyuZDvsTUqvGCbVbaKe

