import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    testTimeout: 15000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: [
        "src/routes/**/*.ts",
        "src/middleware/**/*.ts",
        "src/lib/auth.ts",
        "src/lib/notifications.ts",
      ],
      exclude: ["src/db/**", "src/test/**", "src/**/*.test.ts"],
    },
  },
});
