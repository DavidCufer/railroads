import { CARGO, type CargoType } from "../data/cargo";
import { INDUSTRIES } from "../data/industries";
/**
 * News panel (SPEC §10.1: "News button with unread badge") — history of news items (capped at
 * `NEWS_HISTORY_MAX` in the sim), newest first. Also the shared formatter `formatNewsItem` used
 * both here and for toasts (src/main.ts drains `state.pendingNews` on every tick).
 */
import { locomotiveById } from "../data/trains";
import { clearAllNews } from "../sim/commands";
import { markAllNewsRead, unreadNewsCount, type NewsItem } from "../sim/news";
import type { GameState } from "../sim/state";
import { describeGoal } from "./goalStrings";
import { formatMoney } from "./format";
import { calendarFromTicks } from "../sim/time";
import { cardList, cardRow } from "./components/cardRow";
import { emptyState } from "./components/emptyState";
import type { Tone } from "./components/tone";
import { formatDate } from "./format";
import { footerButton } from "./components/footer";
import { h } from "./h";
import { locoArt } from "./trainArt";
import { icon, type IconName } from "./icons";
import { closePanel, openPanel } from "./panel";
import { trainWeightBridgeBlock } from "../sim/trains/bridgeBlock";
import { suggestPassingLoop } from "../sim/loopSuggest";
import { diagnoseJam } from "./jamDiagnosis";
import { openTrainPanel } from "./trainPanels";
import { strings } from "./strings";
import { nearestStationName } from "./placeNames";

function trainName(state: GameState, trainId: number): string {
  return state.trains.find((t) => t.id === trainId)?.name ?? strings.fallback.train;
}

function stationName(state: GameState, stationId: number): string {
  return state.stations.find((s) => s.id === stationId)?.name ?? strings.fallback.station;
}

function cityName(state: GameState, cityId: number): string {
  return state.cities.find((c) => c.id === cityId)?.name ?? strings.fallback.city;
}

function nearestCityName(state: GameState, x: number, y: number): string {
  let best: { name: string; d: number } | null = null;
  for (const c of state.cities) {
    const d = Math.hypot(c.anchorX - x, c.anchorY - y);
    if (!best || d < best.d) best = { name: c.name, d };
  }
  return best?.name ?? strings.fallback.place;
}

export function formatNewsItem(state: GameState, item: NewsItem): string {
  switch (item.kind) {
    case "newLocomotive":
      return strings.news.kinds.newLocomotive(
        locomotiveById(item.locoId)?.name ?? strings.fallback.locomotive,
      );
    case "breakdown":
      return strings.news.kinds.breakdown(trainName(state, item.trainId));
    case "washout":
      return strings.news.kinds.washout(nearestStationName(state, item.tile));
    case "locoWornOut":
      return strings.news.kinds.locoWornOut(trainName(state, item.trainId));
    case "slowOrders":
      return strings.news.kinds.slowOrders(item.edges, nearestStationName(state, item.tile));
    case "trafficJam": {
      const near = nearestStationName(state, item.tile);
      const jam = diagnoseJam(state, item.tile);
      if (jam.trains < 2) return strings.news.kinds.trafficJam(near);
      const loop = jam.singleTrack ? suggestPassingLoop(state, item.tile) : undefined;
      return jam.singleTrack
        ? strings.news.kinds.trafficJamSingle(
            jam.trains,
            near,
            loop ? formatMoney(loop.cost) : undefined,
          )
        : strings.news.kinds.trafficJamBusy(jam.trains, near);
    }
    case "noRoute": {
      const train = state.trains.find((t) => t.id === item.trainId);
      const loco = train && locomotiveById(train.locoModelId);
      const block =
        train &&
        loco &&
        trainWeightBridgeBlock(state, train, loco.weightClass, loco.type === "electric");
      if (block && loco)
        return strings.news.kinds.heavyBridge(loco.name, nearestStationName(state, block.a));
      return strings.news.kinds.noRoute(
        trainName(state, item.trainId),
        stationName(state, item.stationId),
      );
    }
    case "undeliverable":
      return strings.news.kinds.undeliverable(
        trainName(state, item.trainId),
        item.cars,
        CARGO[item.cargo].name.toLowerCase(),
      );
    case "stationDemolished":
      return strings.news.kinds.stationDemolished(item.name, item.trains);
    case "forcedLoan":
      return strings.news.kinds.forcedLoan(formatMoney(item.amount));
    case "insolvent":
      return strings.news.kinds.insolvent(item.monthsLeft);
    case "loansCalled":
      return strings.news.kinds.loansCalled(formatMoney(item.amount));
    case "startupCreditEnding":
      return strings.news.kinds.startupCreditEnding(item.months, formatMoney(item.limit));
    case "overLimit":
      return strings.news.kinds.overLimit(formatMoney(item.debt), formatMoney(item.limit));
    case "panic":
      return strings.news.kinds.panic(item.name, item.months, item.fuelRise ?? 0);
    case "fewStops":
      return strings.news.kinds.fewStops(trainName(state, item.trainId));
    case "cityGrowth":
      return strings.news.kinds.cityGrowth(
        cityName(state, item.cityId),
        strings.city.tierNames[item.tier],
      );
    case "civicInvestment":
      return strings.news.kinds.civicInvestment(cityName(state, item.cityId));
    case "cityFounded":
      return strings.news.kinds.cityFounded(cityName(state, item.cityId));
    case "discovery": {
      const industry = state.industries.find((i) => i.id === item.industryId);
      const cargo = industry
        ? (Object.keys(INDUSTRIES[industry.type].produces)[0] as CargoType | undefined)
        : undefined;
      return strings.news.kinds.discovery(
        cargo ? CARGO[cargo].name : "Resources",
        industry ? nearestCityName(state, industry.x, industry.y) : strings.fallback.place,
      );
    }
    case "competition":
      return strings.news.kinds.competition[item.mode];
    case "goalCompleted": {
      const goal = state.goals.find((g) => g.id === item.goalId);
      const description = goal ? describeGoal(state, goal) : strings.fallback.goal;
      return strings.news.kinds.goalCompleted(
        strings.goals.tierNames[item.tier],
        description,
        item.grant ? formatMoney(item.grant) : undefined,
      );
    }
  }
}

/** Tile a news item is about, for "tap to look" (discoveries, new/growing towns, washouts, jams), else null. */
export function newsFocusTile(state: GameState, item: NewsItem): { x: number; y: number } | null {
  const width = state.map.width;
  switch (item.kind) {
    case "discovery": {
      const industry = state.industries.find((i) => i.id === item.industryId);
      return industry ? { x: industry.x, y: industry.y } : null;
    }
    case "cityFounded":
    case "cityGrowth":
    case "civicInvestment": {
      const city = state.cities.find((c) => c.id === item.cityId);
      return city ? { x: city.anchorX, y: city.anchorY } : null;
    }
    case "washout":
    case "slowOrders":
    case "trafficJam":
      return { x: item.tile % width, y: Math.floor(item.tile / width) };
    default:
      return null;
  }
}

const NEWS_ICONS: Record<NewsItem["kind"], { icon: IconName; tone: Tone }> = {
  newLocomotive: { icon: "steam", tone: "brass" },
  breakdown: { icon: "wrench", tone: "signal" },
  washout: { icon: "water", tone: "signal" },
  slowOrders: { icon: "warning", tone: "signal" },
  locoWornOut: { icon: "wrench", tone: "signal" },
  trafficJam: { icon: "warning", tone: "signal" },
  noRoute: { icon: "warning", tone: "signal" },
  undeliverable: { icon: "warning", tone: "signal" },
  stationDemolished: { icon: "trash", tone: "brass" },
  fewStops: { icon: "warning", tone: "signal" },
  forcedLoan: { icon: "coin", tone: "signal" },
  insolvent: { icon: "warning", tone: "signal" },
  loansCalled: { icon: "coin", tone: "signal" },
  panic: { icon: "warning", tone: "signal" },
  startupCreditEnding: { icon: "coin", tone: "brass" },
  overLimit: { icon: "coin", tone: "signal" },
  cityGrowth: { icon: "city", tone: "go" },
  civicInvestment: { icon: "coin", tone: "go" },
  cityFounded: { icon: "village", tone: "go" },
  discovery: { icon: "coin", tone: "go" },
  goalCompleted: { icon: "trophy", tone: "brass" },
  competition: { icon: "warning", tone: "brass" },
};

export function openNewsPanel(
  container: HTMLElement,
  state: GameState,
  onChange: () => void = () => {},
  onFocus?: (tile: { x: number; y: number }) => void,
): void {
  const unreadFrom = state.newsReadUpTo;
  const items = [...state.news].reverse();
  const body: Node[] =
    items.length === 0
      ? [emptyState(strings.news.empty, "news")]
      : [
          cardList(
            ...items.map((item) => {
              const meta = NEWS_ICONS[item.kind];
              // Locomotive news (new model, a breakdown, no route) shows the engine's side view.
              const trainLoco =
                item.kind === "breakdown" ||
                item.kind === "noRoute" ||
                item.kind === "fewStops" ||
                item.kind === "undeliverable"
                  ? locomotiveById(
                      state.trains.find((t) => t.id === item.trainId)?.locoModelId ?? "",
                    )
                  : undefined;
              const loco = item.kind === "newLocomotive" ? locomotiveById(item.locoId) : trainLoco;
              const thumb = loco
                ? h("span", { className: "news-thumb-art" }, locoArt(loco, 30))
                : h("span", { className: `news-thumb tone-${meta.tone}` }, icon(meta.icon));
              const focusTile = onFocus ? newsFocusTile(state, item) : null;
              const editTrain =
                item.kind === "fewStops" && state.trains.some((t) => t.id === item.trainId)
                  ? item.trainId
                  : undefined;
              return cardRow({
                className: `news-item${item.id > unreadFrom ? " unread" : ""}${focusTile || editTrain !== undefined ? " tappable" : ""}`,
                ...(editTrain !== undefined
                  ? {
                      chevron: true,
                      onClick: () => {
                        closePanel();
                        openTrainPanel(container, state, editTrain);
                      },
                    }
                  : focusTile && onFocus
                    ? {
                        chevron: true,
                        onClick: () => {
                          closePanel();
                          onFocus(focusTile);
                        },
                      }
                    : {}),
                thumb,
                title:
                  formatNewsItem(state, item) +
                  ((item.count ?? 1) > 1 ? ` ${strings.news.times(item.count as number)}` : ""),
                meta: formatDate(calendarFromTicks(state.startYear, item.tick)),
              });
            }),
          ),
        ];

  markAllNewsRead(state);
  // Two-tap confirm, same style as Sell: the first tap only arms the button.
  let armed = false;
  const clearBtn = footerButton({
    icon: "trash",
    label: strings.news.clearAll,
    kind: "danger",
    className: "news-clear-btn btn-danger",
    disabled: items.length === 0,
    onClick: () => {
      if (!armed) {
        armed = true;
        const label = clearBtn.lastElementChild;
        if (label) label.textContent = strings.news.clearAllConfirm;
        return;
      }
      clearAllNews(state);
      onChange();
      openNewsPanel(container, state, onChange, onFocus);
    },
  });
  openPanel(container, {
    title: strings.news.title,
    thumb: icon("news"),
    body,
    footer: [clearBtn],
    key: "news",
  });
}

export interface NewsButtonController {
  root: HTMLElement;
  /** Takes the *current* `GameState` explicitly each call (rather than closing over one) so it
   * stays correct across `regenerate()`/new-game, which replaces `main.ts`'s `state` binding with
   * a fresh object entirely — a captured reference here would go stale. */
  refreshBadge: (state: GameState) => void;
}

/** Floating "News" button (SPEC §10.1, bottom-right alongside the Trains button) with an unread
 * count badge. Call `refreshBadge` whenever `state.news`/`newsReadUpTo` might have changed (new
 * items pushed, the panel just marked everything read, or a new game started). */
export function createNewsButton(
  container: HTMLElement,
  onClick: () => void,
): NewsButtonController {
  const badge = h("span", { className: "news-unread-badge" });
  const btn = h(
    "button",
    { className: "news-button", "aria-label": strings.news.button, onClick },
    icon("news"),
    badge,
  );
  container.appendChild(btn);

  function refreshBadge(state: GameState): void {
    const count = unreadNewsCount(state);
    badge.textContent = count > 0 ? String(Math.min(count, 99)) : "";
    badge.classList.toggle("visible", count > 0);
  }

  return { root: btn, refreshBadge };
}
