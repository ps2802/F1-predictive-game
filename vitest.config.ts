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
      ".gstack/**",
      ".next/**",
      "node_modules/**",
    ],
  },
});
