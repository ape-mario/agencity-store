import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@/city": resolve(__dirname, "src/app/city"),
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Stub the minimal browser globals Phaser's module-load polyfills need
    // (HTMLVideoElement, etc.) so systems tests can `import * as Phaser`.
    setupFiles: ["./vitest.setup.ts"],
    // The lib modules pull in the AgenC SDK/config graph (a heavy import).
    // Give the first-eval tests headroom beyond the 5s default.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
