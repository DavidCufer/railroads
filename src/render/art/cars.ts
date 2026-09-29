import type { CargoType } from "../../data/cargo";
import type { Pen } from "./draw";
import type { EraBucket } from "./livery";
export function carWidth(_c: CargoType, _e: EraBucket): number {
  return 36;
}
export function drawCar(_p: Pen, _c: CargoType, _e: EraBucket, _fill: number): void {}
