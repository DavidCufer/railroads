import { beforeEach, describe, expect, it, vi } from "vitest";

let listener: (() => void) | undefined;
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: (_name: string, cb: () => void) => {
      listener = cb;
    },
    exitApp: vi.fn(),
  },
}));

describe("hardware back button stack (Phase 72)", () => {
  beforeEach(() => {
    vi.resetModules();
    listener = undefined;
    vi.stubGlobal("window", { confirm: vi.fn(() => false) });
  });

  it("calls the newest handler first, and a popped handler no more", async () => {
    const { initBackButton, pushBackHandler } = await import("../../src/ui/backButton");
    initBackButton();
    const calls: string[] = [];
    pushBackHandler(() => calls.push("a"));
    const popB = pushBackHandler(() => calls.push("b"));
    listener!();
    popB();
    listener!();
    expect(calls).toEqual(["b", "a"]);
  });

  it("skips a handler whose screen was removed without popping it", async () => {
    const { initBackButton, pushBackHandler } = await import("../../src/ui/backButton");
    initBackButton();
    const calls: string[] = [];
    pushBackHandler(() => calls.push("panel"));
    let screenOpen = true;
    pushBackHandler(
      () => calls.push("screen"),
      () => screenOpen,
    );
    listener!();
    screenOpen = false;
    listener!();
    expect(calls).toEqual(["screen", "panel"]);
  });

  it("with nothing open, asks before exiting", async () => {
    const { initBackButton } = await import("../../src/ui/backButton");
    initBackButton();
    listener!();
    expect((window as unknown as { confirm: ReturnType<typeof vi.fn> }).confirm).toHaveBeenCalled();
  });
});
