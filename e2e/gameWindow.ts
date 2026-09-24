/** Shared `window.__game` debug-hook typing for e2e tests (populated by `src/main.ts` under `?debug=1`). */
export interface CityInfo {
  id: number;
  name: string;
  tier: string;
  population: number;
  coastal: boolean;
  tiles: number[];
}

export interface IndustryInfo {
  id: number;
  type: string;
  x: number;
  y: number;
}

export interface GameWindow {
  getState: () => unknown;
  getMap: () => { width: number; height: number };
  getTicks: () => number;
  getCalendar: () => { year: number; month: number; day: number; hour: number };
  getCities: () => CityInfo[];
  getIndustries: () => IndustryInfo[];
  getCityWorldCenter: (id: number) => { x: number; y: number } | null;
  setSpeed: (speed: 0 | 1 | 2 | 4 | 8) => void;
  getSpeed: () => number;
  getAvgFrameMs: () => number;
  getAvgRenderMs: () => number;
  findRiverMouth: () => { x: number; y: number } | null;
  regenerate: (options: {
    seed: number;
    size?: string;
    waterLevel?: string;
    roughness?: string;
  }) => void;
  camera: {
    getZoom: () => number;
    setZoom: (zoom: number) => void;
    pan: (dxScreen: number, dyScreen: number) => void;
    setCenter: (worldX: number, worldY: number) => void;
  };
}

declare global {
  interface Window {
    __game?: GameWindow;
  }
}
