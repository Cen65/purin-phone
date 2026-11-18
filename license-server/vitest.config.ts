/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // threads 池在进程内跑测试，不 fork 子进程，兼容受限沙箱环境
    pool: "threads",
  },
});
