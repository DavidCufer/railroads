/** News system balance numbers (SPEC §10.1: "News button with unread badge"). The item type and
 * push logic live in src/sim/news.ts. */

/** Capped history length — oldest items drop off once exceeded. */
export const NEWS_HISTORY_MAX = 200;

/** Repeats of the same news kind and place within this many days fold into one item ("×3"). */
export const NEWS_COLLAPSE_DAYS = 60;
/** A traffic jam near the same place is reported at most once per this many days. */
export const NEWS_JAM_MIN_DAYS = 30;
