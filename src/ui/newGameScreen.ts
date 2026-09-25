/**
 * New game screen (SPEC §4.4): Real World tab (a card per region, thumbnail rendered from the
 * committed map data, default start year, short description) and Random tab (seed + all SPEC §4.2
 * generator options), plus the common difficulty picker with starting cash shown. Fits 800x360.
 */
import type { MapSizeName, Roughness, WaterLevel } from "../data/mapGen";
import { DEFAULT_START_YEAR, RANDOM_START_YEAR_CHOICES } from "../data/mapGen";
import type { CityCount, ResourceDensity } from "../data/cities";
import { DEFAULT_DIFFICULTY, DIFFICULTY, type Difficulty } from "../data/finance";
import { REGIONS } from "../sim/regions";
import { REGION_IDS, type RegionId } from "../sim/regions/types";
import type { NewGameOptions } from "../sim/state";
import { renderRegionThumbnail } from "../render/regionThumbnail";
import { formatMoney } from "./format";
import { h } from "./h";
import { strings } from "./strings";

type Tab = "realWorld" | "random";

interface RandomOptions {
  seed: number;
  size: MapSizeName;
  waterLevel: WaterLevel;
  roughness: Roughness;
  cityCount: CityCount;
  resourceDensity: ResourceDensity;
  startYear: number;
}

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

export interface NewGameScreenHandlers {
  onStart: (options: NewGameOptions) => void;
  onBack: () => void;
}

/** A row of mutually-exclusive segmented buttons (44px targets, SPEC §10.1). */
function segmented<T>(
  value: T,
  choices: readonly T[],
  labelFor: (v: T) => string,
  onPick: (v: T) => void,
): HTMLElement {
  return h(
    "div",
    { className: "segmented-row" },
    ...choices.map((c) =>
      h(
        "button",
        {
          className: `segmented-btn${c === value ? " active" : ""}`,
          onClick: () => onPick(c),
        },
        labelFor(c),
      ),
    ),
  );
}

export function renderNewGameScreen(handlers: NewGameScreenHandlers): HTMLElement {
  const s = strings.newGame;
  let tab: Tab = "realWorld";
  let selectedRegion: RegionId = REGION_IDS.find((id) => REGIONS[id]) ?? REGION_IDS[0];
  let difficulty: Difficulty = DEFAULT_DIFFICULTY;
  let random: RandomOptions = {
    seed: randomSeed(),
    size: "medium",
    waterLevel: "normal",
    roughness: "normal",
    cityCount: "normal",
    resourceDensity: "normal",
    startYear: DEFAULT_START_YEAR,
  };

  const root = h("div", { className: "new-game-screen" });

  function currentOptions(): NewGameOptions {
    if (tab === "realWorld") {
      return { seed: 1, region: selectedRegion, difficulty };
    }
    return {
      seed: random.seed,
      size: random.size,
      waterLevel: random.waterLevel,
      roughness: random.roughness,
      cityCount: random.cityCount,
      resourceDensity: random.resourceDensity,
      startYear: random.startYear,
      difficulty,
    };
  }

  function render(): void {
    const tabs = h(
      "div",
      { className: "new-game-tabs" },
      h(
        "button",
        {
          className: `new-game-tab${tab === "realWorld" ? " active" : ""}`,
          onClick: () => {
            tab = "realWorld";
            render();
          },
        },
        s.tabRealWorld,
      ),
      h(
        "button",
        {
          className: `new-game-tab${tab === "random" ? " active" : ""}`,
          onClick: () => {
            tab = "random";
            render();
          },
        },
        s.tabRandom,
      ),
    );

    const content =
      tab === "realWorld"
        ? h(
            "div",
            { className: "region-card-row" },
            ...REGION_IDS.filter((id) => REGIONS[id]).map((id) => {
              const region = REGIONS[id];
              if (!region) return h("div");
              const thumb = renderRegionThumbnail(region);
              thumb.className = "region-thumb";
              return h(
                "button",
                {
                  className: `region-card${id === selectedRegion ? " selected" : ""}`,
                  onClick: () => {
                    selectedRegion = id;
                    render();
                  },
                },
                thumb,
                h("div", { className: "region-card-name" }, region.name),
                h("div", { className: "region-card-year" }, `${region.startYear}`),
                h("div", { className: "region-card-desc" }, s.regionDescriptions[id] ?? ""),
              );
            }),
          )
        : h(
            "div",
            { className: "random-options" },
            h(
              "div",
              { className: "option-row" },
              h("span", { className: "option-label" }, s.seed),
              h("input", {
                className: "seed-input",
                type: "number",
                value: String(random.seed),
                onInput: (e: Event) => {
                  const v = Number((e.target as HTMLInputElement).value);
                  if (Number.isFinite(v)) random.seed = v;
                },
              }),
              h(
                "button",
                {
                  className: "dice-btn",
                  onClick: () => {
                    random.seed = randomSeed();
                    render();
                  },
                },
                s.randomizeSeed,
              ),
            ),
            h(
              "div",
              { className: "option-row" },
              h("span", { className: "option-label" }, s.size),
              segmented(
                random.size,
                ["small", "medium", "large"] as const,
                (v) => s.sizeNames[v],
                (v) => {
                  random = { ...random, size: v };
                  render();
                },
              ),
            ),
            h(
              "div",
              { className: "option-row" },
              h("span", { className: "option-label" }, s.waterLevel),
              segmented(
                random.waterLevel,
                ["low", "normal", "high"] as const,
                (v) => s.waterLevelNames[v],
                (v) => {
                  random = { ...random, waterLevel: v };
                  render();
                },
              ),
            ),
            h(
              "div",
              { className: "option-row" },
              h("span", { className: "option-label" }, s.roughness),
              segmented(
                random.roughness,
                ["flat", "normal", "mountainous"] as const,
                (v) => s.roughnessNames[v],
                (v) => {
                  random = { ...random, roughness: v };
                  render();
                },
              ),
            ),
            h(
              "div",
              { className: "option-row" },
              h("span", { className: "option-label" }, s.cityCount),
              segmented(
                random.cityCount,
                ["few", "normal", "many"] as const,
                (v) => s.cityCountNames[v],
                (v) => {
                  random = { ...random, cityCount: v };
                  render();
                },
              ),
            ),
            h(
              "div",
              { className: "option-row" },
              h("span", { className: "option-label" }, s.resourceDensity),
              segmented(
                random.resourceDensity,
                ["low", "normal", "high"] as const,
                (v) => s.resourceDensityNames[v],
                (v) => {
                  random = { ...random, resourceDensity: v };
                  render();
                },
              ),
            ),
            h(
              "div",
              { className: "option-row" },
              h("span", { className: "option-label" }, s.startYear),
              segmented(
                random.startYear,
                RANDOM_START_YEAR_CHOICES,
                (v) => String(v),
                (v) => {
                  random = { ...random, startYear: v };
                  render();
                },
              ),
            ),
          );

    const footer = h(
      "div",
      { className: "new-game-footer" },
      h(
        "div",
        { className: "option-row" },
        h("span", { className: "option-label" }, s.difficulty),
        segmented(
          difficulty,
          ["easy", "normal", "hard"] as const,
          (v) => s.difficultyNames[v],
          (v) => {
            difficulty = v;
            render();
          },
        ),
      ),
      h(
        "div",
        { className: "option-row" },
        h("span", { className: "option-label" }, s.startingCash),
        h("span", { className: "starting-cash" }, formatMoney(DIFFICULTY[difficulty].startingCash)),
      ),
      h(
        "div",
        { className: "new-game-actions" },
        h("button", { className: "new-game-back-btn", onClick: handlers.onBack }, s.back),
        h(
          "button",
          {
            className: "new-game-start-btn",
            onClick: () => handlers.onStart(currentOptions()),
          },
          s.start,
        ),
      ),
    );

    root.replaceChildren(
      h("div", { className: "new-game-header" }, h("span", null, s.title)),
      tabs,
      h("div", { className: "new-game-content" }, content),
      footer,
    );
  }

  render();
  return root;
}
