/**
 * Android hardware back button (SPEC/PLAN Phase 2): closes the top panel/dialog if one is open;
 * otherwise asks "Exit game?". Panels register a handler while they're open (later phases — the
 * Station/Train/City/... panels — push one on open and pop it on close); with no handler
 * registered, the back button falls through to the exit prompt.
 */
import { App } from "@capacitor/app";
import { strings } from "./strings";

type BackHandler = () => void;

const handlerStack: BackHandler[] = [];

/** Call when a panel/dialog opens; call the returned function when it closes. */
export function pushBackHandler(handler: BackHandler): () => void {
  handlerStack.push(handler);
  return () => {
    const idx = handlerStack.lastIndexOf(handler);
    if (idx !== -1) handlerStack.splice(idx, 1);
  };
}

export function initBackButton(): void {
  App.addListener("backButton", () => {
    const top = handlerStack[handlerStack.length - 1];
    if (top) {
      top();
      return;
    }
    if (window.confirm(strings.app.exitGameConfirm)) {
      void App.exitApp();
    }
  });
}
