/** Phase 48 raised the early engines' `maxCars`; the bench bots keep buying the train lengths they always did so that
 * their rows stay comparable with every earlier build (3/4/5/6 cars for the four engines whose limit moved). */
const LEGACY_MAX_CARS: Record<string, number> = {
  "grasshopper-0-4-0": 3,
  "planet-2-2-0": 4,
  "norris-4-2-0": 5,
  "american-4-4-0": 6,
};

export const maxCarsOf = (l: { id: string; maxCars: number }): number =>
  LEGACY_MAX_CARS[l.id] ?? l.maxCars;
