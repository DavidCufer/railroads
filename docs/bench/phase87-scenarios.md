# Phase 87 scenario experiments (solver, Normal, start-up credit floor set to 0 via a local, unpushed env hook)

## sol-semmering-min0.txt
BEST semmering: {"id":"semmering","label":"stage 10 via Graz | stage 36 grow 4","status":"won","stars":1,"finishMonth":60,"finish":"1855-01","profit":49668,"spent":724847,"netWorth":295233,"note":" [too dear 294k] [too dear 297k] [too dear 297k] [too dear 297k] [too dear 297k] [too dear 297k] [too dear 297k] [too dear 297k] [too dear 297k] [too dear 297k] [too dear 297k] [too dear 297k] [too dear 297k] [too dear 300k] [too dear 300k] [too dear 300k] [too dear 300k] [too dear 300k] [too dear 300k] [too dear 300k] [too dear 300k] [too dear 300k] [too dear 300k] [too dear 300k] [too dear 300k] pr

## sol-transcontinental-min0.txt
BEST transcontinental: {"id":"transcontinental","label":"pre San Francisco link 36 | fast 4c x1 FL","status":"won","stars":2,"finishMonth":35,"finish":"1862-12","profit":42910,"spent":931575,"netWorth":380147,"note":" progress 0","strategy":{"engine":"fast","cars":4,"trains":[1],"fullLoad":true,"smelterPick":0,"label":"pre San Francisco link 36 | fast 4c x1 FL","pre":"San Francisco","stageMonth":36}}

## transcontinental, no start-up credit, deadline 1864 instead of 1866
BEST transcontinental: {"id":"transcontinental","label":"pre San Francisco link 36 | fast 4c x1 FL","status":"won","stars":2,"finishMonth":35,"finish":"1862-12","profit":42910,"spent":931575,"netWorth":380147,"note":" progress 0","strategy":{"engine":"fast","cars":4,"trains":[1],"fullLoad":true,"smelterPick":0,"label":"pre San Francisco link 36 | fast 4c x1 FL","pre":"San Francisco","stageMonth":36}}

## Strategist on the five scenarios, new rules (Semmering credit 400k, Transcontinental 0; Phase 87 step 3)
- semmering: won 2*, month 1 (71 of 72 months to spare) [credit 250k..400k all the same; lost at <=200k]
- transcontinental: LOST (0*) [also lost at credit 100k and 250k; won month 1 at >=350k]
- | coalTrieste | won | 2 (2) | 9 of 96 months to spare | 0.40 | **hard** |
- | panic1873 | won | 3 (3) | profit 1.42x the top star's bar | 1.20 | **fair** |
- | silverRush | won | 2 (3) | 30 of 132 months to spare | 1.84 | **hard** |

## Strategist on Hard with the new revenueMult 0.8 (strat80 rows) vs Normal Strategist (docs/bench/phase82.md), year-16 net worth $M
- 1870: Hard 6.2 and 13.8 (survive) vs Normal 40.5, 47.8, 40.6; 1930: Hard 2.4 and 1.8 (survive) vs Normal 15.5, 9.0, 10.0. Before the change Hard was 25.7-32.6 (1870) and 2.7-3.0 (1930).
