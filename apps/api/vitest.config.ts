import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // 共用同一台 PostgreSQL chiyan_test，必须串行 —— 否则多 worker 之间 TRUNCATE/INSERT 互相冲突。
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    fileParallelism: false,
  },
});
