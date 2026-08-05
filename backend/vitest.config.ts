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
    // mongodb-memory-server: several integration files each spin up their own
    // MongoMemoryServer. When Vitest runs them in parallel on a CI runner with
    // a cold binary cache, they race on the same download (lock + atomic rename)
    // and crash with "Cannot unlock file … 8.2.6.lock" / ENOENT rename errors.
    // Run files serially so only one binary download / instance lifecycle happens
    // at a time. Pure-unit files still run quickly; total wall-clock is dominated
    // by Mongo startup either way. fileParallelism=false + poolOptions forks keeps
    // each FILE in an isolated process (models/Mongo state never leaks across files).
    fileParallelism: false,
    pool: "forks",
    poolOptions: {
      forks: { singleFork: false },
    },
    // Mongo startup can exceed the default 10s hook timeout on a cold CI cache.
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
