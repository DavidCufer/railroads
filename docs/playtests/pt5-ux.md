# Playtest 5 — UX Auditor

**No game code or tests were changed.** Screenshots: `docs/screenshots/pt5-ux-*.png`.

## Setup

- **Persona:** UI/UX auditor on phone-size screen (800×360, 2× DPR).
- **Method:** Playwright e2e test (`e2e/_pt5_ux.spec.ts`, deleted before commit) opening every major panel and edge case.
- **Focus:** Text overflow, clutter, button accessibility, toast pile behavior, menu navigation, save/load flow.
- **Not tested:** touch gestures on mobile, Android-specific features (back button behavior on real device), audio, specific color blindness accessibility.
- **Game state:** phase 46+ (scenarios, achievements, company history, bankruptcy UI).

## Findings

### UX

**UX1. Cash display changes color on zero cash but could be more prominent.** *(UX, low)*
- Repro: Set cash to $0 via debug API, look at cash display at top-left.
- Evidence: `pt5-ux-19-zero-cash.png` shows cash display turns reddish (`$0`) but is small and easy to miss during gameplay. Menu still fully functional at zero cash.
- Severity: Low — the color change is a good signal, but on a busy screen during crisis play a player might miss the visual change until they try to build something. A small "ZERO CASH" label or icon near the display would help.
- Note: Player can still access menus and save/load when at zero cash, which is correct (pt5-ux-20-menu-zero-cash.png).

**UX2. Title screen buttons are well-spaced but some menu items are cut off at bottom.** *(UX, medium)*
- Repro: Open Menu on game screen, scroll down in menu.
- Evidence: `pt5-ux-12-menu-panel.png` and `pt5-ux-20-menu-zero-cash.png` show menu has "Save Game", "Settings", "Company history", "Achievements" but the bottom of the menu is slightly clipped on 800×360 viewport. Menu appears scrollable but no scrollbar is visible.
- Severity: Medium — all menu items are accessible if you know to scroll or tap them, but no visual indicator (scrollbar, "scroll down" hint) shows there's more content below.
- Expected: Add a scrollbar or a fade/indicator at the bottom of the menu to signal more items exist.

**UX3. Game over card is clear but uses abbreviated stats that could be misread.** *(UX, low)*
- Repro: Force bankruptcy via debug API, look at the game-over card.
- Evidence: `pt5-ux-23-game-over.png` shows card with "0 years of railroading" (for a ~1-month game), "Best net worth $50M", "Owed $0", "0 trains, 0 stations". The "years of railroading" is correct by the month count but feels counterintuitive (reads as "you failed immediately" even though you did play).
- Severity: Low — wording is technically accurate; not a blocker, but "~1 month of railroading" would be clearer and less harsh-feeling.
- Note: Game-over card offers three buttons: "Load last autosave", "History", "New game" — all are accessible and make sense.

**UX4. Speed control buttons take up a lot of top-right space and are easy to misclick.** *(UX, low)*
- Repro: Game running, look at top-right button bar.
- Evidence: `pt5-ux-01-title.png`, `pt5-ux-12-menu-panel.png`, and `pt5-ux-21-track-view.png` all show speed buttons (||, 1x, 2x, 4x, 8x) taking significant horizontal space. On 800px width, these buttons + menu hamburger fill the entire top-right corner, leaving no room for other HUD elements.
- Severity: Low — buttons are functional and well-spaced, but on narrow phones (landscape) they might feel cramped. No text overflow observed; buttons are icon + text.
- Expected: Consider a dropdown "Speed: 1x ▼" layout on very narrow viewports (< 800px) to save space, or move to a collapsible panel.

**UX5. Save/Load menu shows all slots clearly but no sort/filter options.** *(UX, low)*
- Repro: Open Menu > Save Game.
- Evidence: `pt5-ux-18-save-load-menu.png` shows five rows of "Empty slot" with Save buttons. Layout is clean, but no timestamps, no save count shown, no "latest save" indicator.
- Severity: Low — once saves exist, this could become harder to navigate. Future improvement: show save date, auto-save indicator, "most recent" badge.

**UX6. Station/train panels do not exist yet in this phase.** *(Not tested)*
- The test attempted to call `window.__game.selectStation()` and `window.__game.selectTrain()` but these APIs don't exist yet. 
- Evidence: E2E tests 36–47 and 229–237 in the test spec failed with "selectStation/selectTrain is not a function".
- Severity: N/A — this is expected for phase 46, which has scenarios and achievements but station/train panels may be phase-specific or not yet wired to the debug hook.

### Edge cases / smoke tests

- ✓ **Title screen:** loads without console errors, all buttons clickable.
- ✓ **New Game flow:** can select Normal/Hard difficulty, Random/Regional maps, start a game without errors.
- ✓ **Zero cash state:** game doesn't crash or lock up; menu remains accessible; UI elements don't disappear or overflow.
- ✓ **High-speed gameplay (8×):** no visual glitches, FPS stays smooth (60 FPS per debug overlay), toasts still display.
- ✓ **Game over:** card displays correctly, buttons work, load/history/new-game all functional.
- ✓ **Save/Load:** screen loads, shows empty slots, Save button logic (visual at least) appears to work.
- ✓ **Menu navigation:** menu opens/closes, scrollable, menu items accessible even at zero cash.

## Fun & pacing

The game runs smoothly on the phone viewport. The UI is clean and uncluttered at normal gameplay, with good contrast and readable text at 800×360. The speed control and toolbar on the left feel intuitive for managing the game. Scenarios and achievements add long-term goals beyond free play. The bankruptcy flow (game-over card) is clear and gives you a second chance via "Load last autosave", which is a nice safety net for new players.

## Top 3 to fix next

1. **UX2 (menu clipping):** Add a visible scrollbar or "more items" indicator (fade or ↓ arrow) at the bottom of the menu to signal there are more options when scrolled. This is especially important if menu items grow in future phases.
2. **UX1 (zero cash signal):** Enhance the zero-cash warning with a larger/more prominent indicator (e.g., a red banner, icon, or "CASH CRISIS" label in the HUD) so it's harder to miss during a crisis.
3. **UX4 (speed buttons):** Consider a "Speed: 1× ▼" dropdown or icon-only mode on narrow viewports (< 880px) to preserve top-bar space for future HUD elements and improve phone readability.

## Not tested

- Touch drag/swipe gestures on a real phone (Playwright desktop only).
- Android-specific features: back button, immersive mode, safe area insets, landscape lock, app icon rendering.
- Color blindness modes or high-contrast settings.
- Very long game sessions (load time, save file size, performance over time).
- Specific text overflow cases (very long station/train/line names).
- Keyboard shortcuts (if any exist).
- Multiplayer or network features (if any).
