/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // threads 池在进程内跑测试，不 fork 子进程，兼容受限沙箱环境
    pool: "threads",
  },
});
