/** Info-mode panels: tap a city or industry to see its basic info (SPEC §10.2, PLAN Phase 3). */
import { KM_PER_TILE } from "../data/scale";
import { formatDistance, loadSettings } from "./settings";
import { CARGO, type CargoType } from "../data/cargo";
import { INDUSTRIES, LONG_HAUL_CHAINS, producersOf } from "../data/industries";
import { nearestOf } from "../sim/economy/chains";
import {
  CIVIC_INVESTMENT_COOLDOWN_YEARS,
  CITY_TIER_DEFS,
  CITY_TIERS,
  CITY_TIER_DEMAND_POINTS,
  type CityTier,
} from "../data/cities";
import type { City, Industry } from "../sim/economy/types";
import {
  cityAcceptance,
  citySupply,
  cityTravelDemand,
  tierUnlocks,
} from "../sim/economy/cityStats";
import { civicInvestment, computeCivicInvestmentPlan } from "../sim/commands";
import { stationCatchmentTiles } from "../sim/stations/placement";
import { STATION_ACCEPTANCE_THRESHOLD, STATION_TYPE_DEFS } from "../data/stations";
import type { Station } from "../sim/stations/types";
import type { GameState } from "../sim/state";
import { calendarFromTicks, DAYS_PER_YEAR, HOURS_PER_DAY } from "../sim/time";
import { h } from "./h";
import { cargoIcon, icon, type IconName } from "./icons";
import { cardList, cardRow } from "./components/cardRow";
import { section } from "./components/section";
import { emptyState } from "./components/emptyState";
import { openPanel } from "./panel";
import { showExplanation, showToast } from "./toast";
import { strings } from "./strings";
import { formatMoney, formatPopulation } from "./format";

/** City panel "Next tier: City at 25k — unlocks demand for Fuel" plus the growth hint (PLAN 26A). */
function nextTierRows(city: { tier: CityTier; population: number }, year: number): HTMLElement[] {
  const hint = h("p", { className: "section-note" }, strings.city.growthHint);
  const next = CITY_TIERS[CITY_TIERS.indexOf(city.tier) + 1];
  if (!next) return [row(strings.city.nextTier, strings.city.topTier), hint];
  const unlocks = tierUnlocks(next, year)
    .map((c) => CARGO[c].name)
    .join(", ");
  return [
    row(
      strings.city.nextTier,
      strings.city.nextTierValue(
        strings.city.tierNames[next],
        formatPopulation(CITY_TIER_DEFS[next].minPop),
        unlocks,
      ),
    ),
    hint,
  ];
}

export function row(label: string, value: string): HTMLElement {
  return h(
    "div",
    { className: "panel-row" },
    h("span", { className: "label" }, label),
    h("span", null, value),
  );
}

/** Picks readable black/white chip text against an arbitrary `#rrggbb` background. */
export function chipTextColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#1a1a1a" : "#f4f1e8";
}

/** A cargo chip: pictogram + amount (STYLE §6; the unit/"per month" rides in the section note and the
 * tap toast, "icon + number" per STYLE §8) — tapping shows the cargo's full name in a toast,
 * a lightweight stand-in for STYLE's "small popover with the cargo name and details". `large`
 * bumps the pictogram tile up (28px tile/18px icon vs. the usual 18px/12px) for panels — the City
 * panel — where the default size reads too small next to its bigger 2-column action grid. */
export function cargoChip(
  container: HTMLElement,
  cargo: CargoType,
  amount: number,
  suffix = "",
  dimmed = false,
  large = false,
  onTap?: () => void,
): HTMLElement {
  const def = CARGO[cargo];
  // Whole units only ("17.2" reads as noise); a tiny non-zero rate still shows as 1.
  amount = amount > 0 ? Math.max(1, Math.round(amount)) : 0;
  return h(
    "button",
    {
      className: `chip${large ? " chip-lg" : ""}${dimmed ? " chip-dim" : ""}`,
      "aria-label": def.name,
      onClick:
        onTap ?? (() => showExplanation(container, `${def.name}: ${amount}${suffix}`, "info")),
    },
    cargoIcon(cargo, large ? "cargo-icon-lg" : "cargo-icon-sm"),
    String(amount),
  );
}

/** A demand tile (STYLE §6): pictogram only, dimmed + a toast with the shortfall when the
 * station's acceptance points for this cargo are below the unlock threshold. `large` — see
 * `cargoChip`. */
export function cargoDemandTile(
  container: HTMLElement,
  cargo: CargoType,
  points: number,
  large = false,
  /** Who accepts it (Phase 29 D): `text` is added to the tap toast; `badge` (set when only industries accept
   * it, e.g. a Port) puts that industry's icon on the tile. */
  source?: { text: string; badge?: IconName },
): HTMLElement {
  const def = CARGO[cargo];
  const met = points >= STATION_ACCEPTANCE_THRESHOLD;
  return h(
    "button",
    {
      className: `chip${large ? " chip-lg" : ""}${met ? "" : " chip-dim"}${source?.badge ? " chip-badged" : ""}`,
      "aria-label": def.name,
      onClick: () =>
        showExplanation(
          container,
          met
            ? source
              ? `${def.name} — ${source.text}`
              : def.name
            : `${def.name}: needs ${STATION_ACCEPTANCE_THRESHOLD} pts, has ${Math.round(points)}`,
          met ? "info" : "warn",
        ),
    },
    cargoIcon(cargo, large ? "cargo-icon-lg" : "cargo-icon-sm"),
    source?.badge ? h("span", { className: "chip-badge" }, icon(source.badge, "icon-xxs")) : null,
  );
}

/** Stations whose catchment covers at least one of `cityTiles` — the City panel's "Served by"
 * line (STYLE §6). */
export function stationsServing(state: GameState, cityTiles: readonly number[]): string[] {
  return stationsServingList(state, cityTiles).map((s) => s.name);
}

/** Same as `stationsServing` but returns the stations themselves (tap targeting, tappable links). */
export function stationsServingList(state: GameState, tiles: readonly number[]): Station[] {
  const tileSet = new Set(tiles);
  return state.stations.filter((station) => {
    const radius = STATION_TYPE_DEFS[station.type].catchmentRadius;
    const catchment = stationCatchmentTiles(state.map, station.tile, radius);
    return catchment.some((t) => tileSet.has(t));
  });
}

const TIER_ICONS: Record<string, IconName> = {
  village: "village",
  town: "town",
  city: "city",
  metropolis: "metropolis",
};

export function openCityPanel(
  container: HTMLElement,
  state: GameState,
  cityId: number,
  onOpenStation?: (stationId: number) => void,
): void {
  const render = (): void => {
    const city = state.cities.find((c) => c.id === cityId);
    if (!city) return;
    const currentYear = calendarFromTicks(state.startYear, state.ticks).year;
    const supply = citySupply(city, currentYear);
    // Passengers: the town's total travel demand (population x trips per head), the same number the station panels
    // draw from; "connected" is the part of it the stations here reach by train (Phase 35C).
    const demand = cityTravelDemand(city, currentYear);
    let connectedPassengers = 0;
    const missed = new Map<number, number>(); // town -> travellers a month it would send here, not yet reached
    const reached = new Set<number>();
    for (const station of state.stations) {
      const eco = state.stationEconomy.get(station.id);
      if (eco?.passengerTownId !== cityId) continue;
      for (const r of eco.passengerRoutes ?? []) {
        connectedPassengers += r.perMonth;
        reached.add(r.cityId);
      }
      for (const u of eco.passengerUnconnected ?? [])
        missed.set(u.cityId, Math.max(missed.get(u.cityId) ?? 0, u.perMonth));
    }
    const unreached = [...missed]
      .filter(([id]) => !reached.has(id))
      .sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    const accepts = cityAcceptance(city, currentYear);
    const acceptEntries = Object.entries(accepts) as Array<[CargoType, number]>;
    const growth = state.cityGrowth.get(cityId);

    const growing = !!growth?.lastServed;
    const served = stationsServingList(state, city.tiles);

    const body: Node[] = [
      section(
        strings.station.supplies,
        [
          h(
            "div",
            { className: "chip-row" },
            cargoChip(
              container,
              "passengers",
              demand,
              strings.station.supplyRate(CARGO.passengers.unit),
              false,
              true,
            ),
            cargoChip(
              container,
              "mail",
              supply.mail,
              strings.station.supplyRate(CARGO.mail.unit),
              false,
              true,
            ),
          ),
          demand > 0 && connectedPassengers > 0
            ? cityConnectedCard(state, connectedPassengers, demand, unreached)
            : null,
        ],
        strings.station.perMonthNote,
      ),
      section(strings.city.growthTitle, nextTierRows(city, currentYear)),
      section(strings.station.accepts, [
        acceptEntries.length > 0
          ? h(
              "div",
              { className: "chip-row" },
              ...acceptEntries.map(([cargo, points]) =>
                cargoDemandTile(container, cargo, points, true),
              ),
            )
          : emptyState(strings.station.noDemands, "cargo"),
      ]),
      section(strings.city.servedBy, [
        served.length > 0
          ? h(
              "div",
              { className: "chip-row served-by-row panel-row" },
              ...served.map((station) =>
                h(
                  "button",
                  {
                    className: "chip chip-link",
                    "data-testid": "served-by-station",
                    onClick: () => onOpenStation?.(station.id),
                  },
                  icon(
                    station.type === "terminal"
                      ? "terminal"
                      : station.type === "depot"
                        ? "depot"
                        : "station",
                    "icon-sm",
                  ),
                  station.name,
                ),
              ),
            )
          : emptyState(strings.city.servedByNone, "station"),
      ]),
    ];

    const plan = computeCivicInvestmentPlan(state, cityId);
    const lastTick = growth?.lastCivicInvestmentTick;
    const onCooldown = !plan.valid && lastTick !== undefined;
    let civicDetail = `${formatMoney(plan.cost)} · ${strings.city.civicInvestmentShort}`;
    if (!plan.valid && !onCooldown) civicDetail = strings.city.civicNeedsRail;
    if (onCooldown) {
      const yearsSince = (state.ticks - lastTick) / (HOURS_PER_DAY * DAYS_PER_YEAR);
      const yearsLeft = Math.max(0, Math.ceil(CIVIC_INVESTMENT_COOLDOWN_YEARS - yearsSince));
      civicDetail = strings.city.civicInvestmentCooldown(yearsLeft);
    }
    body.push(
      section(strings.ui.actions, [
        h(
          "div",
          { className: "action-grid" },
          h(
            "button",
            {
              className: "action-btn city-civic-investment-btn",
              title: strings.city.civicInvestmentDesc,
              disabled: !plan.valid || plan.cost > state.cash,
              onClick: () => {
                const result = civicInvestment(state, cityId);
                if (!result.ok) {
                  showToast(container, strings.build.reasons[result.reason], "warn");
                  return;
                }
                render();
              },
            },
            h(
              "span",
              { className: "action-btn-label" },
              icon("arrowUp", "icon-sm"),
              strings.city.civicInvestment,
            ),
            h("span", { className: "action-btn-detail" }, civicDetail),
          ),
        ),
      ]),
    );

    // Trend arrow only while growing; a flat dash after the population reads as a broken glyph.
    const growthIcon = growing ? icon("arrowUp", "tone-go") : null;
    growthIcon?.setAttribute("aria-label", strings.city.growing);
    const subtitle = h(
      "span",
      null,
      `${strings.city.tierNames[city.tier]} · ${formatPopulation(city.population)}`,
      ...(growthIcon ? [growthIcon] : []),
    );

    openPanel(container, {
      title: city.name,
      subtitle,
      thumb: icon(TIER_ICONS[city.tier] ?? "town"),
      body,
      key: `city:${cityId}`,
      live: render,
    });
  };

  render();
}

export interface IndustryPanelContext {
  /** All industries on the map, to find the nearest source of each input. */
  industries: readonly Industry[];
  startYear: number;
  /** Towns on the map, as buyers of finished goods (optional). */
  cities?: readonly City[];
  /** Centres the map on an industry or town (the nearest-source / buyer / chain rows are tappable). */
  onCenter?: (target: { x: number; y: number }) => void;
}

/** Cargo an industry takes in: its inputs plus whatever it only accepts (Mint, Nuclear Power Plant, Port). */
function acceptedCargo(type: Industry["type"]): CargoType[] {
  const def = INDUSTRIES[type];
  return Array.from(
    new Set([...Object.keys(def.consumes), ...Object.keys(def.acceptancePoints)]),
  ) as CargoType[];
}

/** Phase 75: one tappable row per cargo, showing the nearest thing of `cargo` the player can reach. */
function nearestRow(
  cargo: CargoType,
  near: { name: string; x: number; y: number; distance: number } | undefined,
  ctx: IndustryPanelContext,
  className: string,
): HTMLElement {
  return cardRow({
    className: `${className}${near ? "" : " chip-dim"}`,
    thumb: cargoIcon(cargo, "cargo-icon-lg"),
    title: near ? near.name : CARGO[cargo].name,
    meta: near
      ? formatDistance(near.distance * KM_PER_TILE, loadSettings().units)
      : strings.industry.noSourceNearby,
    trailing: near ? icon("mapPin", "icon-sm") : undefined,
    disabled: !near || !ctx.onCenter,
    onClick: () => {
      if (near) ctx.onCenter?.(near);
    },
  });
}

/** "Nearest buyers": for each cargo this industry makes, the nearest industry or town that takes it. */
function nearestBuyerRows(industry: Industry, ctx: IndustryPanelContext): HTMLElement {
  const def = INDUSTRIES[industry.type];
  const rows = (Object.keys(def.produces) as CargoType[]).map((cargo) => {
    let best: { name: string; x: number; y: number; distance: number } | undefined;
    const consider = (name: string, x: number, y: number): void => {
      const distance = Math.hypot(x - industry.x, y - industry.y);
      if (!best || distance < best.distance) best = { name, x, y, distance };
    };
    for (const other of ctx.industries) {
      if (other === industry || INDUSTRIES[other.type].era > ctx.startYear) continue;
      if (acceptedCargo(other.type).includes(cargo))
        consider(INDUSTRIES[other.type].name, other.x, other.y);
    }
    for (const city of ctx.cities ?? []) {
      if ((CITY_TIER_DEMAND_POINTS[city.tier][cargo] ?? 0) > 0)
        consider(city.name, city.anchorX, city.anchorY);
    }
    return nearestRow(cargo, best, ctx, "industry-buyer");
  });
  return cardList(...rows);
}

/** The whole long-haul chain as icons with arrows, this industry highlighted, each step tappable to the nearest one. */
function chainLine(industry: Industry, ctx: IndustryPanelContext): HTMLElement | null {
  const chain = Object.values(LONG_HAUL_CHAINS).find((c) =>
    [c.mine, c.processor, c.sink].includes(industry.type),
  );
  if (!chain) return null;
  const steps = [chain.mine, chain.processor, chain.sink];
  const parts: Node[] = [];
  steps.forEach((type, i) => {
    if (i > 0) parts.push(icon("chevronRight", "recipe-arrow"));
    const def = INDUSTRIES[type];
    const here = type === industry.type;
    const near = here ? undefined : nearestOf(ctx.industries, [type], industry);
    const cargo = (Object.keys(def.produces)[0] ??
      Object.keys(def.acceptancePoints)[0]) as CargoType;
    parts.push(
      h(
        "button",
        {
          className: `chain-step${here ? " chain-here" : ""}${!here && !near ? " chip-dim" : ""}`,
          type: "button",
          disabled: here || !near || !ctx.onCenter,
          "aria-label": here
            ? strings.industry.chainHere(def.name)
            : near
              ? strings.industry.chainShow(def.name)
              : `${def.name}: ${strings.industry.noSourceNearby}`,
          "data-testid": `chain-${type}`,
          onclick: () => {
            if (near) ctx.onCenter?.(near.industry);
          },
        },
        cargoIcon(cargo, "cargo-icon-lg"),
        h("span", { className: "chain-name" }, def.name),
      ),
    );
  });
  return h("div", { className: "industry-chain", "data-testid": "industry-chain" }, ...parts);
}

/** The recipe as pictograms: "[steel] or [lumber] → [goods]" (inputs joined by "or"/"and"); the
 * whole sentence rides in the row's aria-label. Null for industries with no inputs. */
function recipeLine(type: Industry["type"]): HTMLElement | null {
  const def = INDUSTRIES[type];
  const inputs = Object.keys(def.consumes) as CargoType[];
  if (inputs.length === 0) return null;
  const outputs = Object.keys(def.produces) as CargoType[];
  const all = def.recipeMode === "all";
  const joiner = all ? strings.industry.and : strings.industry.or;
  const names = (list: CargoType[]): string => list.map((c) => CARGO[c].name).join(` ${joiner} `);
  const label = all
    ? strings.industry.recipeNeeds(names(inputs))
    : strings.industry.recipeMakes(outputs.map((c) => CARGO[c].name).join(", "), names(inputs));
  const parts: Node[] = [];
  inputs.forEach((cargo, i) => {
    if (i > 0) parts.push(h("span", { className: "recipe-joiner" }, joiner));
    parts.push(cargoIcon(cargo, "cargo-icon-lg"));
  });
  if (outputs.length > 0) {
    parts.push(icon("chevronRight", "recipe-arrow"));
    for (const cargo of outputs) parts.push(cargoIcon(cargo, "cargo-icon-lg"));
  }
  return h("div", { className: "industry-recipe", role: "img", "aria-label": label }, ...parts);
}

/** One card row per accepted cargo: its pictogram and the nearest producer of it (name + distance),
 * tappable to centre the map there. */
function nearestSourceRows(industry: Industry, ctx: IndustryPanelContext): HTMLElement {
  const rows = acceptedCargo(industry.type).map((cargo) => {
    const types = producersOf(cargo).filter((t) => INDUSTRIES[t].era <= ctx.startYear);
    const near = nearestOf(ctx.industries, types, industry);
    return nearestRow(
      cargo,
      near && {
        name: INDUSTRIES[near.industry.type].name,
        x: near.industry.x,
        y: near.industry.y,
        distance: near.distance,
      },
      ctx,
      "industry-source",
    );
  });
  return cardList(...rows);
}

export function openIndustryPanel(
  container: HTMLElement,
  industry: Industry,
  ctx?: IndustryPanelContext,
): void {
  const def = INDUSTRIES[industry.type];
  const produces = Object.entries(def.produces) as Array<[CargoType, number]>;
  const consumes = Object.entries(def.consumes) as Array<[CargoType, number]>;

  const body: Node[] = [];
  const chain = ctx ? chainLine(industry, ctx) : null;
  if (chain) body.push(chain);
  const recipe = recipeLine(industry.type);
  if (recipe && !chain) body.push(recipe);

  const perMonth = strings.industry.perMonthNote;
  if (produces.length > 0) {
    body.push(
      section(
        strings.industry.produces,
        [
          h(
            "div",
            { className: "chip-row" },
            ...produces.map(([cargo, amount]) =>
              cargoChip(container, cargo, amount, strings.industry.perMonth, false, true),
            ),
          ),
        ],
        perMonth,
      ),
    );
  }
  const accepted = acceptedCargo(industry.type);
  const sinkOnly = consumes.length === 0 && accepted.length > 0;
  if (sinkOnly) {
    body.push(
      section(strings.industry.accepts, [
        h(
          "div",
          { className: "chip-row" },
          ...accepted.map((cargo) =>
            h(
              "span",
              { className: "chip chip-lg" },
              cargoIcon(cargo, "cargo-icon-lg"),
              CARGO[cargo].name,
            ),
          ),
        ),
      ]),
    );
  }
  if (consumes.length > 0) {
    body.push(
      section(
        strings.industry.consumes,
        [
          h(
            "div",
            { className: "chip-row" },
            ...consumes.map(([cargo, amount]) =>
              cargoChip(container, cargo, amount, strings.industry.perMonth, false, true),
            ),
          ),
        ],
        perMonth,
      ),
    );
    if (ctx) {
      body.push(section(strings.industry.nearestSources, [nearestSourceRows(industry, ctx)]));
    }
  }
  if (ctx && sinkOnly) {
    body.push(section(strings.industry.nearestSources, [nearestSourceRows(industry, ctx)]));
  }
  if (ctx && produces.length > 0) {
    body.push(section(strings.industry.nearestBuyers, [nearestBuyerRows(industry, ctx)]));
  }

  const firstOutput = produces[0]?.[0];
  openPanel(container, {
    title: def.name,
    subtitle: strings.industry.since(def.era),
    thumb: firstOutput ? cargoIcon(firstOutput) : icon("factory"),
    body,
    key: `industry:${industry.id}`,
    live: () => openIndustryPanel(container, industry, ctx),
  });
}

/** Phase 74: how much of the town's travel demand the trains here reach: a bar, the figures and the biggest towns not
 * reached yet as chips (same look as "Where passengers go"). */
function cityConnectedCard(
  state: GameState,
  connected: number,
  demand: number,
  unreached: ReadonlyArray<readonly [number, number]>,
): HTMLElement {
  const t = strings.city;
  const pct = Math.min(100, Math.round((connected / demand) * 100));
  const name = (id: number): string => state.cities.find((c) => c.id === id)?.name ?? "?";
  const shown = unreached.slice(0, 3);
  return h(
    "div",
    { className: "city-connected", "data-testid": "city-connected" },
    h(
      "div",
      { className: "dest-row-head" },
      h("span", { className: "dest-name" }, t.connectedTitle),
      h(
        "span",
        { className: "dest-count" },
        t.connectedCount(String(Math.max(1, Math.round(connected))), pct),
      ),
    ),
    h(
      "span",
      { className: "dest-bar-track" },
      h("span", { className: "dest-bar-fill", style: { width: `${pct}%` } }),
    ),
    shown.length > 0
      ? h(
          "div",
          { className: "dest-unconnected" },
          h("span", { className: "dest-unconnected-label" }, t.notReached),
          h(
            "div",
            { className: "dest-chips" },
            ...shown.map(([id, n]) =>
              h(
                "span",
                { className: "dest-chip" },
                strings.station.destinations.chip(String(Math.max(1, Math.round(n))), name(id)),
              ),
            ),
            unreached.length > shown.length
              ? h(
                  "span",
                  { className: "dest-chip" },
                  strings.station.destinations.more(unreached.length - shown.length),
                )
              : null,
          ),
        )
      : null,
  );
}
