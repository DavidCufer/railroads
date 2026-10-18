/** Exploration E1: `PASSENGER_MODEL=m2 npx vitest run` runs the suite under another passenger model. */
import { setDefaultPassengerModel, type PassengerModel } from "../src/data/passengerModels";

const model = process.env["PASSENGER_MODEL"];
if (model) setDefaultPassengerModel(model as PassengerModel);
