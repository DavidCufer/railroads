/** Info-mode panels: tap a city or industry to see its basic info (SPEC §10.2, PLAN Phase 3). */
import { CARGO, type CargoType } from "../data/cargo";
import { INDUSTRIES, producersOf } from "../data/industries";
import { nearestOf } from "../sim/economy/chains";
import { CIVIC_INVESTMENT_COOLDOWN_YEARS } from "../data/cities";
import type { Industry } from "../sim/economy/types";
import { cityAcceptance, citySupply } from "../sim/economy/cityStats";
import { civicInvestment, computeCivicInvestmentPlan } from "../sim/commands";
import { stationCatchmentTiles } from "../sim/stations/placement";
import { STATION_ACCEPTANCE_THRESHOLD, STATION_TYPE_DEFS } from "../data/stations";
import type { Station } from "../sim/stations/types";
import type { GameState } from "../sim/state";
import { calendarFromTicks, DAYS_PER_YEAR, HOURS_PER_DAY } from "../sim/time";
import { h } from "./h";
import { cargoIcon, icon } from "./icons";
import { openPanel } from "./panel";
import { showToast } from "./toast";
import { strings } from "./strings";
import { formatMoney, formatPopulation } from "./format";

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

/** A cargo chip: pictogram + amount (STYLE §6) — tapping shows the cargo's full name in a toast,
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
  return h(
    "button",
    {
      className: `chip${large ? " chip-lg" : ""}${dimmed ? " chip-dim" : ""}`,
      "aria-label": def.name,
      onClick: () => showToast(container, `${def.name}: ${amount}${suffix}`, "info"),
    },
    cargoIcon(cargo, large ? "cargo-icon-lg" : "cargo-icon-sm"),
    `${amount}${suffix}`,
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
      h("div", { className: "panel-section-title" }, strings.station.supplies),
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
      h("div", { className: "panel-section-title" }, strings.station.accepts),
      h(
        "div",
        { className: "chip-row" },
        ...acceptEntries.map(([cargo, points]) => cargoDemandTile(container, cargo, points, true)),
      ),
      h("div", { className: "panel-section-title" }, strings.city.servedBy),
      h(
        "div",
        { className: "panel-row served-by-row" },
        ...(served.length > 0
          ? served.flatMap((station, i) => [
              i > 0 ? " · " : null,
              h(
                "button",
                {
                  className: "link-btn",
                  "data-testid": "served-by-station",
                  onClick: () => onOpenStation?.(station.id),
                },
                station.name,
              ),
            ])
          : [strings.city.servedByNone]),
      ),
    ];

    const plan = computeCivicInvestmentPlan(state, cityId);
    const lastTick = growth?.lastCivicInvestmentTick;
    const onCooldown = !plan.valid && lastTick !== undefined;
    let civicDetail = formatMoney(plan.cost);
    if (onCooldown) {
      const yearsSince = (state.ticks - lastTick) / (HOURS_PER_DAY * DAYS_PER_YEAR);
      const yearsLeft = Math.max(0, Math.ceil(CIVIC_INVESTMENT_COOLDOWN_YEARS - yearsSince));
      civicDetail = strings.city.civicInvestmentCooldown(yearsLeft);
    }
    body.push(h("div", { className: "panel-section-title" }, strings.ui.actions));
    body.push(
      h(
        "div",
        { className: "action-grid" },
        h(
          "button",
          {
            className: "action-btn city-civic-investment-btn",
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
    );
    body.push(h("div", { className: "panel-row" }, strings.city.civicInvestmentDesc));

    const growthIcon = icon(growing ? "arrowUp" : "arrowFlat");
    growthIcon.setAttribute("aria-label", growing ? strings.city.growing : strings.city.stagnant);
    const subtitle = h(
      "span",
      null,
      `${strings.city.tierNames[city.tier]} · ${formatPopulation(city.population)}`,
      growthIcon,
    );

    openPanel(container, { title: city.name, subtitle, body });
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

/** "Makes Goods from Steel or Lumber" (either input works) / "Needs Coal and Iron ore" (all needed),
 * with the joining word emphasised. Null for industries with no inputs. */
function recipeLine(type: Industry["type"]): HTMLElement | null {
  const def = INDUSTRIES[type];
  const inputs = Object.keys(def.consumes) as CargoType[];
  if (inputs.length === 0) return null;
  const joiner = def.recipeMode === "all" ? strings.industry.and : strings.industry.or;
  const list: Array<Node | string> = [];
  inputs.forEach((cargo, i) => {
    if (i > 0) list.push(" ", h("strong", null, joiner), " ");
    list.push(CARGO[cargo].name);
  });
  const outputs = (Object.keys(def.produces) as CargoType[]).map((c) => CARGO[c].name).join(", ");
  return h(
    "div",
    { className: "panel-row industry-recipe" },
    def.recipeMode === "all"
      ? h("span", null, `${strings.industry.needs} `, ...list)
      : h(
          "span",
          null,
          `${strings.industry.makes} ${outputs} ${strings.industry.makesFrom} `,
          ...list,
        ),
  );
}

/** One row per input cargo: its pictogram and the nearest producer of it (name + distance),
 * tappable to centre the map there. */
function nearestSourceRows(
  container: HTMLElement,
  industry: Industry,
  ctx: IndustryPanelContext,
): HTMLElement[] {
  const def = INDUSTRIES[industry.type];
  return (Object.keys(def.consumes) as CargoType[]).map((cargo) => {
    const types = producersOf(cargo).filter((t) => INDUSTRIES[t].era <= ctx.startYear);
    const near = nearestOf(ctx.industries, types, industry);
    const label = near
      ? `${INDUSTRIES[near.industry.type].name} · ${strings.industry.tilesAway(Math.round(near.distance))}`
      : strings.industry.noSourceNearby;
    return h(
      "button",
      {
        className: `panel-row industry-source${near ? "" : " chip-dim"}`,
        disabled: !near || !ctx.onCenter,
        "aria-label": near ? `${strings.industry.showOnMap}: ${label}` : label,
        onClick: () => {
          if (near) ctx.onCenter?.(near.industry);
          void container;
        },
      },
      cargoIcon(cargo, "cargo-icon-sm"),
      h("span", { className: "label" }, CARGO[cargo].name),
      h("span", null, label),
    );
  });
}

export function openIndustryPanel(
  container: HTMLElement,
  industry: Industry,
  ctx?: IndustryPanelContext,
): void {
  const def = INDUSTRIES[industry.type];
  const produces = Object.entries(def.produces) as Array<[CargoType, number]>;
  const consumes = Object.entries(def.consumes) as Array<[CargoType, number]>;

  const body: Node[] = [row(strings.industry.availableFrom, String(def.era))];
  const recipe = recipeLine(industry.type);
  if (recipe) body.push(recipe);

  if (produces.length > 0) {
    body.push(h("div", { className: "panel-section-title" }, strings.industry.produces));
    body.push(
      h(
        "div",
        { className: "chip-row" },
        ...produces.map(([cargo, amount]) =>
          cargoChip(container, cargo, amount, strings.industry.perMonth),
        ),
      ),
    );
  }
  if (consumes.length > 0) {
    body.push(h("div", { className: "panel-section-title" }, strings.industry.consumes));
    body.push(
      h(
        "div",
        { className: "chip-row" },
        ...consumes.map(([cargo, amount]) =>
          cargoChip(container, cargo, amount, strings.industry.perMonth),
        ),
      ),
    );
    if (ctx) {
      body.push(h("div", { className: "panel-section-title" }, strings.industry.nearestSources));
      body.push(...nearestSourceRows(container, industry, ctx));
    }
  }

  openPanel(container, { title: def.name, body });
}
