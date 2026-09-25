/**
 * Error boundary (PLAN Phase 12): an uncaught exception or unhandled promise rejection anywhere
 * in the app writes an emergency save and shows a blocking "Save & Reload" dialog, instead of the
 * game silently freezing (the render loop's `requestAnimationFrame` callback just stops
 * rescheduling itself once it throws) with no explanation and no recovery path.
 *
 * Deliberately not built on `src/ui/panel.ts`'s slide-in panel: that always has a ✕ close button
 * and an Android-back-button handler, both of which would let the player dismiss this and keep
 * looking at a game that just proved its own state is unreliable. This dialog has exactly one way
 * out — the reload button — and installs no back-button handler at all.
 */
import type { GameState } from "../sim/state";
import { emergencySave } from "../save";
import { h } from "./h";
import { strings } from "./strings";

let handled = false;

function showCrashDialog(container: HTMLElement): void {
  const overlay = h(
    "div",
    { className: "error-boundary-overlay" },
    h(
      "div",
      { className: "error-boundary-dialog" },
      h("div", { className: "error-boundary-title" }, strings.errorBoundary.title),
      h("div", { className: "error-boundary-body" }, strings.errorBoundary.body),
      h(
        "button",
        {
          className: "error-boundary-reload-btn",
          onClick: () => window.location.reload(),
        },
        strings.errorBoundary.reload,
      ),
    ),
  );
  container.appendChild(overlay);
}

/** Installs the global crash handlers once. `getState` is a thunk (not the state itself) so this
 * can be wired up once at startup, before `regenerate()`/`loadSlot()` have necessarily produced
 * the `GameState` object the crash should actually save — by the time any real crash happens,
 * calling it returns whatever the current game state is. */
export function installErrorBoundary(container: HTMLElement, getState: () => GameState): void {
  function handleCrash(reason: unknown): void {
    // Only the first crash gets a dialog + save — once `handled` is true the app is already
    // frozen behind the overlay, and a second error (quite possible once one thing has gone
    // wrong) shouldn't try to overwrite the emergency slot mid-write or stack a second dialog.
    if (handled) return;
    handled = true;
    // The only record of what crashed once the dialog is up — the player's only path forward is
    // "reload", not "keep debugging live".
    console.error("[error boundary]", reason);
    emergencySave(getState()).catch((saveError: unknown) => {
      console.error("[error boundary] emergency save failed", saveError);
    });
    showCrashDialog(container);
  }

  window.addEventListener("error", (event) => handleCrash(event.error ?? event.message));
  window.addEventListener("unhandledrejection", (event) => handleCrash(event.reason));
}

/** Test/debug-only: fires the same path a real crash would, without actually corrupting
 * anything — `src/main.ts` exposes this as `window.__game.debugThrow(kind)` under `?debug=1`. */
export function debugTriggerCrash(kind: "sync" | "async"): void {
  if (kind === "sync") {
    // Thrown on a fresh macrotask so it's a genuine uncaught exception (window "error" event),
    // not one this function's own caller could catch with a try/catch around the call site.
    setTimeout(() => {
      throw new Error("debug throw (sync)");
    }, 0);
  } else {
    void Promise.reject(new Error("debug throw (async)"));
  }
}
