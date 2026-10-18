/** Exploration E1 (branch `explore-passengers`): the passenger demand models behind the `passengerModel` switch. */

/** m0 = the code of Phase 53C as it stands (reference).
 * m1 = m0 with a game passenger standing for `PASSENGER_PARTY_PEOPLE` people (fewer heads, each paying more).
 * m2 = direct trains only, one pile per station, riders split over the train's later stops when they board.
 * m3 = m2 plus towns reachable with one change (those people keep a fixed destination, as in m0). */
export type PassengerModel = "m0" | "m1" | "m2" | "m3";

export const PASSENGER_MODELS: readonly PassengerModel[] = ["m0", "m1", "m2", "m3"];

/** People one game passenger stands for in m1-m3 (a party / family / group booking). Demand is divided by it, a car
 * holds seats / it game passengers, and a delivered passenger pays it times the per-person fare, so a full car earns
 * exactly what it did and the economy does not move: only the numbers on screen shrink (a 15k town in 1900 sends ~30
 * parties a month to a typical neighbour, 1842 ~8). */
export const PASSENGER_PARTY_PEOPLE = 3;

/** Most changes of train a journey may need for its town to count towards a station's demand (m3). m2 is 0. */
export const M3_MAX_CHANGES = 1;

export const maxChangesOf = (model: PassengerModel): number =>
  model === "m2" ? 0 : model === "m3" ? M3_MAX_CHANGES : Infinity;

/** People per game passenger under `model` (1 for the reference model). */
export const partyOf = (model: PassengerModel | undefined): number =>
  model === undefined || model === "m0" ? 1 : PASSENGER_PARTY_PEOPLE;

/** Whether people wait in one pile per station and choose a destination among the train's later stops (m2, m3). */
export const usesPool = (model: PassengerModel | undefined): boolean => model === "m2" || model === "m3";
