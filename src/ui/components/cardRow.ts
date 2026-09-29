import { h } from "../h";
import { icon } from "../icons";

export interface CardRowOptions {
  thumb?: Node;
  title: string | Node;
  meta?: string | Node;
  /** Trailing value (string/node); `chevron` adds a chevron after it. */
  trailing?: string | Node | undefined;
  chevron?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  testId?: string;
}

/** STYLE §8.2 Card list row: ≥52px, thumb left, title + muted meta, trailing value/chevron. Tappable
 * (a real button) when `onClick` is given. */
export function cardRow(options: CardRowOptions): HTMLElement {
  const children: Array<Node | string | null> = [
    options.thumb ? h("div", { className: "card-thumb" }, options.thumb) : null,
    h(
      "div",
      { className: "card-text" },
      h("div", { className: "card-title" }, options.title),
      options.meta ? h("div", { className: "card-meta" }, options.meta) : null,
    ),
    options.trailing !== undefined
      ? h("div", { className: "card-trailing" }, options.trailing)
      : null,
    options.chevron ? icon("chevronRight", "icon-sm card-chevron") : null,
  ];
  const className = `card-row${options.className ? ` ${options.className}` : ""}`;
  const testProps = options.testId ? { "data-testid": options.testId } : {};
  return options.onClick
    ? h(
        "button",
        { className, disabled: options.disabled, onClick: options.onClick, ...testProps },
        ...children,
      )
    : h("div", { className, ...testProps }, ...children);
}

/** Groups card rows into one rounded list with hairline separators. */
export function cardList(...rows: Array<HTMLElement | null>): HTMLElement {
  return h("div", { className: "card-list" }, ...rows);
}
