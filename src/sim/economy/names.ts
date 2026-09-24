/** City name generator: combines syllable tables, avoids duplicates (SPEC §4.2 step 4). */
import { CITY_NAME_SYLLABLES } from "../../data/cities";
import { nextFloat, pick, type RngState } from "../rng";

function capitalize(s: string): string {
  return s.length === 0 ? s : (s[0] as string).toUpperCase() + s.slice(1);
}

function composeName(rng: RngState): string {
  const { starts, mids, ends } = CITY_NAME_SYLLABLES;
  const start = pick(rng, starts);
  const end = pick(rng, ends);
  // Avoid an awkward repeated root, e.g. "Ford" + "ford".
  if (start.toLowerCase().endsWith(end.toLowerCase().slice(0, 3))) {
    return `${start}${capitalize(pick(rng, ends))}`;
  }
  const useMid = nextFloat(rng) < 0.25;
  const mid = useMid ? pick(rng, mids) : "";
  return `${start}${mid}${end}`;
}

/** Generates `count` unique city names deterministically from the given RNG stream. */
export function generateCityNames(rng: RngState, count: number): string[] {
  const used = new Set<string>();
  const names: string[] = [];
  let attempts = 0;
  while (names.length < count && attempts < count * 50) {
    attempts++;
    const name = composeName(rng);
    if (used.has(name)) continue;
    used.add(name);
    names.push(name);
  }
  // Extremely unlikely (37*16 + 37*10*16 combinations far exceeds any realistic city count), but
  // guarantee termination and uniqueness even if the syllable space were ever exhausted.
  while (names.length < count) {
    names.push(`${composeName(rng)} ${names.length + 1}`);
  }
  return names;
}
