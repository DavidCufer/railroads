/**
 * Live refresh for sheets and wizard steps (PLAN Phase 34 item 2). Side panels use `PanelOptions.live`;
 * a sheet has no render function to re-run, so it registers a `tick` that patches its dynamic parts in place
 * (cash-dependent buttons, prices). The timer stops itself as soon as `isOpen()` turns false.
 */
const LIVE_MS = 700;

export function startLive(isOpen: () => boolean, tick: () => void): void {
  const timer = window.setInterval(() => {
    if (!isOpen()) {
      window.clearInterval(timer);
      return;
    }
    tick();
  }, LIVE_MS);
}
