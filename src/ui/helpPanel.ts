/**
 * Help (PLAN Phase 26B): two one-screen explainers reachable from the ☰ menu — "Station upgrades"
 * and "How money works". Icons + short lines; all text lives in strings.ts.
 */
import {
  STATION_IMPROVEMENT_TYPES,
  STATION_TYPES,
  type StationImprovementType,
  type StationType,
} from "../data/stations";
import { cardList, cardRow } from "./components/cardRow";
import { section } from "./components/section";
import { tabs } from "./components/tabs";
import { h } from "./h";
import { icon, type IconName } from "./icons";
import { openPanel } from "./panel";
import { stationTypeBenefit } from "./stationUpgrades";
import { strings } from "./strings";

const TYPE_ICONS: Record<StationType, IconName> = {
  depot: "depot",
  station: "station",
  terminal: "terminal",
};

const IMPROVEMENT_ICONS: Record<StationImprovementType, IconName> = {
  postOffice: "news",
  hotel: "hotel",
  warehouse: "warehouse",
  coldStorage: "snowflake",
  freightYard: "freightYard",
  livestockPens: "pens",
};

type HelpTab = "upgrades" | "money";

function upgradesBody(): Node[] {
  return [
    section(strings.help.upgrades.typesTitle, [
      h("div", { className: "help-intro" }, strings.help.upgrades.typesIntro),
      cardList(
        ...STATION_TYPES.map((type) =>
          cardRow({
            className: "help-row",
            thumb: icon(TYPE_ICONS[type], "icon-sm tone-brass"),
            title: strings.station.types[type],
            meta: stationTypeBenefit(type),
          }),
        ),
      ),
    ]),
    section(strings.help.upgrades.improvementsTitle, [
      cardList(
        ...STATION_IMPROVEMENT_TYPES.map((type) =>
          cardRow({
            className: "help-row",
            thumb: icon(IMPROVEMENT_ICONS[type], "icon-sm tone-brass"),
            title: strings.station.improvementNames[type],
            meta: strings.station.improvementBenefit[type],
          }),
        ),
        cardRow({
          className: "help-row",
          thumb: icon("waterTower", "icon-sm tone-brass"),
          title: strings.station.waterTowerBuilt,
          meta: strings.station.waterTowerBenefit,
        }),
        cardRow({
          className: "help-row",
          thumb: icon("shed", "icon-sm tone-brass"),
          title: strings.station.engineShedFree,
          meta: strings.station.engineShedBenefit,
        }),
      ),
    ]),
  ];
}

function moneyBody(): Node[] {
  return [
    section(strings.help.money.title, [
      cardList(
        ...strings.help.money.lines.map((line) =>
          cardRow({
            className: "help-row help-money-row",
            thumb: icon(line.icon as IconName, "icon-sm tone-brass"),
            title: line.text,
          }),
        ),
      ),
    ]),
  ];
}

export function openHelpPanel(container: HTMLElement, initial: HelpTab = "upgrades"): void {
  const render = (tab: HelpTab): void => {
    openPanel(container, {
      title: strings.help.title,
      thumb: icon("info"),
      tabs: tabs(
        [
          { id: "upgrades" as const, label: strings.help.tabs.upgrades, icon: "station" },
          { id: "money" as const, label: strings.help.tabs.money, icon: "coin" },
        ],
        tab,
        render,
      ),
      body: tab === "upgrades" ? upgradesBody() : moneyBody(),
      key: `help:${tab}`,
    });
  };
  render(initial);
}
