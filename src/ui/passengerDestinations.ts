/** "Where passengers go" detail sheet (PLAN Phase 35 item 5): the station's monthly passengers by first train stop,
 * each row expandable to final destinations, then the towns in range that no train connects to. Read-only. */
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
  const stationName = (id: number): string => state.stations.find((s) => s.id === id)?.name ?? "?";
  const round = (n: number): string => String(Math.max(1, Math.round(n)));
  const open = new Set<number>();

  const routes = economy.passengerRoutes ?? [];
  const groups = new Map<number, typeof routes>();
  for (const r of routes) groups.set(r.firstLeg, [...(groups.get(r.firstLeg) ?? []), r]);
  const rows = [...groups]
    .map(([firstLeg, list]) => ({
      firstLeg,
      list: [...list].sort((a, b) => b.perMonth - a.perMonth || a.cityId - b.cityId),
      total: list.reduce((s, r) => s + r.perMonth, 0),
    }))
    .sort((a, b) => b.total - a.total || a.firstLeg - b.firstLeg);
  const max = Math.max(1, ...rows.map((r) => r.total));
  const total = rows.reduce((s, r) => s + r.total, 0);

  const body = h("div", { className: "dest-sheet" });
  const render = (): void => {
    const nodes: Node[] = [];
    nodes.push(h("p", { className: "hint" }, rows.length > 0 ? t.total(round(total)) : t.none));
    for (const row of rows) {
      const expanded = open.has(row.firstLeg);
      nodes.push(
        h(
          "div",
          { className: "dest-row" },
          h(
            "button",
            {
              className: "dest-row-head",
              "aria-expanded": String(expanded),
              "aria-label": expanded ? t.collapse : t.expand,
              onClick: () => {
                if (open.has(row.firstLeg)) open.delete(row.firstLeg);
                else open.add(row.firstLeg);
                render();
              },
            },
            h("span", { className: "dest-caret" }, expanded ? "▾" : "▸"),
            h("span", { className: "dest-name" }, stationName(row.firstLeg)),
            h(
              "span",
              { className: "dest-bar-track" },
              h("span", {
                className: "dest-bar-fill",
                style: { width: `${(row.total / max) * 100}%` },
              }),
            ),
            h("span", { className: "dest-count" }, round(row.total)),
          ),
          expanded
            ? h(
                "div",
                { className: "dest-final" },
                row.list.map((r) => t.row(cityName(r.cityId), round(r.perMonth))).join(" · "),
              )
            : null,
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
