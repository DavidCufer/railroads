import * as c from "../../src/sim/commands";
import { createGameState } from "../../src/sim/state";
import { netWorth } from "../../src/sim/finance/ledger";
const s = createGameState({ seed: 1, region: "central-eu", startYear: 1900, difficulty: "hard" });
console.log("cash", s.cash, "loans", s.finance.loans, "limit", c.creditLimit(s), "nw", netWorth(s));
