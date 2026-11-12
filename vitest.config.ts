import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    // The exam logic is framework-free (no DOM needed); timers, time and the network are injected or faked.
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
});
