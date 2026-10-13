/** Timeline sentences (Phase 46); the words are in strings.ts. */
import type { HistoryEvent } from "../sim/history";
import { formatMoney } from "./format";
import { strings } from "./strings";

export function achievementName(id: string): string {
  return strings.achievements.items[id]?.name ?? id;
}

export function describeHistoryEvent(e: HistoryEvent): string {
  const t = strings.history.events;
  switch (e.kind) {
    case "firstTrain":
      return t.firstTrain;
    case "firstLine":
      return t.firstLine;
    case "track":
      return t.track(e.value ?? 0);
    case "panic":
      return t.panic(e.text ?? "");
    case "contract":
      return t.contract;
    case "contractFailed":
      return t.contractFailed;
    case "goal":
      return t.goal(strings.goals.tierNames[e.text as "bronze" | "silver" | "gold"] ?? "");
    case "recordRevenue":
      return t.recordRevenue(formatMoney(e.value ?? 0));
    case "avoidedBankruptcy":
      return t.avoidedBankruptcy;
    case "bankrupt":
      return t.bankrupt;
    case "achievement":
      return t.achievement(achievementName(e.text ?? ""));
    case "scenario":
      return e.text === "won" ? t.scenarioWon : t.scenarioLost;
  }
}
