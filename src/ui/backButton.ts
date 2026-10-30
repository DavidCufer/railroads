/**
 * Android hardware back button (SPEC/PLAN Phase 2): closes the top panel/dialog if one is open;
 * otherwise asks "Exit game?". Panels register a handler while they're open (later phases — the
 * Station/Train/City/... panels — push one on open and pop it on close); with no handler
 * registered, the back button falls through to the exit prompt.
 */
import { App } from "@capacitor/app";
import { strings } from "./strings";

type BackHandler = () => void;

interface Entry {
  handler: BackHandler;
  /** Optional: false once the thing the handler belongs to is gone (its screen was removed without calling the pop). */
  alive: (() => boolean) | undefined;
}
const handlerStack: Entry[] = [];

/** Call when a panel/dialog opens; call the returned function when it closes. `alive` lets a full-screen view that
 * is removed by its owner (not by Back) drop its handler without having to pop it. */
export function pushBackHandler(handler: BackHandler, alive?: () => boolean): () => void {
  const entry: Entry = { handler, alive };
  handlerStack.push(entry);
  return () => {
    const idx = handlerStack.lastIndexOf(entry);
    if (idx !== -1) handlerStack.splice(idx, 1);
  };
}

export function initBackButton(): void {
  App.addListener("backButton", () => {
    while (handlerStack.length > 0 && handlerStack[handlerStack.length - 1]!.alive?.() === false)
      handlerStack.pop();
    const top = handlerStack[handlerStack.length - 1];
    if (top) {
      top.handler();
      return;
    }
    if (window.confirm(strings.app.exitGameConfirm)) {
      void App.exitApp();
    }
  });
}
