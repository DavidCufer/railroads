/**
 * Safe-area insets (notch, status bar, gesture bar) in CSS px, read from the `--safe-*` CSS variables
 * that theme.css defines from `env(safe-area-inset-*)` (PLAN 23B). Canvas-drawn UI (mini-map) and JS-
 * positioned popups add these so nothing ever sits under a notch or the status bar. All zero on desktop.
 */
export interface SafeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

let current: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export function safeInsets(): SafeInsets {
  return current;
}

/** Re-reads the insets from CSS (call on load, resize and orientation change). */
export function refreshSafeInsets(): SafeInsets {
  try {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;visibility:hidden;pointer-events:none;left:0;top:0;" +
      "padding:var(--safe-top,0px) var(--safe-right,0px) var(--safe-bottom,0px) var(--safe-left,0px)";
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    current = {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0,
    };
    probe.remove();
  } catch {
    current = { top: 0, right: 0, bottom: 0, left: 0 };
  }
  return current;
}
