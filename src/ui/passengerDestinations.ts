/** "Where passengers go" detail sheet (PLAN Phase 35 item 5, Phase 54): the station's monthly passengers by town the
 * trains here call at, with each town's share, then the biggest towns in range that none of them serves. Read-only. */
import type { GameState } from "../sim/state";
import type { StationEconomy } from "../sim/stations/economy";
import type { Station } from "../sim/stations/types";
import { h } from "./h";
import { openSheet, type SheetHandle } from "./sheet";
import { strings } from "./strings";

const UNCONNECTED_SHOWN = 3;

export function openDestinationsSheet(
  container: HTMLElement,
  state: GameState,
  station: Station,
  economy: StationEconomy,
): SheetHandle {
  const t = strings.station.destinations;
  const cityName = (id: number): string => state.cities.find((c) => c.id === id)?.name ?? "?";
  const round = (n: number): string => String(Math.max(1, Math.round(n)));

  const rows = [...(economy.passengerRoutes ?? [])].sort(
    (x, y) => y.perMonth - x.perMonth || x.cityId - y.cityId,
  );
  const total = rows.reduce((s, r) => s + r.perMonth, 0);
  const max = Math.max(1, ...rows.map((r) => r.perMonth));

  const body = h("div", { className: "dest-sheet" });
  const render = (): void => {
    const nodes: Node[] = [];
    nodes.push(
      h(
        "p",
        { className: "hint" },
        rows.length > 0 ? t.total(round(economy.supply.passengers ?? total)) : t.none,
      ),
    );
    for (const row of rows) {
      nodes.push(
        h(
          "div",
          { className: "dest-row" },
          h(
            "div",
            { className: "dest-row-head" },
            h("span", { className: "dest-name" }, cityName(row.cityId)),
            h(
              "span",
              { className: "dest-bar-track" },
              h("span", {
                className: "dest-bar-fill",
                style: { width: `${(row.perMonth / max) * 100}%` },
              }),
            ),
            h(
              "span",
              { className: "dest-count" },
              t.row(round(row.perMonth), Math.round((row.perMonth / total) * 100)),
            ),
          ),
        ),
      );
    }
    const unconnected = economy.passengerUnconnected ?? [];
    if (unconnected.length > 0) {
      const shown = unconnected
        .slice(0, UNCONNECTED_SHOWN)
        .map((u) => `${cityName(u.cityId)} ~${round(u.perMonth)}`);
      if (unconnected.length > UNCONNECTED_SHOWN)
        shown.push(t.more(unconnected.length - UNCONNECTED_SHOWN));
      nodes.push(
        h(
          "div",
          { className: "dest-unconnected" },
          h("span", { className: "dest-unconnected-label" }, t.notConnected),
          h("span", {}, shown.join(" · ")),
          h("span", { className: "dest-unconnected-hint" }, t.notConnectedHint),
        ),
      );
    }
    body.replaceChildren(...nodes);
  };
  render();
  return openSheet(container, {
    className: "sheet-destinations",
    title: t.title,
    subtitle: t.subtitle(station.name),
    body: [body],
  });
}
