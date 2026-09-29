/** Info-mode panels: tap a city or industry to see its basic info (SPEC §10.2, PLAN Phase 3). */
import { CARGO, type CargoType } from "../data/cargo";
import { INDUSTRIES, producersOf } from "../data/industries";
import { nearestOf } from "../sim/economy/chains";
import {
  CIVIC_INVESTMENT_COOLDOWN_YEARS,
  CITY_TIER_DEFS,
  CITY_TIERS,
  type CityTier,
} from "../data/cities";
import type { Industry } from "../sim/economy/types";
import { cityAcceptance, citySupply, tierUnlocks } from "../sim/economy/cityStats";
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
import { showToast } from "./toast";
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
): HTMLElement {
  const def = CARGO[cargo];
  // Whole units only ("17.2" reads as noise); a tiny non-zero rate still shows as 1.
  amount = amount > 0 ? Math.max(1, Math.round(amount)) : 0;
  return h(
    "button",
    {
      className: `chip${large ? " chip-lg" : ""}${dimmed ? " chip-dim" : ""}`,
      "aria-label": def.name,
      onClick: () => showToast(container, `${def.name}: ${amount}${suffix}`, "info"),
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
): HTMLElement {
  const def = CARGO[cargo];
  const met = points >= STATION_ACCEPTANCE_THRESHOLD;
  return h(
    "button",
    {
      className: `chip${large ? " chip-lg" : ""}${met ? "" : " chip-dim"}`,
      "aria-label": def.name,
      onClick: () =>
        showToast(
          container,
          met
            ? def.name
            : `${def.name}: needs ${STATION_ACCEPTANCE_THRESHOLD} pts, has ${Math.round(points)}`,
          met ? "info" : "warn",
        ),
    },
    cargoIcon(cargo, large ? "cargo-icon-lg" : "cargo-icon-sm"),
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
    const supply = citySupply(city);
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
              supply.passengers,
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
    });
  };

  render();
}

export interface IndustryPanelContext {
  /** All industries on the map, to find the nearest source of each input. */
  industries: readonly Industry[];
  startYear: number;
  /** Centres the map on an industry (the nearest-source rows are tappable). */
  onCenter?: (industry: Industry) => void;
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

/** One card row per input cargo: its pictogram and the nearest producer of it (name + distance),
 * tappable to centre the map there. */
function nearestSourceRows(
  container: HTMLElement,
  industry: Industry,
  ctx: IndustryPanelContext,
): HTMLElement {
  const def = INDUSTRIES[industry.type];
  const rows = (Object.keys(def.consumes) as CargoType[]).map((cargo) => {
    const types = producersOf(cargo).filter((t) => INDUSTRIES[t].era <= ctx.startYear);
    const near = nearestOf(ctx.industries, types, industry);
    const meta = near
      ? strings.industry.tilesAway(Math.round(near.distance))
      : strings.industry.noSourceNearby;
    const title = near ? INDUSTRIES[near.industry.type].name : CARGO[cargo].name;
    return cardRow({
      className: `industry-source${near ? "" : " chip-dim"}`,
      thumb: cargoIcon(cargo, "cargo-icon-lg"),
      title,
      meta,
      trailing: near ? icon("mapPin", "icon-sm") : undefined,
      disabled: !near || !ctx.onCenter,
      onClick: () => {
        if (near) ctx.onCenter?.(near.industry);
        void container;
      },
    });
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
  const recipe = recipeLine(industry.type);
  if (recipe) body.push(recipe);

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
      body.push(
        section(strings.industry.nearestSources, [nearestSourceRows(container, industry, ctx)]),
      );
    }
  }

  const firstOutput = produces[0]?.[0];
  openPanel(container, {
    title: def.name,
    subtitle: strings.industry.since(def.era),
    thumb: firstOutput ? cargoIcon(firstOutput) : icon("factory"),
    body,
    key: `industry:${industry.id}`,
  });
}
