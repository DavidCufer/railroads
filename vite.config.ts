import { defineConfig } from "vitest/config";

export default defineConfig({
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
  },
  build: {
    // PLAN Phase 12 release hardening: minified and source-map-free, explicitly rather than
    // relying on Vite's (currently matching) defaults — this is what `npx cap sync android` copies
    // straight into the APK's assets, so an unminified or sourcemapped build here ships full
    // readable source inside every APK, debug and release alike.
    minify: true,
    sourcemap: false,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
