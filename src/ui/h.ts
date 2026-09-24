/**
 * Tiny DOM-building helper (SPEC §1: "Small helper h(tag, props, ...children) is fine").
 * No React/Vue — plain DOM + CSS overlaid on the canvas.
 */

export type Children = Array<Node | string | null | undefined | false>;

export type Props = {
  [key: string]: unknown;
} & {
  className?: string;
  style?: Partial<CSSStyleDeclaration>;
  onClick?: (e: MouseEvent) => void;
};

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: Children
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null) continue;
      if (key === "className") {
        el.className = value as string;
      } else if (key === "style") {
        Object.assign(el.style, value as Partial<CSSStyleDeclaration>);
      } else if (key.startsWith("on") && typeof value === "function") {
        el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      } else if (key === "text") {
        el.textContent = value as string;
      } else if (typeof value === "boolean") {
        if (value) el.setAttribute(key, "");
      } else {
        el.setAttribute(key, String(value));
      }
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return el;
}
