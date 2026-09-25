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

export interface LedgerPeriod {
  passengers: number;
  mail: number;
  freight: number;
  trainMaintenance: number;
  trackMaintenance: number;
  stationMaintenance: number;
  breakdownRepairs: number;
  interest: number;
  construction: number;
  rollingStock: number;
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
    startYear?: number;
    region?: string;
    difficulty?: string;
  }) => void;
  camera: {
    getZoom: () => number;
    setZoom: (zoom: number) => void;
    pan: (dxScreen: number, dyScreen: number) => void;
    setCenter: (worldX: number, worldY: number) => void;
    getCenter: () => { x: number; y: number };
  };
  getCash: () => number;
  getTrackEdges: () => Array<{
    a: number;
    b: number;
    double: boolean;
    electrified: boolean;
    bridge: string | null;
    cost: number;
  }>;
  tileScreenPoint: (x: number, y: number) => { x: number; y: number };
  setQuickBuild: (enabled: boolean) => void;
  getStations: () => Array<{
    id: number;
    tile: number;
    x: number;
    y: number;
    type: string;
    name: string;
    hasEngineShed: boolean;
    hasWaterTower: boolean;
    improvements: string[];
  }>;
  getStationEconomy: (stationId: number) => {
    supply: Partial<Record<string, number>>;
    acceptPoints: Partial<Record<string, number>>;
    accepts: string[];
  } | null;
  runDays: (n: number) => void;
  buildTrackPath: (path: number[]) => { ok: boolean; reason?: string };
  electrifyTrackPath: (path: number[]) => { ok: boolean; reason?: string };
  buildStation: (tile: number, type: string) => { ok: boolean; reason?: string };
  buyTrain: (
    stationId: number,
    locoModelId: string,
    cars: string[],
  ) => { ok: boolean; reason?: string; trainId?: number };
  setOrders: (
    trainId: number,
    orders: Array<{ stationId: number; rule: string }>,
  ) => { ok: boolean; reason?: string };
  sellTrain: (trainId: number) => { ok: boolean; reason?: string };
  getTrains: () => Array<{
    id: number;
    name: string;
    locoModelId: string;
    status: string;
    tile: number;
    x: number;
    y: number;
    speed: number;
    cars: string[];
    orders: Array<{ stationId: number; rule: string }>;
    currentOrderIndex: number;
  }>;
  getTrainCars: (trainId: number) => Array<{ cargoType: string; loaded: boolean }>;
  getStationCargo: (
    stationId: number,
  ) => Partial<Record<string, { amount: number; waitingDays: number }>> | null;
  getFinance: () => {
    loans: number;
    thisYear: LedgerPeriod;
    lastYear: LedgerPeriod;
    netWorthHistory: Array<{ tick: number; cash: number; netWorth: number }>;
    bankrupt: boolean;
  };
  takeLoan: (amount: number) => { ok: boolean; reason?: string };
  repayLoan: (amount: number) => { ok: boolean; reason?: string };
  debugPlaceIndustry: (tile: number, type: string) => number;
  debugPlaceCity: (tiles: number[], population: number) => number;
  getFloatingLabels: () => Array<{ stationTile: number; text: string; color: string }>;
  buildImprovement: (stationId: number, type: string) => { ok: boolean; reason?: string };
  civicInvestment: (cityId: number) => { ok: boolean; reason?: string };
  getCityGrowth: (cityId: number) => {
    points: number;
    monthlyScore: number;
    lastServed: boolean;
    lastCivicInvestmentTick: number | undefined;
  } | null;
  getOverlayState: () => {
    catchments: boolean;
    cargoHeatmap: boolean;
    heatmapCargo: string;
    trackType: boolean;
    trainProfit: boolean;
    miniMap: boolean;
  };
  setOverlay: (
    key: "catchments" | "cargoHeatmap" | "trackType" | "trainProfit" | "miniMap",
    enabled: boolean,
  ) => void;
  setHeatmapCargo: (cargo: string) => void;
  getMiniMapRect: () => { x: number; y: number; width: number; height: number };
  tapMiniMap: (x: number, y: number) => void;
}

declare global {
  interface Window {
    __game?: GameWindow;
  }
}
