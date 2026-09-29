export type Tone = "go" | "signal" | "brass" | "steel" | "muted";

/** Modifier class for a tone (`tone-go` …); empty for no tone. */
export function toneClass(tone?: Tone): string {
  return tone ? ` tone-${tone}` : "";
}
