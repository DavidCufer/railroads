/** News system balance numbers (SPEC §10.1: "News button with unread badge"). The item type and
 * push logic live in src/sim/news.ts. */

/** Capped history length — oldest items drop off once exceeded. */
export const NEWS_HISTORY_MAX = 200;
