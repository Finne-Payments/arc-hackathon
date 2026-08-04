import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    exclude: ["node_modules/**"],
    globals: false,
    // FIN-105: CI runs models-unplugged. No model container is up in the test
    // environment, so the model client must degrade rather than hang on fetch.
    env: { NODE_ENV: "test" },
  },
});
