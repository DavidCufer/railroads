import { h } from "../h";
import { icon, type IconName } from "../icons";

export interface FooterButtonOptions {
  label?: string;
  icon?: IconName;
  kind?: "primary" | "secondary" | "danger";
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  title?: string;
}

/** STYLE §8.2 Footer v2 button: icon + short label. `kind` picks brass fill / outline / danger. An
 * icon-only button (no label) is a fixed 44px square and needs `ariaLabel`. */
export function footerButton(options: FooterButtonOptions): HTMLButtonElement {
  const kind = options.kind ?? "secondary";
  return h(
    "button",
    {
      className: `fbtn fbtn-${kind}${options.label ? "" : " fbtn-icon"}${options.className ? ` ${options.className}` : ""}`,
      disabled: options.disabled,
      "aria-label": options.ariaLabel,
      title: options.title,
      ...(options.onClick ? { onClick: options.onClick } : {}),
    },
    options.icon ? icon(options.icon, "icon-sm") : null,
    options.label ? h("span", null, options.label) : null,
  );
}
