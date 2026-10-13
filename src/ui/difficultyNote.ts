/** The New Game screen's one-line summary of a difficulty (Phase 47), built from `DIFFICULTY` so it never drifts. */
import { DIFFICULTY, type Difficulty } from "../data/finance";
import { strings } from "./strings";

const pct = (x: number): string => `${Math.round(x * 100)}%`;

export function difficultyNote(difficulty: Difficulty): string {
  const d = DIFFICULTY[difficulty];
  const n = strings.newGame.difficultyNote;
  const parts: string[] = [d.bankruptcy ? n.grace(d.graceMonths) : n.noBankruptcy];
  // The lender rule is the point of Hard; the plain rate says it for the others.
  if (Number.isFinite(d.riskDebtRatio)) parts.push(n.riskDebt(pct(d.riskDebtRatio)));
  else parts.push(n.loans(pct(d.interestRate)));
  if (d.revenueMult !== 1)
    parts.push(n.revenue(`${d.revenueMult > 1 ? "+" : "-"}${pct(Math.abs(d.revenueMult - 1))}`));
  const text = parts.join("; ");
  return `${strings.newGame.difficultyNames[difficulty]}: ${text}.`;
}
