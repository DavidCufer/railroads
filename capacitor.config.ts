import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.davidc.ironandsteam",
  appName: "Iron & Steam",
  webDir: "dist",
  // Release safety: never allow remote WebView inspection (Phase 71).
  android: { webContentsDebuggingEnabled: false },
};

export default config;
