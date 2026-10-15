/**
 * First-game hints (SPEC/PLAN Phase 11): a lightweight, dismissible tip sequence — build track,
 * build a station, buy a train, watch it earn — not a blocking tutorial. Shown once per browser/
 * device (a localStorage flag), skippable at any point, and never intercepts map input: it's a
 * small floating card, not an overlay over the canvas.
 */
import { h } from "./h";
import { locomotiveById } from "../data/trains";
import { strings } from "./strings";

const SEEN_KEY = "railroads.hintsSeen";

function hasSeenHints(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markHintsSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // localStorage unavailable — the hints will just show again next time, harmless.
  }
}

/** Mounts the hint card into `container` if this is the player's first game; no-ops otherwise. */
export function showFirstGameHints(
  container: HTMLElement,
  game: { difficulty: string; startYear: number },
): void {
  if (hasSeenHints()) return;
  const s = strings.hints;
  const steps = [...s.steps];
  // Hard starts with little cash and a $190k+ locomotive: say so before the player spends it all on track.
  if (game.difficulty === "hard") steps.push(s.hardMoney);
  // 1830–1837: only the weak Grasshopper/Planet are for sale (Playtest 2: "nothing to do" for 8 years).
  const norris = locomotiveById("norris-4-2-0");
  if (norris && game.startYear < norris.introYear) steps.push(s.earlyEngines(norris));
  let step = 0;
  const card = h("div", { className: "hint-card" });

  function render(): void {
    const isLast = step === steps.length - 1;
    card.replaceChildren(
      h("div", { className: "hint-card-text" }, steps[step] as string),
      h(
        "div",
        { className: "hint-card-actions" },
        h(
          "button",
          {
            className: "hint-card-btn hint-card-btn-skip",
            "aria-label": s.skipLabel,
            onClick: finish,
          },
          s.skip,
        ),
        h(
          "button",
          {
            className: "hint-card-btn hint-card-btn-next",
            "aria-label": isLast ? s.doneLabel : s.nextLabel,
            onClick: () => {
              if (isLast) {
                finish();
              } else {
                step++;
                render();
              }
            },
          },
          isLast ? s.done : s.next,
        ),
      ),
    );
  }

  function finish(): void {
    markHintsSeen();
    card.remove();
  }

  render();
  container.appendChild(card);
}

/** A one-off hint card (Phase 47: "add a train"), in the first-game hints' look. Skipped while the first-game tips are
 * on screen; returns false then so the caller can fall back to a toast. */
export function showHintCard(container: HTMLElement, text: string): boolean {
  if (container.querySelector(".hint-card")) return false;
  const card = h(
    "div",
    { className: "hint-card", "data-testid": "hint-card" },
    h("div", { className: "hint-card-text" }, text),
    h(
      "div",
      { className: "hint-card-actions" },
      h(
        "button",
        {
          className: "hint-card-btn hint-card-btn-next",
          "aria-label": strings.hints.nextLabel,
          onClick: () => card.remove(),
        },
        strings.hints.next,
      ),
    ),
  );
  container.appendChild(card);
  return true;
}
