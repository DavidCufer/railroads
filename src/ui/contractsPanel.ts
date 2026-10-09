/**
 * Contracts panel (Phase 45): open offers with Accept / Later, accepted contracts with a progress bar and days left.
 * One line per contract; tap the line to look at the town or industry. All changes go through commands.
 */
import { MAX_ACTIVE } from "../data/contracts";
import { abandonContract, acceptContract, declineContract } from "../sim/commands";
import type { Contract } from "../sim/contracts/types";
import type { GameState } from "../sim/state";
import { HOURS_PER_DAY } from "../sim/time";
import { emptyState } from "./components/emptyState";
import { footerButton } from "./components/footer";
import { meter } from "./components/meter";
import { contractFocusTile, describeContract, rewardText } from "./contractStrings";
import { formatMoney } from "./format";
import { h } from "./h";
import { icon } from "./icons";
import { closePanel, openPanel } from "./panel";
import { strings } from "./strings";

const DAY_TICKS = HOURS_PER_DAY;

function daysUntil(state: GameState, tick: number): number {
  return Math.max(0, Math.ceil((tick - state.ticks) / DAY_TICKS));
}

function progressOf(c: Contract): { fraction: number; label: string } {
  if (c.kind === "connection") {
    return {
      fraction: c.reward > 0 ? (c.paid ?? 0) / c.reward : 0,
      label:
        (c.paid ?? 0) > 0
          ? strings.contracts.subsidyPaid(formatMoney(c.paid ?? 0), formatMoney(c.reward))
          : strings.contracts.notConnected,
    };
  }
  return {
    fraction: c.target > 0 ? Math.min(1, c.progress / c.target) : 0,
    label: `${Math.round((c.target > 0 ? Math.min(1, c.progress / c.target) : 0) * 100)} %`,
  };
}

export function openContractsPanel(
  container: HTMLElement,
  state: GameState,
  onChange: () => void = () => {},
  onFocus?: (tile: { x: number; y: number }) => void,
): void {
  const { offers, active } = state.contracts;
  const rerender = (): void => {
    onChange();
    openContractsPanel(container, state, onChange, onFocus);
  };

  function line(c: Contract, extra: Node[]): HTMLElement {
    const at = onFocus ? contractFocusTile(state, c) : null;
    return h(
      "div",
      { className: "contract-card", "data-contract": String(c.id) },
      h(
        at ? "button" : "div",
        {
          className: `contract-desc${at ? " tappable" : ""}`,
          ...(at && onFocus
            ? {
                onClick: () => {
                  closePanel();
                  onFocus(at);
                },
              }
            : {}),
        },
        describeContract(state, c),
      ),
      ...extra,
    );
  }

  const body: Node[] = [];
  if (offers.length > 0) {
    body.push(h("div", { className: "contract-section" }, strings.contracts.offers));
    for (const c of offers) {
      body.push(
        line(c, [
          h(
            "div",
            { className: "contract-meta" },
            `${rewardText(c)} · ${strings.contracts.expiresIn(daysUntil(state, c.expiresTick))}`,
          ),
          h(
            "div",
            { className: "contract-actions" },
            footerButton({
              kind: "primary",
              label: strings.contracts.accept,
              className: "contract-accept",
              disabled: active.length >= MAX_ACTIVE,
              onClick: () => {
                const r = acceptContract(state, c.id);
                if (r.ok) rerender();
              },
            }),
            footerButton({
              label: strings.contracts.decline,
              className: "contract-decline",
              onClick: () => {
                declineContract(state, c.id);
                rerender();
              },
            }),
          ),
        ]),
      );
    }
  }
  if (active.length > 0) {
    body.push(h("div", { className: "contract-section" }, strings.contracts.active));
    for (const c of active) {
      const p = progressOf(c);
      let armed = false;
      const giveUp = footerButton({
        kind: "danger",
        label: strings.contracts.abandon,
        className: "contract-abandon btn-danger",
        onClick: () => {
          if (!armed) {
            armed = true;
            const label = giveUp.lastElementChild;
            if (label) label.textContent = strings.contracts.abandonConfirm;
            return;
          }
          abandonContract(state, c.id);
          rerender();
        },
      });
      body.push(
        line(c, [
          meter(p.fraction, 1, "brass", p.label),
          h(
            "div",
            { className: "contract-meta" },
            `${rewardText(c)} · ${strings.contracts.daysLeft(daysUntil(state, c.deadlineTick ?? state.ticks))}`,
          ),
          h("div", { className: "contract-actions" }, giveUp),
        ]),
      );
    }
  }
  if (body.length === 0) body.push(emptyState(strings.contracts.none, "goals"));

  openPanel(container, {
    title: strings.contracts.title,
    thumb: icon("coin"),
    body,
    key: "contracts",
    live: () => openContractsPanel(container, state, onChange, onFocus),
  });
}

export interface ContractsButtonController {
  root: HTMLElement;
  refreshBadge: (state: GameState) => void;
}

/** Small button with a badge counting the open offers. */
export function createContractsButton(
  container: HTMLElement,
  onClick: () => void,
): ContractsButtonController {
  const badge = h("span", { className: "contracts-badge" });
  const btn = h(
    "button",
    { className: "contracts-button", "aria-label": strings.contracts.button, onClick },
    icon("coin"),
    badge,
  );
  container.appendChild(btn);
  return {
    root: btn,
    refreshBadge: (state) => {
      const n = state.contracts.offers.length;
      badge.textContent = n > 0 ? String(n) : "";
      badge.classList.toggle("visible", n > 0);
    },
  };
}
