import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // The lib modules pull in the AgenC SDK/config graph (a heavy import).
    // Give the first-eval tests headroom beyond the 5s default.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
