import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    exclude: [
      ".claude/**",
      ".context/**",
      ".gstack/**",
      ".next/**",
      "e2e/**",
      "node_modules/**",
    ],
  },
});
