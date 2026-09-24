import { defineConfig } from "vitest/config";

export default defineConfig({
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
